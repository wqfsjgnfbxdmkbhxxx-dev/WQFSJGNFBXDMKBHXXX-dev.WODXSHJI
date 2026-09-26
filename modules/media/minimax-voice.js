// ============================================================
// minimax-voice.js — MiniMax Voice 纯逻辑层与配置模型 (STEP 1)
//
// 只包含无副作用的纯函数与可序列化配置模型：
//   - 不读取 DOM
//   - 不读取 localStorage / IndexedDB
//   - 不读取全局 state
//   - 不发起网络请求
//   - 不修改传入对象
//
// 供后续步骤（tts-audio 参数透传、音色库 UI、自动朗读等）复用。
// 安全约束：本模块只处理 voiceId 等非敏感标识；API Key / Group ID
//           属于 BYOK 本地凭证，绝不进入音色目录或任何返回结构。
// ============================================================

(function (root, factory) {
  const api = factory();
  // 浏览器：挂到 window，保持与现有经典脚本一致的全局暴露方式。
  if (typeof window !== 'undefined') {
    window.MinimaxVoice = api;
  }
  // Node 测试：CommonJS 导出，便于单元测试直接 require。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- Provider / Base URL 集中配置（避免多文件散落硬编码 URL） ----
  // 与现有 state.apiConfig.minimaxDomain 兼容：若用户配置了自定义域名，优先使用。
  const MINIMAX_PROVIDERS = Object.freeze({
    cn: Object.freeze(['https://api.minimaxi.com']),
    io: Object.freeze(['https://api.minimax.io']),
  });
  const DEFAULT_PROVIDER = 'cn';

  // MiniMax 官方支持的音效标签（speech-2.8 系列可用）。
  const MINIMAX_SOUND_TAGS = new Set([
    'laughs', 'chuckle', 'coughs', 'clear-throat', 'groans', 'breath',
    'pant', 'inhale', 'exhale', 'gasps', 'sniffs', 'sighs', 'snorts',
    'burps', 'lip-smacking', 'humming', 'hissing', 'emm', 'whistles',
    'sneezes', 'crying', 'applause',
  ]);

  // ---- 可序列化默认配置模型 ----
  // 全局：对应 state.apiConfig 中的 MiniMax 相关字段（不含凭证）。
  const DEFAULT_GLOBAL_CONFIG = Object.freeze({
    minimaxProvider: DEFAULT_PROVIDER,
    minimaxSpeechModel: 'speech-01-hd',
    minimaxAudioFormat: 'mp3',
    minimaxSampleRate: 32000,
    minimaxBitrate: 128000,
    minimaxChannel: 1,
    minimaxStreamEnabled: false,
    minimaxSubtitleEnabled: false,
    minimaxVoiceCatalog: [],
    minimaxVoiceCatalogUpdatedAt: 0,
  });

  // 角色级：对应 chat.settings 中的 MiniMax 相关字段。
  const DEFAULT_VOICE_CONFIG = Object.freeze({
    minimaxVoiceId: '',
    minimaxSpeed: 1.0,
    minimaxVolume: 1.0,
    minimaxPitch: 0,
    minimaxEmotion: '',
    languageBoost: '',
    minimaxPronunciationDict: '',
  });

  const VOICE_SOURCES = Object.freeze({
    OFFICIAL: 'official',
    CLONED: 'cloned',
    CUSTOM: 'custom',
  });

  // ---- 小工具（纯函数） ----
  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function toNumber(value, fallback) {
    if (isFiniteNumber(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function toTrimmedString(value, fallback = '') {
    if (typeof value === 'string') return value.trim();
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  }

  // ---- 1. Provider Base URLs ----
  // 返回按优先级排列的候选 base URL 数组（含 fallback）。不修改入参。
  function minimaxBaseUrls(globalConfig = {}) {
    const custom = toTrimmedString(globalConfig.minimaxDomain);
    if (custom) return [custom.replace(/\/+$/, '')];
    const provider = toTrimmedString(globalConfig.minimaxProvider) || DEFAULT_PROVIDER;
    return (MINIMAX_PROVIDERS[provider] || MINIMAX_PROVIDERS[DEFAULT_PROVIDER]).slice();
  }

  // ---- 2. 配置标准化（非破坏，返回新对象） ----
  function normalizeGlobalConfig(input = {}) {
    const source = input || {};
    const catalog = Array.isArray(source.minimaxVoiceCatalog)
      ? collectVoiceRecords(source.minimaxVoiceCatalog)
      : DEFAULT_GLOBAL_CONFIG.minimaxVoiceCatalog.slice();
    return {
      minimaxProvider: toTrimmedString(source.minimaxProvider) || DEFAULT_GLOBAL_CONFIG.minimaxProvider,
      minimaxSpeechModel:
        toTrimmedString(source.minimaxSpeechModel) ||
        toTrimmedString(source.minimaxModel) ||
        DEFAULT_GLOBAL_CONFIG.minimaxSpeechModel,
      minimaxAudioFormat: toTrimmedString(source.minimaxAudioFormat) || DEFAULT_GLOBAL_CONFIG.minimaxAudioFormat,
      minimaxSampleRate: toNumber(source.minimaxSampleRate, DEFAULT_GLOBAL_CONFIG.minimaxSampleRate),
      minimaxBitrate: toNumber(source.minimaxBitrate, DEFAULT_GLOBAL_CONFIG.minimaxBitrate),
      minimaxChannel: toNumber(source.minimaxChannel, DEFAULT_GLOBAL_CONFIG.minimaxChannel),
      minimaxStreamEnabled: Boolean(source.minimaxStreamEnabled),
      minimaxSubtitleEnabled: Boolean(source.minimaxSubtitleEnabled),
      minimaxVoiceCatalog: catalog,
      minimaxVoiceCatalogUpdatedAt: toNumber(source.minimaxVoiceCatalogUpdatedAt, DEFAULT_GLOBAL_CONFIG.minimaxVoiceCatalogUpdatedAt),
    };
  }

  function normalizeVoiceConfig(input = {}) {
    const source = input || {};
    return {
      // 兼容历史字段名：优先 minimaxVoiceId，其次旧的 voiceId。
      minimaxVoiceId: toTrimmedString(source.minimaxVoiceId || source.voiceId),
      // 兼容 XINTUK 的 settings.speed。
      minimaxSpeed: toNumber(source.minimaxSpeed != null ? source.minimaxSpeed : source.speed, DEFAULT_VOICE_CONFIG.minimaxSpeed),
      minimaxVolume: toNumber(source.minimaxVolume, DEFAULT_VOICE_CONFIG.minimaxVolume),
      minimaxPitch: toNumber(source.minimaxPitch, DEFAULT_VOICE_CONFIG.minimaxPitch),
      minimaxEmotion: toTrimmedString(source.minimaxEmotion),
      // 兼容 XINTUK 的 settings.language_boost。
      languageBoost: toTrimmedString(source.languageBoost || source.language_boost),
      minimaxPronunciationDict: typeof source.minimaxPronunciationDict === 'string'
        ? source.minimaxPronunciationDict
        : DEFAULT_VOICE_CONFIG.minimaxPronunciationDict,
    };
  }

  // ---- 3. 文本清洗 ----
  // 移除不适合朗读的标注文本，保留白名单音效标签与发音标注。纯函数，不改原文本。
  function looksLikePronunciation(content) {
    return /[0-9][1-6]?|[\u0250-\u02AF]|[ˈˌːɐɑɒæɓʙβɔɕçɗɖðʤəɚɛɜɞɟɡɢɣɦɧɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸɹɺɻʀʁɽɾʂʃʈʧʉʊʋⱱʌɣɯɲ]/u.test(content);
  }

  function sanitizeMinimaxText(text, voiceConfig = {}, model = '') {
    const config = voiceConfig || {};
    const modelName = toTrimmedString(model);
    const allowTags = config.minimaxSoundTagsEnabled !== false && modelName.startsWith('speech-2.8');
    const allowPronunciation = config.minimaxInlinePronunciationEnabled !== false;
    return String(text == null ? '' : text)
      .replace(/【.*?】/g, '')
      .replace(/（.*?）/g, '')
      .replace(/\((.*?)\)/g, (match, content) => {
        const normalized = String(content).trim().toLowerCase();
        if (allowTags && MINIMAX_SOUND_TAGS.has(normalized)) return `(${normalized})`;
        if (allowPronunciation && looksLikePronunciation(content)) return match;
        return '';
      })
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  // ---- 4. Audio Settings 构造 ----
  // 只输出 MiniMax audio_setting 需要的字段，带默认值，无 undefined 污染。不改入参。
  function buildMinimaxAudioSettings(globalConfig = {}, options = {}) {
    const config = globalConfig || {};
    const opts = options || {};
    const stream = Boolean(opts.stream != null ? opts.stream : config.minimaxStreamEnabled);
    // MiniMax 流式接口只保证 MP3 分片可直接拼接播放。
    const format = stream ? 'mp3' : (toTrimmedString(config.minimaxAudioFormat) || DEFAULT_GLOBAL_CONFIG.minimaxAudioFormat);
    return {
      format,
      sample_rate: toNumber(config.minimaxSampleRate, DEFAULT_GLOBAL_CONFIG.minimaxSampleRate),
      bitrate: toNumber(config.minimaxBitrate, DEFAULT_GLOBAL_CONFIG.minimaxBitrate),
      channel: toNumber(config.minimaxChannel, DEFAULT_GLOBAL_CONFIG.minimaxChannel),
    };
  }

  // ---- 5. Voice Record 标准化 ----
  // 把不同来源的音色记录统一为内部结构。绝不携带 apiKey / groupId 等凭证。
  function detectVoiceSource(rawSource, groupName) {
    const hint = `${toTrimmedString(rawSource)} ${toTrimmedString(groupName)}`.toLowerCase();
    if (hint.includes('clon')) return VOICE_SOURCES.CLONED;
    if (hint.includes('custom') || hint.includes('generation')) return VOICE_SOURCES.CUSTOM;
    return VOICE_SOURCES.OFFICIAL;
  }

  function normalizeVoiceRecord(voice, groupSource) {
    if (typeof voice === 'string') {
      const id = voice.trim();
      if (!id) return null;
      return { voiceId: id, name: id, source: detectVoiceSource(groupSource, groupSource), language: '', description: '' };
    }
    if (!voice || typeof voice !== 'object') return null;
    const voiceId = toTrimmedString(voice.voiceId || voice.voice_id || voice.id);
    if (!voiceId) return null;
    const name = toTrimmedString(voice.name || voice.voice_name) || voiceId;
    const source = toTrimmedString(voice.source)
      ? detectVoiceSource(voice.source, groupSource)
      : detectVoiceSource(groupSource, voice.category);
    const language = toTrimmedString(voice.language || voice.locale || voice.language_boost);
    const description = toTrimmedString(voice.description || voice.desc);
    // 仅保留非敏感展示字段，主动丢弃任何可能的凭证字段。
    return { voiceId, name, source, language, description };
  }

  function collectVoiceRecords(payload) {
    const named = [
      ['system_voice', VOICE_SOURCES.OFFICIAL],
      ['voice_cloning', VOICE_SOURCES.CLONED],
      ['voice_generation', VOICE_SOURCES.CUSTOM],
      ['music_generation', VOICE_SOURCES.CUSTOM],
      ['voices', ''],
    ];
    const groups = [];
    if (Array.isArray(payload)) {
      groups.push({ items: payload, source: '' });
    } else if (payload && typeof payload === 'object') {
      const containers = [payload, payload.data].filter(Boolean);
      for (const container of containers) {
        for (const [key, source] of named) {
          if (Array.isArray(container[key])) groups.push({ items: container[key], source });
        }
      }
    }
    const seen = new Set();
    const result = [];
    for (const group of groups) {
      for (const item of group.items) {
        const record = normalizeVoiceRecord(item, group.source);
        if (record && !seen.has(record.voiceId)) {
          seen.add(record.voiceId);
          result.push(record);
        }
      }
    }
    return result;
  }

  // ---- 6. Pronunciation Dictionary ----
  // 把用户多行文本词典转成 MiniMax 需要的 { tone: [...] }。空/非法返回 null。不改入参。
  function parsePronunciationDictionary(value) {
    if (value == null) return null;
    const lines = String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes('/'));
    return lines.length ? { tone: lines } : null;
  }

  // ---- 7. 场景无关的角色 Voice 解析入口 ----
  // 供普通聊天 / 语音聊天 / 视频通话 / 角色主动发言统一复用。
  // 只接收纯数据（character.settings），不读取 DOM、不假设调用场景。
  // 返回标准化的角色 Voice 配置，可直接喂给 TTS pipeline。
  function resolveCharacterVoiceSettings(character) {
    const settings = character && typeof character === 'object'
      ? (character.settings && typeof character.settings === 'object' ? character.settings : character)
      : {};
    return normalizeVoiceConfig(settings);
  }

  // ---- 8. MiniMax 请求体装配（纯函数，供聊天/通话统一复用） ----
  // 只组装非敏感参数；API Key / Group ID 由调用方在网络层单独处理，绝不进入这里。
  function buildMinimaxRequestBody(options = {}) {
    const opts = options || {};
    const voice = normalizeVoiceConfig(opts.voice || {});
    const voiceId = toTrimmedString(opts.voiceId || voice.minimaxVoiceId);
    const audioSettings = opts.audioSettings
      ? opts.audioSettings
      : buildMinimaxAudioSettings(opts.globalConfig || {}, { stream: opts.stream });
    const voiceSetting = {
      voice_id: voiceId,
      speed: toNumber(voice.minimaxSpeed, DEFAULT_VOICE_CONFIG.minimaxSpeed),
      vol: toNumber(voice.minimaxVolume, DEFAULT_VOICE_CONFIG.minimaxVolume),
      pitch: toNumber(voice.minimaxPitch, DEFAULT_VOICE_CONFIG.minimaxPitch),
    };
    const emotion = toTrimmedString(voice.minimaxEmotion);
    if (emotion) voiceSetting.emotion = emotion;
    const body = {
      model: toTrimmedString(opts.model) || DEFAULT_GLOBAL_CONFIG.minimaxSpeechModel,
      text: opts.text == null ? '' : String(opts.text),
      stream: Boolean(opts.stream),
      voice_setting: voiceSetting,
      audio_setting: audioSettings,
    };
    const languageBoost = toTrimmedString(opts.languageBoost || voice.languageBoost);
    if (languageBoost) body.language_boost = languageBoost;
    const dict = parsePronunciationDictionary(voice.minimaxPronunciationDict);
    if (dict) body.pronunciation_dict = dict;
    return body;
  }

  // 缓存签名：不同 Voice / 音频参数不会错误共享缓存。绝不含凭证。
  function voiceCacheSignature(voice, audioSettings = {}) {
    const v = normalizeVoiceConfig(voice || {});
    const a = audioSettings || {};
    return [
      v.minimaxSpeed, v.minimaxVolume, v.minimaxPitch,
      v.minimaxEmotion || '-', v.languageBoost || '-',
      a.format || 'mp3', a.sample_rate || '', a.bitrate || '', a.channel || '',
    ].join('_');
  }

  return {
    MINIMAX_PROVIDERS,
    MINIMAX_SOUND_TAGS,
    DEFAULT_PROVIDER,
    DEFAULT_GLOBAL_CONFIG,
    DEFAULT_VOICE_CONFIG,
    VOICE_SOURCES,
    minimaxBaseUrls,
    normalizeGlobalConfig,
    normalizeVoiceConfig,
    resolveCharacterVoiceSettings,
    sanitizeMinimaxText,
    buildMinimaxAudioSettings,
    buildMinimaxRequestBody,
    voiceCacheSignature,
    collectVoiceRecords,
    parsePronunciationDictionary,
  };
});
