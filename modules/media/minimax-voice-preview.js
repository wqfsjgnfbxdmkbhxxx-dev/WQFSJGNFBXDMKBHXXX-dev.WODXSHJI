// ============================================================
// minimax-voice-preview.js — 角色 Voice ID 试听 (STEP 3A)
//
// 职责：在角色设置界面内，用当前填写的 Voice ID 直接合成一段固定测试文本并播放。
// 隔离原则：
//   - 不创建聊天消息、不写 chat.history、不调用 AI
//   - 不进入 ttsQueue / 不调用 playTtsAudio / playVideoCallPureTTS
//   - 不改变聊天/通话的 TTS 状态
//   - 使用独立的 Audio 实例播放，不复用聊天/通话播放器
// 安全：API Key / Group ID 仅在 fetch 的 header / URL 中使用，绝不进入请求体、
//       不进入角色配置、不写日志。BYOK 不变。
// ============================================================

(function () {
  'use strict';

  // 固定、简短的中文测试文本。
  const PREVIEW_TEXT = '你好，这是当前音色的试听。';

  function getEl(id) { return document.getElementById(id); }

  function setStatus(message, type) {
    const el = getEl('minimax-voice-preview-status');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = type === 'error'
      ? 'var(--danger-color, #ff3b30)'
      : type === 'success'
        ? 'var(--success-color, #34c759)'
        : 'var(--text-secondary)';
  }

  // 复用现有区域解析：优先自定义 Base URL(minimaxDomain)，否则按 provider。
  // cn → api.minimaxi.com（含 api.minimax.chat 历史回退）、global(io) → api.minimax.io。
  function resolveBaseUrl(apiConfig) {
    const cfg = apiConfig || {};
    if (window.MinimaxVoice && typeof window.MinimaxVoice.minimaxBaseUrls === 'function') {
      const urls = window.MinimaxVoice.minimaxBaseUrls(cfg);
      if (Array.isArray(urls) && urls.length) return urls[0];
    }
    const custom = (cfg.minimaxDomain || '').trim();
    if (custom) return custom.replace(/\/+$/, '');
    return 'https://api.minimax.chat';
  }

  // 独立试听播放器（懒创建），与聊天 #tts-audio-player / 通话 #call-tts-audio-player 隔离。
  let previewAudio = null;
  let previewObjectUrl = null;
  function getPreviewPlayer() {
    if (!previewAudio) previewAudio = new Audio();
    return previewAudio;
  }
  function revokePreviewUrl() {
    if (previewObjectUrl) {
      try { URL.revokeObjectURL(previewObjectUrl); } catch (_) {}
      previewObjectUrl = null;
    }
  }

  function hexToBytes(hex) {
    const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  // 从当前设置面板读取角色 Voice 配置（不落库，仅用于试听）。
  function readVoiceFromPanel() {
    const voice = {
      minimaxVoiceId: (getEl('ai-voice-id-input') && getEl('ai-voice-id-input').value.trim()) || '',
    };
    const speedEl = getEl('ai-voice-speed-input');
    if (speedEl && speedEl.value !== '') voice.minimaxSpeed = Number(speedEl.value);
    const langEl = getEl('ai-voice-lang-select');
    if (langEl && langEl.value) voice.ttsLanguage = langEl.value;
    return voice;
  }

  // MiniMax language_boost 映射（与 tts-audio.js 保持一致的最小子集）。
  const LANG_BOOST = {
    'zh-CN': 'Chinese', 'zh-HK': 'Chinese,Yue', 'en-US': 'English', 'ja-JP': 'Japanese',
    'ko-KR': 'Korean', 'de-DE': 'German', 'fr-FR': 'French', 'es-ES': 'Spanish',
    'it-IT': 'Italian', 'ru-RU': 'Russian', 'pt-BR': 'Portuguese', 'nl-NL': 'Dutch',
    'pl-PL': 'Polish', 'sv-SE': 'Swedish', 'tr-TR': 'Turkish', 'id-ID': 'Indonesian',
    'ms-MY': 'Malay', 'vi-VN': 'Vietnamese', 'th-TH': 'Thai', 'hi-IN': 'Hindi', 'ar-SA': 'Arabic',
  };

  async function previewCharacterVoice() {
    const state = window.state;
    const voice = readVoiceFromPanel();
    if (!voice.minimaxVoiceId) {
      setStatus('请先填写 Voice ID 后再试听。', 'error');
      return;
    }
    const apiConfig = (state && state.apiConfig) || {};
    if (!apiConfig.minimaxApiKey) {
      setStatus('尚未配置 MiniMax API Key，请在 API 设置中填写。', 'error');
      return;
    }

    const button = getEl('preview-character-voice-btn');
    if (button) button.disabled = true;
    setStatus('正在合成试听音频…');

    try {
      const model = apiConfig.minimaxSpeechModel || apiConfig.minimaxModel || 'speech-01-hd';
      const langBoost = voice.ttsLanguage ? (LANG_BOOST[voice.ttsLanguage] || 'auto') : undefined;
      // 复用 STEP 1/2 纯逻辑装配请求体（不含任何凭证）。
      const cleanedText = window.MinimaxVoice && window.MinimaxVoice.sanitizeMinimaxText
        ? window.MinimaxVoice.sanitizeMinimaxText(PREVIEW_TEXT, voice, model)
        : PREVIEW_TEXT;
      const body = window.MinimaxVoice.buildMinimaxRequestBody({
        model,
        text: cleanedText || PREVIEW_TEXT,
        stream: false,
        languageBoost: langBoost,
        voiceId: voice.minimaxVoiceId,
        voice,
        globalConfig: apiConfig,
      });

      const baseUrl = resolveBaseUrl(apiConfig);
      const groupQuery = apiConfig.minimaxGroupId
        ? `?GroupId=${encodeURIComponent(apiConfig.minimaxGroupId)}`
        : '';
      const response = await fetch(`${baseUrl}/v1/t2a_v2${groupQuery}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiConfig.minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let detail = `${response.status}`;
        try { const j = await response.json(); detail = (j.base_resp && j.base_resp.status_msg) || detail; } catch (_) {}
        throw new Error(`试听请求失败（${detail}）`);
      }
      const data = await response.json();
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`试听失败：${data.base_resp.status_msg || '未知错误'}`);
      }
      const audioHex = data.data && data.data.audio;
      if (!audioHex) throw new Error('MiniMax 未返回可播放的音频。');

      const blob = new Blob([hexToBytes(audioHex)], { type: 'audio/mpeg' });
      revokePreviewUrl();
      previewObjectUrl = URL.createObjectURL(blob);
      const player = getPreviewPlayer();
      player.src = previewObjectUrl;
      player.onended = revokePreviewUrl;
      player.onerror = revokePreviewUrl;
      await player.play();
      setStatus('试听音频已播放。', 'success');
    } catch (error) {
      // 试听失败不修改任何已保存的 Voice ID。
      setStatus((error && error.message) || '试听失败，请稍后重试。', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  // “应用到角色”：把当前输入框的 Voice ID 写入当前角色配置并落库。
  async function applyCharacterVoice() {
    const state = window.state;
    const input = getEl('ai-voice-id-input');
    if (!state || !state.activeChatId || !state.chats || !state.chats[state.activeChatId]) {
      setStatus('请先打开一个角色的设置。', 'error');
      return;
    }
    const chat = state.chats[state.activeChatId];
    const voiceId = input ? input.value.trim() : '';
    chat.settings = chat.settings || {};
    chat.settings.minimaxVoiceId = voiceId;
    try {
      if (window.db && window.db.chats) await window.db.chats.put(chat);
      setStatus(voiceId ? '已将 Voice ID 应用到当前角色。' : '已清空当前角色的 Voice ID。', 'success');
    } catch (error) {
      setStatus('保存 Voice ID 失败，请重试。', 'error');
    }
  }

  function bind() {
    const previewBtn = getEl('preview-character-voice-btn');
    const applyBtn = getEl('apply-character-voice-btn');
    if (previewBtn && !previewBtn.dataset.bound) {
      previewBtn.dataset.bound = '1';
      previewBtn.addEventListener('click', previewCharacterVoice);
    }
    if (applyBtn && !applyBtn.dataset.bound) {
      applyBtn.dataset.bound = '1';
      applyBtn.addEventListener('click', applyCharacterVoice);
    }
  }

  // 供测试与外部复用。
  window.minimaxVoicePreview = {
    PREVIEW_TEXT,
    previewCharacterVoice,
    applyCharacterVoice,
    readVoiceFromPanel,
    resolveBaseUrl,
    bind,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();


