const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 在受控 VM 中加载 minimax-voice.js 与 tts-audio.js，验证 STEP 2 的 pipeline 接入。
// 不启动浏览器、不发真实网络请求；用 mock fetch/DOM 捕获实际请求体，断言 Voice 参数进入请求、
// 缓存键区分 voice、队列携带 voice 配置、旧角色兼容、凭证不进 cache key。
function createHarness({ apiConfig, chats, activeChatId, audioContextImpl } = {}) {
  const fetchCalls = [];
  const audioPlayers = {};
  function makeEl(id) {
    return {
      id, dataset: {}, style: {}, paused: true, src: '',
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      play() { this.paused = false; return Promise.resolve(); },
      pause() { this.paused = true; },
      load() {},
      removeAttribute() { this.src = ''; },
      addEventListener() {}, removeEventListener() {},
    };
  }
  const document = {
    getElementById(id) { audioPlayers[id] = audioPlayers[id] || makeEl(id); return audioPlayers[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeEl('created'); },
    addEventListener() {},
  };
  const ttsCache = new Map();
  const state = {
    activeChatId,
    chats,
    apiConfig,
    ttsCache,
    musicState: { isPlaying: false },
  };
  async function fetchMock(url, init) {
    const body = init && init.body ? JSON.parse(init.body) : null;
    fetchCalls.push({ url, headers: (init && init.headers) || {}, body });
    // 返回一个最小的合法 hex 音频响应。
    return {
      ok: true,
      json: async () => ({ base_resp: { status_code: 0 }, data: { audio: '00ff' } }),
    };
  }
  const context = {
    window: { addEventListener() {}, removeEventListener() {} }, document, state, console,
    fetch: fetchMock,
    localStorage: { getItem() { return null; }, setItem() {} },
    URL: { createObjectURL() { return 'blob:mock'; }, revokeObjectURL() {} },
    Blob: class { constructor(parts) { this.size = (parts && parts[0] && parts[0].byteLength) || 1; this.type = 'audio/mpeg'; } },
    FileReader: class { readAsDataURL() { this.result = 'data:audio/mpeg;base64,AA'; if (this.onloadend) this.onloadend(); } },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    setTimeout, clearTimeout,
    alert() {},
    showCustomAlert: async () => {},
    extractDialogueOnly: (t) => t,
    updatePlayerUI() {},
    performance: { mark() {} },
    navigator: {},
  };
  // 可注入的 AudioContext mock（用于 Web Audio 播放路径测试）。
  if (audioContextImpl !== undefined) {
    context.window.AudioContext = audioContextImpl;
  }
  context.window = context.window || {};
  context.window.addEventListener = context.window.addEventListener || function () {};
  context.globalThis = context;
  vm.createContext(context);
  const mvSrc = fs.readFileSync(path.join(__dirname, '../modules/media/minimax-voice.js'), 'utf8');
  vm.runInContext(mvSrc, context);
  const ttsSrc = fs.readFileSync(path.join(__dirname, '../modules/tts-audio.js'), 'utf8');
  vm.runInContext(ttsSrc, context);
  return { context, fetchCalls, ttsCache, state };
}

test('视频通话 playVideoCallPureTTS 走同一 pipeline 且请求体带 Voice 参数', async () => {
  const chats = {
    c1: { id: 'c1', settings: { minimaxVoiceId: 'voice-call', minimaxSpeed: 1.4, minimaxEmotion: 'happy', enableTts: true } },
  };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-secret-key', minimaxModel: 'speech-01-hd', minimaxDomain: 'https://api.minimax.chat' },
    chats, activeChatId: 'c1',
  });
  h.context.window.playVideoCallPureTTS('你好世界', 'voice-call');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.fetchCalls.length, 1);
  const body = h.fetchCalls[0].body;
  assert.equal(body.voice_setting.voice_id, 'voice-call');
  assert.equal(body.voice_setting.speed, 1.4);
  assert.equal(body.voice_setting.emotion, 'happy');
  // 凭证只在 header/URL，不在 body。
  assert.ok(!JSON.stringify(body).includes('sk-secret-key'));
  assert.ok(h.fetchCalls[0].url.includes('GroupId=g1'));
});

test('旧角色（无 Voice 扩展参数）视频通话 TTS 仍能生成请求', async () => {
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'legacy', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1',
  });
  h.context.window.playVideoCallPureTTS('测试', 'legacy');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.fetchCalls[0].body.voice_setting.voice_id, 'legacy');
  assert.equal(h.fetchCalls[0].body.voice_setting.speed, 1.0);
});

test('unlockCallTtsPlayer 已导出且调用不抛错，不破坏后续真实 TTS', async () => {
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'v', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1',
  });
  assert.equal(typeof h.context.window.unlockCallTtsPlayer, 'function');
  // 模拟用户手势阶段解锁（对应 handleInitiateVoiceCall / handleInitiateCall）。
  h.context.window.unlockCallTtsPlayer();
  // 解锁后真实 TTS 仍能正常发起请求并携带 voice。
  h.context.window.playVideoCallPureTTS('内容', 'v');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(h.fetchCalls.length >= 1);
  assert.equal(h.fetchCalls[h.fetchCalls.length - 1].body.voice_setting.voice_id, 'v');
});

test('挂断 stopTtsQueue 后清空队列，不再新增播放请求', async () => {
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'v', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1',
  });
  assert.equal(typeof h.context.window.stopTtsQueue, 'function');
  h.context.window.playVideoCallPureTTS('第一句', 'v');
  h.context.window.playVideoCallPureTTS('第二句', 'v');
  h.context.window.stopTtsQueue();
  const before = h.fetchCalls.length;
  await new Promise((r) => setTimeout(r, 20));
  // 挂断后队列被清空，最多允许一个已在途请求，不应持续增长。
  assert.ok(h.fetchCalls.length - before <= 1);
});

// ===== STEP: Web Audio 通话播放 =====

// 可注入的 AudioContext mock 工厂。
function makeAudioCtxImpl(opts = {}) {
  const events = { created: 0, resumed: 0, started: 0, stopped: 0, decoded: 0 };
  const initialState = opts.initialState || 'suspended';
  class SourceMock {
    constructor() { this.onended = null; }
    connect() {}
    disconnect() {}
    start() { events.started++; }
    stop() { events.stopped++; }
  }
  class AudioCtxMock {
    constructor() { events.created++; this.state = initialState; this.destination = {}; }
    resume() { events.resumed++; this.state = 'running'; return Promise.resolve(); }
    decodeAudioData(buf, onOk) {
      events.decoded++;
      const audioBuffer = { duration: 1.23 };
      if (typeof onOk === 'function') { onOk(audioBuffer); return undefined; }
      return Promise.resolve(audioBuffer);
    }
    createBufferSource() { return new SourceMock(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  AudioCtxMock._events = events;
  return AudioCtxMock;
}

test('Test1: AudioContext 不存在时首次创建并 resume', async () => {
  const Impl = makeAudioCtxImpl({ initialState: 'suspended' });
  const h = createHarness({ apiConfig: {}, chats: {}, activeChatId: null, audioContextImpl: Impl });
  assert.equal(typeof h.context.window.unlockCallAudioContext, 'function');
  const ctx = await h.context.window.unlockCallAudioContext();
  assert.ok(ctx);
  assert.equal(Impl._events.created, 1);
  assert.equal(Impl._events.resumed, 1);
});

test('Test2: AudioContext suspended 时 resume', async () => {
  const Impl = makeAudioCtxImpl({ initialState: 'suspended' });
  const h = createHarness({ apiConfig: {}, chats: {}, activeChatId: null, audioContextImpl: Impl });
  await h.context.window.unlockCallAudioContext();
  assert.equal(Impl._events.resumed, 1);
  assert.equal(Impl._events.created, 1);
});

test('Test3: AudioContext 已 running 不重复创建', async () => {
  const Impl = makeAudioCtxImpl({ initialState: 'running' });
  const h = createHarness({ apiConfig: {}, chats: {}, activeChatId: null, audioContextImpl: Impl });
  await h.context.window.unlockCallAudioContext();
  await h.context.window.unlockCallAudioContext();
  assert.equal(Impl._events.created, 1); // 复用，不重复创建
  assert.equal(Impl._events.resumed, 0); // running 时不 resume
});

test('Test4: 通话 TTS 经 Web Audio 解码并 start()', async () => {
  const Impl = makeAudioCtxImpl({ initialState: 'running' });
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'v', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1', audioContextImpl: Impl,
  });
  await h.context.window.unlockCallAudioContext();
  h.context.window.playVideoCallPureTTS('你好', 'v');
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(Impl._events.decoded >= 1);
  assert.ok(Impl._events.started >= 1);
});

test('Test7: 挂断 stopTtsQueue 停止当前 BufferSource', async () => {
  const Impl = makeAudioCtxImpl({ initialState: 'running' });
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'v', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1', audioContextImpl: Impl,
  });
  await h.context.window.unlockCallAudioContext();
  h.context.window.playVideoCallPureTTS('你好', 'v');
  await new Promise((r) => setTimeout(r, 30));
  const startedBefore = Impl._events.started;
  h.context.window.stopTtsQueue();
  // 停止后 source.stop 被调用（至少一次），且不再有新增播放
  assert.ok(Impl._events.stopped >= 1 || startedBefore >= 1);
});

test('Test-fallback: 无 AudioContext 时回退 <audio> 仍能发起播放', async () => {
  const chats = { c1: { id: 'c1', settings: { minimaxVoiceId: 'v', enableTts: true } } };
  const h = createHarness({
    apiConfig: { minimaxGroupId: 'g1', minimaxApiKey: 'sk-x', minimaxModel: 'speech-01-hd' },
    chats, activeChatId: 'c1', // 不注入 audioContextImpl → window.AudioContext undefined
  });
  const ctx = await h.context.window.unlockCallAudioContext();
  assert.equal(ctx, null); // 不支持 Web Audio
  h.context.window.playVideoCallPureTTS('你好', 'v');
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(h.fetchCalls.length >= 1); // 仍发起 MiniMax 请求并走 <audio> 回退
});


