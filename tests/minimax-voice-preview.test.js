const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 在受控 VM 中加载 minimax-voice.js + minimax-voice-preview.js，验证 STEP 3A：
// 角色 Voice ID 手动填写 / 试听 / 应用绑定，且与聊天/通话 TTS 完全隔离。
function createHarness({ apiConfig = {}, chat = null, voiceInput = '', speed, lang } = {}) {
  const fetchCalls = [];
  const played = [];
  const dbPuts = [];
  const els = {};
  function el(id, value) { els[id] = { id, value: value == null ? '' : value, textContent: '', style: {}, disabled: false, dataset: {}, addEventListener() {} }; return els[id]; }
  el('ai-voice-id-input', voiceInput);
  el('ai-voice-speed-input', speed == null ? '' : String(speed));
  el('ai-voice-lang-select', lang || '');
  el('preview-character-voice-btn');
  el('apply-character-voice-btn');
  el('minimax-voice-preview-status');

  const document = {
    getElementById(id) { return els[id] || null; },
    addEventListener() {}, readyState: 'complete',
  };
  const state = { activeChatId: chat ? chat.id : null, chats: chat ? { [chat.id]: chat } : {}, apiConfig };
  class AudioMock { constructor() { this.src = ''; } play() { played.push(this.src); return Promise.resolve(); } }
  async function fetchMock(url, init) {
    const body = init && init.body ? JSON.parse(init.body) : null;
    fetchCalls.push({ url, headers: (init && init.headers) || {}, body });
    return { ok: true, json: async () => ({ base_resp: { status_code: 0 }, data: { audio: '00ff' } }) };
  }
  const db = { chats: { put: async (c) => { dbPuts.push(JSON.parse(JSON.stringify(c))); } } };
  const context = {
    window: { state, db }, document, state, db, console,
    fetch: fetchMock, Audio: AudioMock,
    Blob: class { constructor() {} },
    URL: { createObjectURL() { return 'blob:preview'; }, revokeObjectURL() {} },
    Uint8Array, setTimeout, clearTimeout,
  };
  context.window.document = document;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/media/minimax-voice.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/media/minimax-voice-preview.js'), 'utf8'), context);
  return { context, fetchCalls, played, dbPuts, els, state, api: context.window.minimaxVoicePreview };
}

test('STEP3A: 空 Voice ID 不能试听并给出提示', async () => {
  const h = createHarness({ apiConfig: { minimaxApiKey: 'sk-x' }, chat: { id: 'c1', settings: {} }, voiceInput: '' });
  await h.api.previewCharacterVoice();
  assert.equal(h.fetchCalls.length, 0);
  assert.match(h.els['minimax-voice-preview-status'].textContent, /Voice ID/);
});

test('STEP3A: 试听使用当前 Voice ID 与 API 区域，且不含凭证在 body', async () => {
  const h = createHarness({
    apiConfig: { minimaxApiKey: 'sk-secret', minimaxGroupId: 'grp-1', minimaxProvider: 'cn' },
    chat: { id: 'c1', settings: {} }, voiceInput: 'voice-x', speed: 1.3,
  });
  await h.api.previewCharacterVoice();
  assert.equal(h.fetchCalls.length, 1);
  const call = h.fetchCalls[0];
  assert.equal(call.body.voice_setting.voice_id, 'voice-x');
  assert.equal(call.body.voice_setting.speed, 1.3);
  assert.ok(call.url.startsWith('https://api.minimaxi.com'));
  assert.ok(call.url.includes('GroupId=grp-1'));
  assert.ok(!JSON.stringify(call.body).includes('sk-secret'));
  assert.ok(!JSON.stringify(call.body).includes('grp-1'));
  assert.ok(h.played.length === 1);
});

test('STEP3A: Global(io) 与 Custom Base URL 正确解析', () => {
  const h = createHarness({});
  assert.equal(h.api.resolveBaseUrl({ minimaxProvider: 'io' }), 'https://api.minimax.io');
  assert.equal(h.api.resolveBaseUrl({ minimaxDomain: 'https://my.proxy.example/' }), 'https://my.proxy.example');
  const cn = h.api.resolveBaseUrl({ minimaxProvider: 'cn' });
  assert.equal(cn, 'https://api.minimaxi.com');
});

test('STEP3A: 应用到角色写入 chat.settings.minimaxVoiceId 并落库', async () => {
  const chat = { id: 'c1', settings: { minimaxVoiceId: 'old-voice' } };
  const h = createHarness({ apiConfig: {}, chat, voiceInput: 'new-voice' });
  await h.api.applyCharacterVoice();
  assert.equal(chat.settings.minimaxVoiceId, 'new-voice');
  assert.equal(h.dbPuts.length, 1);
  assert.equal(h.dbPuts[0].settings.minimaxVoiceId, 'new-voice');
});

test('STEP3A: 试听失败不覆盖已保存的 Voice ID', async () => {
  const chat = { id: 'c1', settings: { minimaxVoiceId: 'saved-voice' } };
  const h = createHarness({ apiConfig: { minimaxApiKey: 'sk-x' }, chat, voiceInput: 'typed-but-unsaved' });
  h.context.fetch = async () => { throw new Error('network down'); };
  await h.api.previewCharacterVoice();
  assert.equal(chat.settings.minimaxVoiceId, 'saved-voice');
  assert.equal(h.dbPuts.length, 0);
  assert.match(h.els['minimax-voice-preview-status'].textContent, /失败|错误|network/i);
});

test('STEP3A: 试听不创建聊天消息、不入 TTS 队列、不触发聊天/通话播放器', async () => {
  const chat = { id: 'c1', settings: {}, history: [] };
  let ttsQueueTouched = false;
  const h = createHarness({ apiConfig: { minimaxApiKey: 'sk-x' }, chat, voiceInput: 'voice-x' });
  h.context.window.playTtsAudio = () => { ttsQueueTouched = true; };
  h.context.window.playVideoCallPureTTS = () => { ttsQueueTouched = true; };
  await h.api.previewCharacterVoice();
  assert.equal(chat.history.length, 0);
  assert.equal(ttsQueueTouched, false);
  assert.equal(h.dbPuts.length, 0);
});

test('STEP3A: readVoiceFromPanel 读取输入且不含任何凭证', () => {
  const h = createHarness({ apiConfig: { minimaxApiKey: 'sk-x', minimaxGroupId: 'g' }, chat: { id: 'c1', settings: {} }, voiceInput: 'vid', speed: 1.1, lang: 'zh-CN' });
  const voice = h.api.readVoiceFromPanel();
  assert.equal(voice.minimaxVoiceId, 'vid');
  assert.equal(voice.minimaxSpeed, 1.1);
  const serialized = JSON.stringify(voice);
  assert.ok(!serialized.includes('sk-x'));
  assert.ok(!serialized.includes('minimaxApiKey'));
  assert.ok(!serialized.includes('minimaxGroupId'));
});

