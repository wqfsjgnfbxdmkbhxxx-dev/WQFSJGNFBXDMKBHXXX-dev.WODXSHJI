const test = require('node:test');
const assert = require('node:assert/strict');
const mv = require('../modules/media/minimax-voice');

// 1. 默认 Voice / 全局配置标准化
test('normalizeVoiceConfig 提供完整默认值', () => {
  const config = mv.normalizeVoiceConfig({});
  assert.equal(config.minimaxVoiceId, '');
  assert.equal(config.minimaxSpeed, 1.0);
  assert.equal(config.minimaxVolume, 1.0);
  assert.equal(config.minimaxPitch, 0);
  assert.equal(config.minimaxEmotion, '');
  assert.equal(config.languageBoost, '');
  assert.equal(config.minimaxPronunciationDict, '');
});

test('normalizeGlobalConfig 提供完整默认值且不含凭证字段', () => {
  const config = mv.normalizeGlobalConfig({});
  assert.equal(config.minimaxProvider, 'cn');
  assert.equal(config.minimaxSpeechModel, 'speech-01-hd');
  assert.equal(config.minimaxAudioFormat, 'mp3');
  assert.equal(config.minimaxSampleRate, 32000);
  assert.equal(config.minimaxStreamEnabled, false);
  assert.deepEqual(config.minimaxVoiceCatalog, []);
  assert.ok(!('minimaxApiKey' in config));
  assert.ok(!('minimaxGroupId' in config));
});

// 2. 自定义 voiceId + 兼容旧字段名
test('normalizeVoiceConfig 兼容 voiceId / speed / language_boost 旧字段', () => {
  const config = mv.normalizeVoiceConfig({
    voiceId: '  custom-voice-1  ', speed: '1.5', language_boost: 'English',
  });
  assert.equal(config.minimaxVoiceId, 'custom-voice-1');
  assert.equal(config.minimaxSpeed, 1.5);
  assert.equal(config.languageBoost, 'English');
});

// 3. cloned voice 识别
test('collectVoiceRecords 区分 official / cloned / custom', () => {
  const records = mv.collectVoiceRecords({
    system_voice: [{ voice_id: 'sys-1', voice_name: '系统音' }],
    voice_cloning: [{ voice_id: 'clone-1', voice_name: '克隆音' }],
    voice_generation: [{ voice_id: 'gen-1' }],
  });
  const byId = Object.fromEntries(records.map((r) => [r.voiceId, r]));
  assert.equal(byId['sys-1'].source, 'official');
  assert.equal(byId['clone-1'].source, 'cloned');
  assert.equal(byId['gen-1'].source, 'custom');
  assert.equal(byId['gen-1'].name, 'gen-1'); // name 缺省回退 voiceId
});

test('collectVoiceRecords 去重并支持字符串数组与 data 包裹', () => {
  const records = mv.collectVoiceRecords({ data: { voices: ['v1', 'v1', 'v2'] } });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.voiceId), ['v1', 'v2']);
});

// 4. audio settings 构造
test('buildMinimaxAudioSettings 有默认值且无 undefined', () => {
  const settings = mv.buildMinimaxAudioSettings({});
  assert.deepEqual(settings, { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 });
  for (const value of Object.values(settings)) assert.notEqual(value, undefined);
});

test('buildMinimaxAudioSettings 流式强制 mp3', () => {
  const settings = mv.buildMinimaxAudioSettings({ minimaxAudioFormat: 'wav' }, { stream: true });
  assert.equal(settings.format, 'mp3');
});

// 5. 文本清洗
test('sanitizeMinimaxText 去除中文括号与方括号标注', () => {
  const out = mv.sanitizeMinimaxText('你好（微笑）【系统】世界');
  assert.equal(out, '你好世界');
});

test('sanitizeMinimaxText 在 speech-2.8 保留白名单音效标签', () => {
  const out = mv.sanitizeMinimaxText('哈哈(laughs)结束', {}, 'speech-2.8-turbo');
  assert.equal(out, '哈哈(laughs)结束');
  const stripped = mv.sanitizeMinimaxText('哈哈(laughs)结束', {}, 'speech-01-hd');
  assert.equal(stripped, '哈哈结束');
});

// 6. pronunciation dictionary
test('parsePronunciationDictionary 转换有效行', () => {
  const dict = mv.parsePronunciationDictionary('重/chong2\n行/xing2\n无效行');
  assert.deepEqual(dict, { tone: ['重/chong2', '行/xing2'] });
});

test('parsePronunciationDictionary 空/非法返回 null', () => {
  assert.equal(mv.parsePronunciationDictionary(''), null);
  assert.equal(mv.parsePronunciationDictionary(null), null);
  assert.equal(mv.parsePronunciationDictionary('没有斜杠'), null);
});

// 7. voice record 标准化字段
test('normalizeVoiceRecord 输出稳定内部结构', () => {
  const [record] = mv.collectVoiceRecords([
    { voice_id: 'v9', voice_name: '音9', language: 'Chinese', description: '测试' },
  ]);
  assert.deepEqual(Object.keys(record).sort(), ['description', 'language', 'name', 'source', 'voiceId']);
});

// 8. provider URL
test('minimaxBaseUrls 默认与自定义域名', () => {
  assert.deepEqual(mv.minimaxBaseUrls({}), ['https://api.minimaxi.com']);
  assert.deepEqual(mv.minimaxBaseUrls({ minimaxProvider: 'cn' }), ['https://api.minimaxi.com']);
  assert.deepEqual(mv.minimaxBaseUrls({ minimaxProvider: 'io' }), ['https://api.minimax.io']);
  assert.deepEqual(mv.minimaxBaseUrls({ minimaxDomain: 'https://custom.example.com/' }), ['https://custom.example.com']);
});

// 9. 输入对象不被修改
test('纯函数不修改输入对象', () => {
  const voiceInput = { voiceId: 'v1', speed: 2 };
  const voiceSnapshot = JSON.stringify(voiceInput);
  mv.normalizeVoiceConfig(voiceInput);
  assert.equal(JSON.stringify(voiceInput), voiceSnapshot);

  const globalInput = { minimaxAudioFormat: 'wav', minimaxVoiceCatalog: [{ voice_id: 'v1' }] };
  const globalSnapshot = JSON.stringify(globalInput);
  mv.normalizeGlobalConfig(globalInput);
  mv.buildMinimaxAudioSettings(globalInput, { stream: true });
  assert.equal(JSON.stringify(globalInput), globalSnapshot);

  const dictInput = '重/chong2';
  mv.parsePronunciationDictionary(dictInput);
  assert.equal(dictInput, '重/chong2');
});

// 10. 不泄露 API Key / Group ID
test('音色记录标准化丢弃凭证字段', () => {
  const records = mv.collectVoiceRecords([
    { voice_id: 'v1', voice_name: '音', minimaxApiKey: 'sk-leak', minimaxGroupId: 'grp-leak', apiKey: 'x', groupId: 'y' },
  ]);
  const serialized = JSON.stringify(records);
  assert.ok(!serialized.includes('sk-leak'));
  assert.ok(!serialized.includes('grp-leak'));
  assert.ok(!('minimaxApiKey' in records[0]));
  assert.ok(!('minimaxGroupId' in records[0]));
  assert.ok(!('apiKey' in records[0]));
  assert.ok(!('groupId' in records[0]));
});

test('normalizeGlobalConfig 归一化音色目录同样不含凭证', () => {
  const config = mv.normalizeGlobalConfig({
    minimaxApiKey: 'sk-secret', minimaxGroupId: 'grp-secret',
    minimaxVoiceCatalog: [{ voice_id: 'v1', apiKey: 'sk-secret' }],
  });
  const serialized = JSON.stringify(config);
  assert.ok(!serialized.includes('sk-secret'));
  assert.ok(!serialized.includes('grp-secret'));
});

// 11. 场景无关的角色 Voice 解析入口（视频通话可复用）
test('resolveCharacterVoiceSettings 接受 character.settings 结构', () => {
  const character = {
    name: '角色A',
    settings: { minimaxVoiceId: 'v-call', speed: 1.2, language_boost: 'Chinese' },
  };
  const voice = mv.resolveCharacterVoiceSettings(character);
  assert.equal(voice.minimaxVoiceId, 'v-call');
  assert.equal(voice.minimaxSpeed, 1.2);
  assert.equal(voice.languageBoost, 'Chinese');
});

test('resolveCharacterVoiceSettings 接受扁平 settings 且对空值安全', () => {
  const flat = mv.resolveCharacterVoiceSettings({ minimaxVoiceId: 'v-flat' });
  assert.equal(flat.minimaxVoiceId, 'v-flat');
  const empty = mv.resolveCharacterVoiceSettings(null);
  assert.equal(empty.minimaxVoiceId, '');
  assert.equal(empty.minimaxSpeed, 1.0);
});

test('resolveCharacterVoiceSettings 不修改传入角色对象', () => {
  const character = { settings: { minimaxVoiceId: 'v1', speed: 2 } };
  const snapshot = JSON.stringify(character);
  mv.resolveCharacterVoiceSettings(character);
  assert.equal(JSON.stringify(character), snapshot);
});

// ===== STEP 2: 请求体装配与缓存签名 =====

// 1-8. Voice 参数进入 MiniMax 请求体
test('buildMinimaxRequestBody 透传 voiceId / speed / vol / pitch / emotion / languageBoost / dict', () => {
  const body = mv.buildMinimaxRequestBody({
    model: 'speech-01-hd',
    text: '你好',
    voice: {
      minimaxVoiceId: 'voice-a', minimaxSpeed: 1.3, minimaxVolume: 0.8, minimaxPitch: 2,
      minimaxEmotion: 'happy', languageBoost: 'English', minimaxPronunciationDict: '重/chong2',
    },
  });
  assert.equal(body.voice_setting.voice_id, 'voice-a');
  assert.equal(body.voice_setting.speed, 1.3);
  assert.equal(body.voice_setting.vol, 0.8);
  assert.equal(body.voice_setting.pitch, 2);
  assert.equal(body.voice_setting.emotion, 'happy');
  assert.equal(body.language_boost, 'English');
  assert.deepEqual(body.pronunciation_dict, { tone: ['重/chong2'] });
  assert.equal(body.text, '你好');
  assert.equal(body.model, 'speech-01-hd');
});

test('buildMinimaxRequestBody 无 voiceId 时不抛错且使用默认参数', () => {
  const body = mv.buildMinimaxRequestBody({ text: '你好', voice: {} });
  assert.equal(body.voice_setting.voice_id, '');
  assert.equal(body.voice_setting.speed, 1.0);
  assert.equal(body.voice_setting.vol, 1.0);
  assert.equal(body.voice_setting.pitch, 0);
  assert.equal(body.model, 'speech-01-hd');
  // 空 emotion / languageBoost / dict 不污染请求体
  assert.ok(!('emotion' in body.voice_setting));
  assert.ok(!('language_boost' in body));
  assert.ok(!('pronunciation_dict' in body));
});

test('buildMinimaxRequestBody 顶层 voiceId 覆盖 voice.minimaxVoiceId', () => {
  const body = mv.buildMinimaxRequestBody({ text: 'x', voiceId: 'top-id', voice: { minimaxVoiceId: 'inner-id' } });
  assert.equal(body.voice_setting.voice_id, 'top-id');
});

test('buildMinimaxRequestBody audio_setting 来自 globalConfig', () => {
  const body = mv.buildMinimaxRequestBody({
    text: 'x', voice: { minimaxVoiceId: 'v' },
    globalConfig: { minimaxAudioFormat: 'wav', minimaxSampleRate: 24000, minimaxBitrate: 64000, minimaxChannel: 2 },
  });
  assert.deepEqual(body.audio_setting, { format: 'wav', sample_rate: 24000, bitrate: 64000, channel: 2 });
});

// 9-10. 文本清洗 + 原文不变
test('sanitizeMinimaxText 用于清洗副本，不改原始文本', () => {
  const original = '你好（微笑）世界';
  const cleaned = mv.sanitizeMinimaxText(original);
  assert.equal(cleaned, '你好世界');
  assert.equal(original, '你好（微笑）世界');
});

// 11-12. 缓存签名区分 Voice 且相同配置一致
test('voiceCacheSignature 不同 voice 参数产生不同签名', () => {
  const audio = { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 };
  const a = mv.voiceCacheSignature({ minimaxSpeed: 1.0 }, audio);
  const b = mv.voiceCacheSignature({ minimaxSpeed: 1.5 }, audio);
  const c = mv.voiceCacheSignature({ minimaxEmotion: 'sad' }, audio);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('voiceCacheSignature 相同配置产生相同签名', () => {
  const audio = { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 };
  const a = mv.voiceCacheSignature({ minimaxSpeed: 1.2, minimaxVolume: 1, minimaxPitch: 0 }, audio);
  const b = mv.voiceCacheSignature({ minimaxSpeed: 1.2, minimaxVolume: 1, minimaxPitch: 0 }, audio);
  assert.equal(a, b);
});

test('voiceCacheSignature 不含任何凭证', () => {
  const sig = mv.voiceCacheSignature({ minimaxVoiceId: 'v', minimaxApiKey: 'sk-x', minimaxGroupId: 'g-x' }, {});
  assert.ok(!sig.includes('sk-x'));
  assert.ok(!sig.includes('g-x'));
});

// 14. 向后兼容：旧角色（仅 minimaxVoiceId）仍能产生有效请求体
test('buildMinimaxRequestBody 兼容仅有 minimaxVoiceId 的旧角色', () => {
  const body = mv.buildMinimaxRequestBody({ text: 'x', voice: { minimaxVoiceId: 'legacy-voice' } });
  assert.equal(body.voice_setting.voice_id, 'legacy-voice');
  assert.equal(body.voice_setting.speed, 1.0);
});

// 17-18. 请求体装配不引入凭证
test('buildMinimaxRequestBody 不含 apiKey / groupId', () => {
  const body = mv.buildMinimaxRequestBody({
    text: 'x',
    voice: { minimaxVoiceId: 'v', minimaxApiKey: 'sk-leak', minimaxGroupId: 'grp-leak' },
    globalConfig: { minimaxApiKey: 'sk-leak2', minimaxGroupId: 'grp-leak2' },
  });
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('sk-leak'));
  assert.ok(!serialized.includes('grp-leak'));
});

test('buildMinimaxRequestBody 不修改输入 voice / globalConfig', () => {
  const voice = { minimaxVoiceId: 'v', minimaxSpeed: 1.4 };
  const globalConfig = { minimaxAudioFormat: 'wav' };
  const vs = JSON.stringify(voice);
  const gs = JSON.stringify(globalConfig);
  mv.buildMinimaxRequestBody({ text: 'x', voice, globalConfig });
  assert.equal(JSON.stringify(voice), vs);
  assert.equal(JSON.stringify(globalConfig), gs);
});




