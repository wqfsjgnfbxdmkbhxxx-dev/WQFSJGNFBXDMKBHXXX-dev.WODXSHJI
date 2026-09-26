// ============================================================
// tts-audio.js — TTS 语音播放、真实录音播放、双语翻译
// 来源：script.js 第 53313 ~ 53978 行
// ============================================================

  function playSilentAudio() {
    const silentPlayer = document.getElementById('silent-audio-player');
    if (silentPlayer) {

      const playPromise = silentPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(_ => {
          console.log("静音音频已启动，用于后台活动保活。");
        }).catch(error => {


          console.warn("无法自动播放静音音频（这在iOS首次加载时是正常现象）:", error);
        });
      }
    }
  }


  function stopSilentAudio() {
    const silentPlayer = document.getElementById('silent-audio-player');
    if (silentPlayer && !silentPlayer.paused) {
      silentPlayer.pause();
      silentPlayer.currentTime = 0;
      console.log("静音音频已停止。");
    }
  }


  function hexToUint8Array(hexString) {
    if (!hexString) return new Uint8Array();
    const arrayBuffer = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      arrayBuffer[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return arrayBuffer;
  }

  // 统一装配聊天/通话 MiniMax 请求体。优先复用 STEP 1 纯逻辑层；
  // 若 MinimaxVoice 未加载或 Voice 配置无效，回退到历史默认参数，保证旧角色继续正常说话。
  // 绝不在此拼接 API Key / Group ID —— 凭证仅在 fetch 的 header/URL 中由调用方处理。
  function buildChatTtsRequestBody({ model, text, languageBoost, voiceId, voice } = {}) {
    if (window.MinimaxVoice && typeof window.MinimaxVoice.buildMinimaxRequestBody === 'function') {
      try {
        return window.MinimaxVoice.buildMinimaxRequestBody({
          model,
          text,
          stream: false,
          languageBoost,
          voiceId,
          voice: voice || {},
          globalConfig: state.apiConfig || {},
        });
      } catch (voiceError) {
        console.warn('[TTS] Voice 请求体装配失败，回退默认参数:', voiceError);
      }
    }
    // 历史默认行为（向后兼容）。
    const body = {
      model,
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId || (voice && voice.minimaxVoiceId) || undefined,
        speed: 1.0,
        vol: 1.0,
        pitch: 0
      },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
    };
    if (languageBoost) body.language_boost = languageBoost;
    return body;
  }

  // --- TTS 播放队列（修复：前一条没读完就跳到最后一条的问题） ---
  const ttsQueue = [];
  let isTtsPlaying = false;

  // 参考并改写自 yxlforever/YYY：
  // https://github.com/yxlforever/YYY/commit/ece2d6bec633ced55c89af3871f96c97ebf3aa7e
  // 用途：限制仅用于加速播放的临时 TTS 内存缓存，并确保 Blob URL、请求与 FileReader 可释放。
  // 本实现不删除聊天、语音消息或任何持久化用户数据，也不改变原有 TTS 入口与配置。
  const TTS_CACHE_MAX = 15;
  let currentCallTtsObjectUrl = null;
  let currentChatTtsObjectUrl = null;
  let callTtsAbortController = null;
  const callTtsControllers = new Set();
  let callTtsGeneration = 0;
  let chatTtsGeneration = 0;
  let activeTtsCacheReader = null;

  // ---- 通话专用 Web Audio 上下文（Android 自动播放核心方案） ----
  // 用户点击“拨打/接听”的同步手势里创建并 resume 一个持久 AudioContext。
  // 之后 TTS 异步返回时用 decodeAudioData + BufferSource 播放，不再受 <audio>
  // autoplay 手势限制。<audio>#call-tts-audio-player 保留为不支持 Web Audio 时的回退。
  let callAudioContext = null;
  let activeCallAudioSource = null;

  function getCallAudioContextCtor() {
    return (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext) || null;
  }

  // 必须在用户手势同步调用栈中调用（拨打/接听入口）。返回 context 或 null。
  async function unlockCallAudioContext() {
    const Ctor = getCallAudioContextCtor();
    if (!Ctor) {
      console.warn('[通话TTS] 浏览器不支持 Web Audio，将回退到 <audio> 播放');
      return null;
    }
    try {
      if (!callAudioContext) {
        callAudioContext = new Ctor();
      }
      if (callAudioContext.state === 'suspended' && typeof callAudioContext.resume === 'function') {
        try { await callAudioContext.resume(); } catch (_) {}
      }
      return callAudioContext;
    } catch (error) {
      console.warn('[通话TTS] AudioContext 创建/resume 失败，将回退到 <audio> 播放:', error && error.name);
      callAudioContext = null;
      return null;
    }
  }

  function stopActiveCallAudioSource() {
    if (activeCallAudioSource) {
      try { activeCallAudioSource.onended = null; } catch (_) {}
      try { activeCallAudioSource.stop(); } catch (_) {}
      try { activeCallAudioSource.disconnect(); } catch (_) {}
      activeCallAudioSource = null;
    }
  }

  // 用 Web Audio 播放一段通话 TTS。成功返回 true（并在播放结束后自动推进队列）；
  // 若上下文不可用 / 解码失败 / generation 已变化，返回 false 让调用方走 <audio> 回退。
  // 注意：不复用外部 Blob 的 ArrayBuffer，独立从 bytes 复制，避免 detached buffer 问题。
  async function playViaWebAudio(audioBytes, generation) {
    if (!callAudioContext || callAudioContext.state === 'closed') return false;
    if (generation !== callTtsGeneration) return false;
    try {
      // 复制出独立 ArrayBuffer 供 decodeAudioData 使用。
      const arrayBuffer = audioBytes.buffer.slice(
        audioBytes.byteOffset,
        audioBytes.byteOffset + audioBytes.byteLength
      );
      const audioBuffer = await new Promise((resolve, reject) => {
        // 兼容旧回调式 decodeAudioData 与新 Promise 式。
        let settled = false;
        const p = callAudioContext.decodeAudioData(
          arrayBuffer,
          (buf) => { if (!settled) { settled = true; resolve(buf); } },
          (err) => { if (!settled) { settled = true; reject(err || new Error('decodeAudioData failed')); } }
        );
        if (p && typeof p.then === 'function') {
          p.then((buf) => { if (!settled) { settled = true; resolve(buf); } })
           .catch((err) => { if (!settled) { settled = true; reject(err); } });
        }
      });
      // 解码是异步的：解码完成后若已挂断 / generation 变化，则不播放。
      if (generation !== callTtsGeneration || !callAudioContext || callAudioContext.state === 'closed') {
        return true; // 视为已处理（丢弃旧音频），不走 <audio> 回退避免重复播放
      }
      stopActiveCallAudioSource();
      const source = callAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(callAudioContext.destination);
      activeCallAudioSource = source;
      source.onended = () => {
        if (activeCallAudioSource === source) {
          try { source.disconnect(); } catch (_) {}
          activeCallAudioSource = null;
        }
        // 仅当仍是当前通话世代时推进队列。
        if (generation === callTtsGeneration) processNextTts();
      };
      console.log('[通话TTS诊断] Web Audio 播放开始 | duration:', audioBuffer.duration);
      source.start(0);
      return true;
    } catch (error) {
      console.warn('[通话TTS] Web Audio 播放失败，回退 <audio>:', error && error.name, '|', error && error.message);
      return false;
    }
  }


  function revokeCallTtsUrl() {
    if (!currentCallTtsObjectUrl) return;
    try { URL.revokeObjectURL(currentCallTtsObjectUrl); } catch (error) { }
    currentCallTtsObjectUrl = null;
  }

  function revokeChatTtsUrl() {
    if (!currentChatTtsObjectUrl) return;
    try { URL.revokeObjectURL(currentChatTtsObjectUrl); } catch (error) { }
    currentChatTtsObjectUrl = null;
  }

  function trimTtsCache() {
    if (!state.ttsCache || typeof state.ttsCache.size !== 'number') return;
    while (state.ttsCache.size > TTS_CACHE_MAX) {
      const oldestKey = state.ttsCache.keys().next().value;
      state.ttsCache.delete(oldestKey);
    }
  }

  function stopTtsQueue() {
    callTtsGeneration++;
    if (callTtsAbortController) {
      callTtsAbortController.abort();
      callTtsAbortController = null;
    }
    // 中止所有进行中的（含预取）通话 TTS 请求，避免旧结果串入新通话。
    callTtsControllers.forEach((c) => { try { c.abort(); } catch (_) {} });
    callTtsControllers.clear();
    // 清除队列中残留的预取状态，防止旧 promise 被后续复用。
    for (const job of ttsQueue) {
      job.bytesPromise = null;
      job.bytesError = null;
    }
    ttsQueue.length = 0;
    isTtsPlaying = false;
    stopActiveCallAudioSource();
    const callPlayer = document.getElementById('call-tts-audio-player');
    if (callPlayer) {
      callPlayer.onended = null;
      callPlayer.onerror = null;
      callPlayer.pause();
      callPlayer.removeAttribute('src');
      try { callPlayer.load(); } catch (error) { }
    }
    revokeCallTtsUrl();
  }

  // 在用户点击“拨打语音/视频电话”的同步手势里调用，为通话专用播放器
  // #call-tts-audio-player 取得合法的自动播放资格。之后 AI 回复异步返回、
  // MiniMax 音频生成完成时，processNextTts 里的 callPlayer.play() 才不会被
  // 浏览器以 NotAllowedError 拒绝。用极短静音片段解锁后立即复位，不发声、
  // 不永久占用播放器、不影响后续真实 TTS 播放。
  let callTtsPlayerUnlocked = false;
  function unlockCallTtsPlayer() {
    const callPlayer = document.getElementById('call-tts-audio-player');
    console.log('[通话TTS诊断] unlockCallTtsPlayer 进入 | 播放器存在:', !!callPlayer);
    if (!callPlayer) return;
    let silentUrl = '';
    try {
      const sampleRate = 8000;
      const sampleCount = Math.floor(sampleRate * 0.03);
      const buffer = new ArrayBuffer(44 + sampleCount * 2);
      const view = new DataView(buffer);
      const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
      };
      writeText(0, 'RIFF');
      view.setUint32(4, 36 + sampleCount * 2, true);
      writeText(8, 'WAVE');
      writeText(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeText(36, 'data');
      view.setUint32(40, sampleCount * 2, true);
      const blob = new Blob([buffer], { type: 'audio/wav' });
      silentUrl = URL.createObjectURL(blob);
    } catch (error) {
      return;
    }
    const prevOnended = callPlayer.onended;
    const prevOnerror = callPlayer.onerror;
    callPlayer.onended = null;
    callPlayer.onerror = null;
    const cleanup = () => {
      try { callPlayer.pause(); } catch (_) {}
      try { callPlayer.removeAttribute("src"); callPlayer.load(); } catch (_) {}
      try { URL.revokeObjectURL(silentUrl); } catch (_) {}
      callPlayer.onended = prevOnended || null;
      callPlayer.onerror = prevOnerror || null;
    };
    try {
      callPlayer.src = silentUrl;
      const playPromise = callPlayer.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => { callTtsPlayerUnlocked = true; console.log('[通话TTS诊断] unlockCallTtsPlayer 解锁 play() 成功'); cleanup(); })
          .catch((error) => { console.warn('[通话TTS诊断] unlockCallTtsPlayer 解锁 play() 失败 |', error && error.name ? error.name : error, '|', error && error.message ? error.message : ''); cleanup(); });
      } else {
        callTtsPlayerUnlocked = true;
        console.log('[通话TTS诊断] unlockCallTtsPlayer 解锁完成（play 无 Promise）');
        cleanup();
      }
    } catch (error) {
      console.warn('[通话TTS诊断] unlockCallTtsPlayer 解锁异常 |', error && error.name, '|', error && error.message);
      cleanup();
    }
  }

  // 单条语音消息播放状态（用于同一条点两次=暂停/取消，退出聊天=停播）
  let currentTtsMessageKey = '';
  let currentTtsLoading = false;
  let ttsAbortController = null;

  /** 只停聊天语音条播放，不清通话 TTS 队列（打着电话切到别人聊天时用） */
  function stopChatMessageTtsOnly() {
    chatTtsGeneration++;
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    currentTtsMessageKey = '';
    currentTtsLoading = false;
    if (activeTtsCacheReader) {
      try { activeTtsCacheReader.abort(); } catch (error) { }
      activeTtsCacheReader = null;
    }
    const ttsPlayer = document.getElementById('tts-audio-player');
    if (ttsPlayer) {
      ttsPlayer.onended = null;
      ttsPlayer.onpause = null;
      ttsPlayer.pause();
      ttsPlayer.removeAttribute('src');
      try { ttsPlayer.load(); } catch (error) { }
      delete ttsPlayer.dataset.currentText;
      delete ttsPlayer.dataset.currentVoiceId;
      delete ttsPlayer.dataset.currentMessageKey;
    }
    revokeChatTtsUrl();
    document.querySelectorAll('.voice-play-btn').forEach(btn => { btn.textContent = '▶'; });
    document.querySelectorAll('.voice-message-body .loading-spinner').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.voice-message-body .voice-play-btn').forEach(btn => { btn.style.display = 'flex'; });
  }

  function stopAllTtsPlayback() {
    stopTtsQueue();
    stopChatMessageTtsOnly();
  }

  // 请求单条通话 TTS 的音频字节。成功返回 Uint8Array；
  // 因 generation 变化 / abort / 缺 apiKey|voiceId / 无 audioHex 返回 null（可安全跳过）；
  // 网络或 API 业务错误则抛出（供调用方决定重试）。绝不改动 MiniMax endpoint / 请求体格式。
  async function fetchCallTtsBytes(job, generation) {
    const { text, voiceId } = job;
    const voice = job.voice || null;
    const { minimaxGroupId, minimaxApiKey } = state.apiConfig;
    if (!minimaxApiKey || !voiceId) return null;
    if (generation !== callTtsGeneration) return null;
    const savedDomain = state.apiConfig.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat';
    const modelId = state.apiConfig.minimaxModel || "speech-01-hd";
    const controller = new AbortController();
    callTtsControllers.add(controller);
    try {
      const response = await fetch(`${savedDomain}/v1/t2a_v2?GroupId=${minimaxGroupId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildChatTtsRequestBody({
          model: modelId,
          text,
          languageBoost: (voice && voice.languageBoost) || undefined,
          voiceId,
          voice,
        })),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("API请求失败");
      const data = await response.json();
      if (controller.signal.aborted || generation !== callTtsGeneration) return null;
      if (data.base_resp && data.base_resp.status_code !== 0) throw new Error(data.base_resp.status_msg);
      const audioHex = data.data && data.data.audio;
      if (!audioHex) return null;
      return hexToUint8Array(audioHex);
    } finally {
      callTtsControllers.delete(controller);
    }
  }

  // 确保 job 的音频请求已发起（幂等：正在进行的 prefetch 不会被重复触发）。
  // 返回 resolve 为 Uint8Array 或 null 的 promise；失败时置 job.bytesError 并 resolve null。
  function ensureJobFetch(job, generation) {
    if (!job.bytesPromise) {
      job.bytesGeneration = generation;
      job.bytesPromise = fetchCallTtsBytes(job, generation).catch((error) => {
        job.bytesError = error;
        console.warn('[通话TTS] 预取/请求失败:', error && error.name, '|', error && error.message);
        return null;
      });
    }
    return job.bytesPromise;
  }

  // 后台预取队列中的下一条（最多 1 条）。generation 变化时不预取。
  function prefetchNextTts(generation) {
    if (generation !== callTtsGeneration) return;
    const next = ttsQueue[0];
    if (next && !next.bytesPromise) {
      ensureJobFetch(next, generation);
    }
  }

  async function processNextTts() {
    if (ttsQueue.length === 0) {
      isTtsPlaying = false;
      return;
    }

    isTtsPlaying = true;
    const job = ttsQueue.shift();
    const { text, voiceId } = job;
    const generation = callTtsGeneration;

    try {
      const { minimaxApiKey } = state.apiConfig;
      console.log('[通话TTS诊断] processNextTts 进入 | 剩余 queueLength:', ttsQueue.length, '| voiceIdExists:', !!voiceId, '| apiKey:', !!minimaxApiKey);
      if (!minimaxApiKey || !voiceId) {
        console.log('[通话TTS诊断] processNextTts 提前结束：缺少 apiKey / voiceId');
        processNextTts();
        return;
      }

      console.log(`[TTS队列] 正在朗读 (剩余${ttsQueue.length}条): ${text}`);

      // 取音频：优先使用已完成/进行中的预取；否则现在请求。
      let audioBytes = null;
      try {
        audioBytes = await ensureJobFetch(job, generation);
      } catch (_) {
        audioBytes = null;
      }
      // 预取曾失败（网络/API 错误）→ 真正轮到本条时重试一次全新请求，避免队列卡死。
      if (!audioBytes && job.bytesError && generation === callTtsGeneration) {
        job.bytesPromise = null;
        job.bytesError = null;
        try {
          audioBytes = await ensureJobFetch(job, generation);
        } catch (_) {
          audioBytes = null;
        }
      }

      // 挂断 / 新通话：丢弃旧结果，不播放、不推进新队列。
      if (generation !== callTtsGeneration) {
        console.log('[通话TTS诊断] 中止：generation 变化（挂断/切换）');
        return;
      }
      if (!audioBytes) {
        console.log('[通话TTS诊断] 本条无音频，跳到下一条');
        processNextTts();
        return;
      }

      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      console.log('[通话TTS诊断] 音频就绪 | size:', audioBlob.size);

      // 在开始播放当前条的同时，后台预取下一条（最多 1 条）。
      prefetchNextTts(generation);

      // 优先使用通话专用 AudioContext（Web Audio）播放，规避 Android <audio> autoplay 限制。
      // 若上下文不可用 / 解码失败，则回退到 <audio>#call-tts-audio-player 原路径。
      const playedViaWebAudio = await playViaWebAudio(audioBytes, generation);
      if (playedViaWebAudio) {
        return;
      }

      // ---- 回退路径：<audio>#call-tts-audio-player ----
      const audioUrl = URL.createObjectURL(audioBlob);
      revokeCallTtsUrl();
      currentCallTtsObjectUrl = audioUrl;

      const callPlayer = document.getElementById('call-tts-audio-player');
      console.log('[通话TTS诊断] 回退 <audio> | callPlayer 元素存在:', !!callPlayer);
      callPlayer.src = audioUrl;
      callPlayer.dataset.currentText = text;

      callPlayer.onended = () => {
        revokeCallTtsUrl();
        processNextTts();
      };
      callPlayer.onerror = () => {
        revokeCallTtsUrl();
        processNextTts();
      };

      try {
        await callPlayer.play();
        console.log('[通话TTS诊断] 回退 <audio> play() 成功');
      } catch (playError) {
        console.error('[通话TTS诊断] 回退 <audio> play() 失败 |', playError && playError.name, '|', playError && playError.message);
        throw playError;
      }

    } catch (error) {
      if (error.name !== 'AbortError' && generation === callTtsGeneration) {
        revokeCallTtsUrl();
        console.error("TTS生成失败:", error);
        processNextTts(); // 失败也继续下一条
      }
    }
  }

  // --- 视频/语音通话专用 TTS 播放函数（队列版） ---
  function playVideoCallPureTTS(text, voiceId) {
    console.log('[通话TTS诊断] playVideoCallPureTTS 进入 | textExists:', !!text, '| textLen:', text ? String(text).length : 0, '| voiceIdExists:', !!voiceId);
    // 1. 正则去除括号及括号内的内容
    let cleanText = text.replace(/(\[.*?\]|\(.*?\)|（.*?）|【.*?】)/g, '').trim();
    if (!cleanText) {
      console.log('[通话TTS诊断] 中止：cleanText 为空（原始文本被括号清洗规则清空）');
      return;
    }

    // 1.5. 处理"仅读取对话"功能
    if (state.activeChatId && state.chats[state.activeChatId]) {
      const chat = state.chats[state.activeChatId];
      if (chat.videoOptimization && chat.videoOptimization.ttsDialogueOnly) {
        cleanText = extractDialogueOnly(cleanText);
        console.log('[视频通话TTS] 仅读取对话模式：', cleanText);
      }
    }

    if (!cleanText) {
      console.log('[通话TTS诊断] 中止：cleanText 在仅读取对话处理后为空');
      return;
    }
    console.log('[通话TTS诊断] cleanTextLen:', cleanText.length);

    // 2. 检查配置
    const { minimaxGroupId, minimaxApiKey } = state.apiConfig;
    console.log('[通话TTS诊断] 配置检查 | groupId:', !!minimaxGroupId, '| apiKey:', !!minimaxApiKey, '| voiceId:', !!voiceId);
    if (!minimaxApiKey || !voiceId) {
      console.log('[通话TTS诊断] 中止：缺少 apiKey / voiceId，未入队');
      return;
    }

    // 3. 解析当前角色 Voice 配置（供队列 job 携带，统一走同一 TTS pipeline）。
    //    无 MinimaxVoice 或解析失败时 voice 保持 null，processNextTts 回退历史默认参数。
    let voice = null;
    try {
      if (window.MinimaxVoice && state.activeChatId && state.chats[state.activeChatId]) {
        voice = window.MinimaxVoice.resolveCharacterVoiceSettings(state.chats[state.activeChatId]);
      }
    } catch (voiceError) {
      console.warn('[视频通话TTS] Voice 配置解析失败，回退默认行为:', voiceError);
      voice = null;
    }

    // 4. 推入队列，串行处理（复用现有 ttsQueue，不新建队列）。
    ttsQueue.push({ text: cleanText, voiceId, voice });
    console.log('[通话TTS诊断] queue push | 当前 queueLength:', ttsQueue.length, '| voiceIdExists:', !!voiceId, '| isTtsPlaying:', isTtsPlaying);

    if (!isTtsPlaying) {
      processNextTts();
    }
  }
  // 播放真实录音
  async function playRealAudio(bodyElement) {
    const audioData = bodyElement.dataset.audio;
    const audioMime = bodyElement.dataset.audioMime || 'audio/webm';

    if (!audioData) {
      console.error('没有找到音频数据');
      return;
    }

    try {
      const audioDataDecoded = decodeURIComponent(audioData);

      // 创建音频播放器
      let realAudioPlayer = document.getElementById('real-audio-player');
      if (!realAudioPlayer) {
        realAudioPlayer = document.createElement('audio');
        realAudioPlayer.id = 'real-audio-player';
        realAudioPlayer.style.display = 'none';
        document.body.appendChild(realAudioPlayer);
      }

      // 如果正在播放同一条语音，暂停
      if (!realAudioPlayer.paused && realAudioPlayer.dataset.currentAudio === audioData) {
        realAudioPlayer.pause();
        return;
      }

      // 停止之前的播放
      realAudioPlayer.pause();

      // 设置新的音频源
      realAudioPlayer.src = audioDataDecoded;
      realAudioPlayer.dataset.currentAudio = audioData;
      realAudioPlayer.onended = () => {
        realAudioPlayer.removeAttribute('src');
        delete realAudioPlayer.dataset.currentAudio;
        try { realAudioPlayer.load(); } catch (error) { }
      };
      realAudioPlayer.onerror = realAudioPlayer.onended;

      // 播放音频
      await realAudioPlayer.play();
      console.log('播放真实录音');

    } catch (error) {
      console.error('播放录音失败:', error);
      alert('播放录音失败');
    }
  }

  async function playTtsAudio(bodyElement) {
    const bubble = bodyElement.closest('.message-bubble');
    const messageKey = (state.activeChatId || '') + '_' + (bubble?.dataset?.timestamp || '');

    let text = decodeURIComponent(bodyElement.dataset.text);

    // 1. 获取 Voice ID
    let voiceId = bodyElement.dataset.voiceId;
    // 新增：初始化语言设置，默认为普通话
    let ttsLanguage = 'zh-CN';

    if (state.activeChatId && state.chats[state.activeChatId]) {
      const chat = state.chats[state.activeChatId];
      if (!chat.isGroup && chat.settings.enableTts !== false) {
        // 优先使用标签上的ID，如果没有则用设置里的
        if (!voiceId) voiceId = chat.settings.minimaxVoiceId;
        // 【关键修复】获取用户在设置中选择的语言/方言
        if (chat.settings.ttsLanguage) {
          ttsLanguage = chat.settings.ttsLanguage;
        } else if (window.languagePolicy && chat.settings.enableBilingualMode) {
          const policy = window.languagePolicy.getPolicy(chat);
          const selectedLanguage = policy.ttsReadMode === 'translation'
            ? (policy.translationMode === 'interface'
              ? (localStorage.getItem('ephone-language') === 'en' ? 'en-US' : 'zh-Hans-CN')
              : policy.translationLanguage)
            : policy.outputLanguage;
          const languageMap = {
            'zh-Hans-CN': 'zh-CN', 'zh-Hant-TW': 'zh-CN', 'zh-Hant-HK': 'zh-HK',
            'yue-Hant-HK': 'zh-HK', 'yue-Hans-CN': 'zh-HK', 'en-GB': 'en-US',
            'ko-KR': 'ko-KR', 'ja-JP': 'ja-JP', 'fr-FR': 'fr-FR', 'de-DE': 'de-DE',
            'es-MX': 'es-ES', 'pt-PT': 'pt-BR'
          };
          ttsLanguage = languageMap[selectedLanguage] || selectedLanguage || ttsLanguage;
        }
      }

      // 处理"仅读取对话"功能
      if (chat.videoOptimization && chat.videoOptimization.ttsDialogueOnly) {
        // extractDialogueOnly 会返回引号内容或原文，不会返回空
        text = extractDialogueOnly(text);
        console.log('TTS仅读取对话模式：', text);
      }
    }

    if (!voiceId) {
      alert("错误：无法获取 Voice ID。请检查角色设置。");
      return;
    }

    const button = bodyElement.querySelector('.voice-play-btn');
    const spinner = bodyElement.querySelector('.loading-spinner');
    const ttsPlayer = document.getElementById('tts-audio-player');

    // 同一条消息点第二次：正在播放则暂停，正在请求则取消
    if (messageKey && messageKey === currentTtsMessageKey) {
      if (!ttsPlayer.paused && ttsPlayer.dataset.currentMessageKey === messageKey) {
        ttsPlayer.pause();
        currentTtsMessageKey = '';
        if (button) button.textContent = '▶';
        return;
      }
      if (currentTtsLoading && ttsAbortController) {
        ttsAbortController.abort();
        currentTtsMessageKey = '';
        currentTtsLoading = false;
        spinner.style.display = 'none';
        if (button) button.style.display = 'flex';
        return;
      }
    }

    ttsPlayer.pause();
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    chatTtsGeneration++;
    const generation = chatTtsGeneration;
    currentTtsLoading = false;
    revokeChatTtsUrl();
    document.querySelectorAll('.voice-play-btn').forEach(btn => btn.textContent = '▶');

    // 2. 检查缓存 (Key加入语言区分，防止切换方言后读到旧缓存)
    // 接入 STEP 1 Voice 配置：不同 voiceId / 语速 / 音量 / 音调 / 情绪 / audio 参数
    // 不会错误共享缓存；无 Voice 配置时签名退化为空，保持旧行为与旧缓存兼容。
    let chatVoiceSettings = null;
    let chatVoiceSignature = '';
    if (window.MinimaxVoice && state.activeChatId && state.chats[state.activeChatId]) {
      try {
        chatVoiceSettings = window.MinimaxVoice.resolveCharacterVoiceSettings(state.chats[state.activeChatId]);
        const previewAudio = window.MinimaxVoice.buildMinimaxAudioSettings(state.apiConfig || {});
        chatVoiceSignature = window.MinimaxVoice.voiceCacheSignature(chatVoiceSettings, previewAudio);
      } catch (voiceError) {
        console.warn('[TTS] Voice 配置解析失败，回退默认行为:', voiceError);
        chatVoiceSettings = null;
        chatVoiceSignature = '';
      }
    }
    const cacheKey = `tts_v2_${voiceId}_${ttsLanguage}_${chatVoiceSignature}_${text}`;

    let cachedAudio = state.ttsCache.get(cacheKey);
    if (cachedAudio) {
      console.log("从缓存播放 TTS...");
      // 命中后移到队尾，按真实使用顺序淘汰临时缓存。
      state.ttsCache.delete(cacheKey);
      state.ttsCache.set(cacheKey, cachedAudio);
      trimTtsCache();
      currentTtsMessageKey = messageKey;
      await playAudioFromData(cachedAudio.url, cachedAudio.type, text, voiceId, bodyElement, messageKey, () => { currentTtsMessageKey = ''; });
      return;
    }

    currentTtsMessageKey = messageKey;
    currentTtsLoading = true;
    const controller = new AbortController();
    ttsAbortController = controller;
    const signal = controller.signal;

    console.log(`请求 Minimax T2A v2... VoiceID: ${voiceId}, Language: ${ttsLanguage}`);
    if (button) button.style.display = 'none';
    spinner.style.display = 'block';

    const {
      minimaxGroupId,
      minimaxApiKey
    } = state.apiConfig;

    const languageMap = {
      'zh-CN': 'Chinese',
      'zh-HK': 'Chinese,Yue',   // 粤语特殊处理
      'en-US': 'English',
      'ja-JP': 'Japanese',
      'ko-KR': 'Korean',
      'de-DE': 'German',
      'fr-FR': 'French',
      'es-ES': 'Spanish',
      'it-IT': 'Italian',
      'ru-RU': 'Russian',
      'pt-BR': 'Portuguese',
      'nl-NL': 'Dutch',
      'pl-PL': 'Polish',
      'sv-SE': 'Swedish',
      'tr-TR': 'Turkish',
      'id-ID': 'Indonesian',
      'ms-MY': 'Malay',
      'vi-VN': 'Vietnamese',
      'th-TH': 'Thai',
      'hi-IN': 'Hindi',
      'ar-SA': 'Arabic'
    };

    // 获取对应的 boost 值，如果没有匹配到就默认 'auto'
    const boostValue = languageMap[ttsLanguage] || 'auto';

    // 2. 发送请求 (注意 language_boost 的位置)
    try {
      const savedDomain = state.apiConfig.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat';
      const minimaxBaseUrl = savedDomain;
      const modelId = state.apiConfig.minimaxModel || "speech-01-hd";

      const response = await fetch(`${minimaxBaseUrl}/v1/t2a_v2?GroupId=${minimaxGroupId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildChatTtsRequestBody({
          model: modelId,
          text,
          languageBoost: boostValue,
          voiceId,
          voice: chatVoiceSettings,
        })),
        signal
      });


      if (!response.ok) {
        let errorMsg = `API 失败: ${response.status}`;
        try {
          const errJson = await response.json();
          errorMsg += ` - ${errJson.base_resp?.status_msg || JSON.stringify(errJson)}`;
        } catch (e) { }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (signal.aborted || generation !== chatTtsGeneration) return;

      // 4. 检查业务状态码
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`API 错误: ${data.base_resp.status_msg}`);
      }

      // 5. 解析 Hex 音频数据
      const audioHex = data.data?.audio;
      if (!audioHex) throw new Error("API 未返回音频数据");

      const audioBytes = hexToUint8Array(audioHex);
      const audioBlob = new Blob([audioBytes], {
        type: 'audio/mpeg'
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      revokeChatTtsUrl();
      currentChatTtsObjectUrl = audioUrl;

      await playAudioFromData(audioUrl, 'audio/mpeg', text, voiceId, bodyElement, messageKey, () => {
        currentTtsMessageKey = '';
        revokeChatTtsUrl();
      });

      // 写入仅用于加速重复播放的临时缓存；旧项按插入顺序淘汰，不影响持久化消息。
      if (activeTtsCacheReader) {
        try { activeTtsCacheReader.abort(); } catch (error) { }
      }
      const reader = new FileReader();
      activeTtsCacheReader = reader;
      reader.onloadend = function () {
        if (activeTtsCacheReader === reader) activeTtsCacheReader = null;
        if (reader.error || generation !== chatTtsGeneration || typeof reader.result !== 'string') return;
        state.ttsCache.set(cacheKey, {
          url: reader.result,
          type: 'audio/mpeg'
        });
        trimTtsCache();
      }
      reader.readAsDataURL(audioBlob);

    } catch (error) {
      if (error.name === 'AbortError') return;
      if (generation !== chatTtsGeneration) return;
      if (generation === chatTtsGeneration) revokeChatTtsUrl();
      console.error("TTS 生成失败:", error);
      await showCustomAlert("语音生成失败", `错误: ${error.message}`);
    } finally {
      if (generation === chatTtsGeneration) currentTtsLoading = false;
      if (ttsAbortController === controller) ttsAbortController = null;
      spinner.style.display = 'none';
      if (button) button.style.display = 'flex';
    }
  }


  function playAudioFromData(audioSrc, audioType, text, voiceId, bodyElement, messageKey, onEndedCallback) {
    return new Promise((resolve, reject) => {
      const ttsPlayer = document.getElementById('tts-audio-player');

      ttsPlayer.src = audioSrc;
      ttsPlayer.type = audioType;
      ttsPlayer.dataset.currentText = text;
      ttsPlayer.dataset.currentVoiceId = voiceId;
      if (messageKey) ttsPlayer.dataset.currentMessageKey = messageKey;

      const playPromise = ttsPlayer.play();

      if (playPromise !== undefined) {
        playPromise.then(() => {
          const button = bodyElement.querySelector('.voice-play-btn');
          if (button) button.textContent = '❚❚';


          resolve();
        }).catch(error => {
          console.error("音频播放失败:", error);
          reject(error);
        });
      }

      ttsPlayer.onended = () => {
        const button = bodyElement.querySelector('.voice-play-btn');
        if (button) button.textContent = '▶';
        if (typeof onEndedCallback === 'function') onEndedCallback();
      };
      ttsPlayer.onpause = () => {
        const button = bodyElement.querySelector('.voice-play-btn');
        if (button) button.textContent = '▶';
      };
    });
  }




  function toggleVoiceTranscript(bodyElement) {
    const bubble = bodyElement.closest('.message-bubble');
    if (!bubble) return;

    const transcriptEl = bubble.querySelector('.voice-transcript');
    const text = decodeURIComponent(bodyElement.dataset.text);

    if (transcriptEl.style.display === 'block') {

      transcriptEl.style.display = 'none';
    } else {
      // 【双语模式】检查是否有原始双语内容
      const originalContent = bodyElement.dataset.originalContent;
      
      if (originalContent) {
        // 有双语内容：显示角色原文与目标译文。
        const decodedOriginal = decodeURIComponent(originalContent);
        const languageParts = window.languagePolicy
          ? window.languagePolicy.splitContent(decodedOriginal)
          : null;
        const foreignText = languageParts
          ? languageParts.sourceText
          : decodedOriginal.replace(/[〖【][^〗】]*[〗】]/g, '').trim();
        const translationMatches = languageParts ? null : decodedOriginal.match(/[〖【]\s*([^〗】]+?)\s*[〗】]/g);
        const translation = languageParts
          ? languageParts.translationText
          : (translationMatches || []).map(m => m.replace(/[〖【〗】]/g, '').trim()).filter(Boolean).join(' ');
        
        // 构建显示内容：外语 + 换行 + 中文翻译
        if (translation) {
          transcriptEl.innerHTML = `
            <div style="margin-bottom: 6px;">${foreignText}</div>
            <div style="color: var(--text-secondary); font-size: 0.92em; opacity: 0.85; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 6px; margin-top: 6px;">${translation}</div>
          `;
        } else {
          // 没有找到翻译，只显示外语
          transcriptEl.textContent = foreignText;
        }
      } else {
        // 没有双语内容，正常显示
        transcriptEl.textContent = text;
      }
      
      transcriptEl.style.display = 'block';
    }
  }

  // 双语翻译切换函数
  function toggleBilingualTranslation(bubble, chat) {
    const originalContent = bubble.dataset.originalContent;
    if (!originalContent) return; // 没有双语内容
    
    const isShowingTranslation = bubble.dataset.showingTranslation === 'true';
    const contentEl = bubble.querySelector('.content');
    const displayMode = chat.settings.bilingualDisplayMode || 'outside';
    
    // 检查是否是语音消息
    const isVoiceMessage = bubble.classList.contains('is-voice-message');
    
    if (isShowingTranslation) {
      // 隐藏翻译
      if (isVoiceMessage) {
        // 语音消息：在 voice-transcript 区域隐藏翻译
        const transcriptEl = bubble.querySelector('.voice-transcript');
        if (transcriptEl) {
          transcriptEl.textContent = '';
          transcriptEl.style.display = 'none';
        }
      } else {
        // 文本消息：原有逻辑
        if (displayMode === 'inside') {
          // 内部模式：恢复只显示外语
          const englishOnly = originalContent.replace(/[〖【][^〗】]*[〗】]/g, '');
          contentEl.innerHTML = parseMarkdown(englishOnly).replace(/\n/g, '<br>');
        } else {
          // 外部模式：移除翻译元素（从wrapper中移除）
          const contentRow = bubble.closest('.message-content-row');
          const wrapper = contentRow ? contentRow.parentElement : null;
          if (wrapper) {
            const transEl = wrapper.querySelector('.translation-bubble');
            if (transEl) transEl.remove();
          }
        }
      }
      bubble.dataset.showingTranslation = 'false';
    } else {
      // 显示翻译
      const translation = extractBilingualTranslation(originalContent, bubble);
      if (!translation) {
        console.warn('[双语模式] 未找到翻译内容，AI可能未按格式输出');
        return;
      }
      
      if (isVoiceMessage) {
        // 语音消息：在 voice-transcript 区域显示翻译
        const transcriptEl = bubble.querySelector('.voice-transcript');
        if (transcriptEl) {
          transcriptEl.textContent = `翻译：${translation}`;
          transcriptEl.style.display = 'block';
          transcriptEl.style.marginTop = '8px';
          transcriptEl.style.fontSize = '13px';
          transcriptEl.style.color = 'var(--text-secondary)';
          transcriptEl.style.opacity = '0.85';
        }
      } else {
        // 文本消息：原有逻辑
        if (displayMode === 'inside') {
          // 内部模式：外语 + 翻译（用换行分隔）
          const englishOnly = originalContent.replace(/[〖【][^〗】]*[〗】]/g, '');
          contentEl.innerHTML = parseMarkdown(englishOnly).replace(/\n/g, '<br>') + 
            '<br><span style="color: var(--text-secondary); font-size: 0.95em;">' + 
            translation + '</span>';
        } else {
          // 外部模式：在wrapper中添加翻译气泡（作为contentRow的兄弟元素）
          const contentRow = bubble.closest('.message-content-row');
          const wrapper = contentRow ? contentRow.parentElement : null;
          if (wrapper) {
            const transEl = document.createElement('div');
            transEl.className = 'translation-bubble';
            transEl.textContent = translation;
            transEl.dataset.linkedBubble = bubble.dataset.timestamp || Date.now();
            
            // 添加到wrapper的末尾（contentRow下方）
            wrapper.appendChild(transEl);
          }
        }
      }
      bubble.dataset.showingTranslation = 'true';
    }
  }

  // 提取双语翻译内容
  function extractBilingualTranslation(content, bubble) {
    // 检查缓存
    if (bubble.dataset.cachedTranslation) {
      return bubble.dataset.cachedTranslation;
    }
    
    if (window.languagePolicy) {
      const translation = window.languagePolicy.splitContent(content).translationText;
      if (!translation) return null;
      bubble.dataset.cachedTranslation = translation;
      return translation;
    }
    
    // 【预处理】清理可能的隐藏字符和统一符号
    let cleanedContent = content
      // 清理零宽字符
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 统一全角括号为〖〗
      .replace(/【/g, '〖')
      .replace(/】/g, '〗')
      // 清理可能的多余空格
      .trim();
    
    console.log('[双语调试] 清理后内容:', cleanedContent);
    
    // 【增强正则】支持多种格式
    // 1. 标准格式：〖中文〗
    // 2. 带空格：〖 中文 〗
    // 3. 换行格式：\n〖中文〗
    const matches = cleanedContent.match(/[〖【]\s*([^〗】]+?)\s*[〗】]/g);
    
    console.log('[双语调试] 匹配结果:', matches);
    
    if (!matches || matches.length === 0) {
      console.warn('[双语调试] 未匹配到翻译内容！');
      return null;
    }
    
    // 提取括号内的内容
    const translation = matches
      .map(m => m.replace(/[〖【〗】]/g, '').trim())
      .filter(t => t.length > 0)
      .join(' ');
    
    console.log('[双语调试] 提取的翻译:', translation);
    
    // 缓存结果
    bubble.dataset.cachedTranslation = translation;
    
    return translation;
  }

  // ========== 全局暴露 ==========
  window.playTtsAudio = playTtsAudio;
  window.playRealAudio = playRealAudio;
  window.playSilentAudio = playSilentAudio;
  window.stopSilentAudio = stopSilentAudio;
  window.stopTtsQueue = stopTtsQueue;
  window.unlockCallTtsPlayer = unlockCallTtsPlayer;
  window.unlockCallAudioContext = unlockCallAudioContext;
  window.stopChatMessageTtsOnly = stopChatMessageTtsOnly;
  window.stopAllTtsPlayback = stopAllTtsPlayback;
  window.playVideoCallPureTTS = playVideoCallPureTTS;
  window.toggleVoiceTranscript = toggleVoiceTranscript;
  window.toggleBilingualTranslation = toggleBilingualTranslation;

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    stopAllTtsPlayback();
    stopSilentAudio();
    const realAudioPlayer = document.getElementById('real-audio-player');
    if (realAudioPlayer) {
      realAudioPlayer.pause();
      realAudioPlayer.removeAttribute('src');
      delete realAudioPlayer.dataset.currentAudio;
      try { realAudioPlayer.load(); } catch (error) { }
    }
  });
