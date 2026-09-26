// ========== Mood (心情) Integration ==========

function handleCoupleSpaceMoodChanged(data) {
  localStorage.setItem('coupleMoods_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceMoodSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleMoodSettings_', ['coupleMoodAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 心情 设置并重新初始化定时器`);
  setupCoupleSpaceMoodAutoTimer();
}

async function handleCoupleSpaceMoodAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceMoodAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodAiResult',
      moodType: result.moodType,
      content: result.content
    }, '*');
  } catch(err) {
    console.error('Mood AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceMoodCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodCommentResult', moodId: data.moodId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceMoodComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodCommentResult',
      moodId: data.moodId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Mood comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodCommentResult', moodId: data.moodId, error: true }, '*');
  }
}

async function handleCoupleSpaceMoodHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记录了一条心情"${data.moodType}: ${data.moodContent || ''}"并点了爱心。
你会不会也想给这条心情点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodHeartResult',
      moodId: data.moodId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Mood heart AI error:', e);
  }
}

async function generateCoupleSpaceMoodAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const moodSettings = data.moodSettings || {};
  const maxCharVisible = moodSettings.visibleCharMoods ?? 10;
  const maxUserVisible = moodSettings.visibleUserMoods ?? 10;
  const items = data.existingMoods || [];
  const charMoods = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userMoods = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharMoodsText = '';
  if (charMoods.length > 0) {
    existingCharMoodsText = charMoods.map(m => '- ' + m.moodType + ': "' + (m.content || '') + '"').join('\n');
  }
  let existingUserMoodsText = '';
  if (userMoods.length > 0) {
    existingUserMoodsText = userMoods.map(m => '- ' + m.moodType + ': "' + (m.content || '') + '"').join('\n');
  }

  let systemPrompt;
  if (moodSettings.enableCustomPrompt && moodSettings.customPrompt) {
    systemPrompt = moodSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharMoods\}\}/g, existingCharMoodsText ? '# 你之前的心情（避免重复）\n' + existingCharMoodsText : '')
      .replace(/\{\{existingUserMoods\}\}/g, existingUserMoodsText ? '# 伴侣的心情（参考）\n' + existingUserMoodsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间记录一条心情。
心情是简短的情绪快照，记录此刻的感受。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.worldBook ? '# 世界观\n' + ctx.worldBook : ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.moodContext ? '# 最近的心情动态\n' + ctx.moodContext : ''}

${existingCharMoodsText ? '# 你之前的心情（避免重复）\n' + existingCharMoodsText : ''}

${existingUserMoodsText ? '# 伴侣的心情（参考）\n' + existingUserMoodsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"moodType": "心情类型ID", "content": "心情文字"}

moodType 可选值: happy(开心) sweet(甜蜜) calm(平静) miss(想你) excited(兴奋) tired(疲惫) sad(难过) angry(生气) anxious(焦虑) grateful(感恩)

# 写作要求
- 心情文字在5-150字之间，简短真实
- 像发一条心情动态，不是写日记
- 可以是此刻的感受、对伴侣的想念、一个小感悟
- 语气符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和之前的心情不要重复
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请记录一条心情。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return parseCoupleSpaceJson(raw);
}

async function generateCoupleSpaceMoodComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在情侣空间记录了一条心情，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 心情信息
- 类型: ${data.moodType}
- 内容: ${data.moodContent || '(无文字)'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论心情动态一样自然
- 字数在10-80字之间
- 语气符合你的角色设定
- 可以回应心情、表达关心、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条心情。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Mood Scheduler ==========
let coupleSpaceMoodTimers = {};

function setupCoupleSpaceMoodAutoTimer() {
  Object.values(coupleSpaceMoodTimers).forEach(t => clearInterval(t));
  coupleSpaceMoodTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleMoodSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 心情 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleMoodAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 心情 的自动生成`);
          return triggerAutoMoodPost(space.charId, true);
        });
        scheduleMoodAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleMoodAutoPost(charId, timeStr) {
  coupleSpaceMoodTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleMoodAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 心情 的自动生成`);
      return triggerAutoMoodPost(charId, true);
    });
  }, 60000);
}

async function triggerAutoMoodPost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleMoodSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 心情...`);
  try {
    const existingMoods = JSON.parse(localStorage.getItem('coupleMoods_' + charId) || '[]');
    const result = await generateCoupleSpaceMoodAi(chat, {
      charId,
      existingMoods,
      moodSettings: settings
    });
    const newMood = {
      id: 'mood_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      moodType: result.moodType,
      content: result.content,
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceMoodAutoResult',
      item: newMood
    }, 'coupleMoods_', newMood);
    return saved;
  } catch(err) {
    console.error('Auto mood post failed:', err);
    return false;
  }
}

// Initialize mood timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceMoodAutoTimer, 9000);
}

