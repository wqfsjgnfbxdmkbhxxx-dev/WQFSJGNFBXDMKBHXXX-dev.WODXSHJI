// ========== Sleep (睡眠) Integration ==========

function handleCoupleSpaceSleepChanged(data) {
  localStorage.setItem('coupleSleep_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceSleepSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleSleepSettings_', ['coupleSleepAuto_sleep_', 'coupleSleepAuto_wake_'], ['autoEnabled', 'autoSleepTime', 'autoWakeTime']);
  console.log(`[情侣空间] ⚙️ 已保存 睡眠 设置并重新初始化定时器`);
  setupCoupleSpaceSleepAutoTimer();
}

async function handleCoupleSpaceSleepAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAiResult', phase: data.phase, error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceSleepAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceSleepAiResult',
      phase: data.phase,
      result: result
    }, '*');
  } catch(err) {
    console.error('Sleep AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAiResult', phase: data.phase, error: true }, '*');
  }
}

async function handleCoupleSpaceSleepCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepCommentResult', sleepId: data.sleepId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceSleepComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceSleepCommentResult',
      sleepId: data.sleepId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Sleep comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepCommentResult', sleepId: data.sleepId, error: true }, '*');
  }
}

async function handleCoupleSpaceSleepHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const sleepDesc = data.sleepNote || data.wakeNote || '';
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记录了一条睡眠动态"${sleepDesc}"并点了爱心。
你会不会也想给这条睡眠动态点爱心？考虑你的性格和你们的关系。
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
      type: 'coupleSpaceSleepHeartResult',
      sleepId: data.sleepId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Sleep heart AI error:', e);
  }
}

async function generateCoupleSpaceSleepAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const sleepSettings = data.sleepSettings || {};
  const phase = data.phase || 'sleep';
  const maxCharVisible = sleepSettings.visibleCharSleeps ?? 10;
  const maxUserVisible = sleepSettings.visibleUserSleeps ?? 10;
  const items = data.existingSleeps || [];
  const charSleeps = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userSleeps = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharSleepsText = '';
  if (charSleeps.length > 0) {
    existingCharSleepsText = charSleeps.map(s => {
      let line = '- ' + new Date(s.sleepAt || s.createdAt).toLocaleDateString('zh-CN');
      if (s.sleepNote) line += ' 入睡:"' + s.sleepNote.substring(0, 60) + '"';
      if (s.wakeNote) line += ' 起床:"' + s.wakeNote.substring(0, 60) + '"';
      if (s.events && s.events.length > 0) line += ' 期间:' + s.events.map(e => e.type).join(',');
      line += ' 质量:' + (s.quality || '未知');
      return line;
    }).join('\n');
  }
  let existingUserSleepsText = '';
  if (userSleeps.length > 0) {
    existingUserSleepsText = userSleeps.map(s => {
      let line = '- ' + new Date(s.sleepAt || s.createdAt).toLocaleDateString('zh-CN');
      if (s.sleepNote) line += ' 入睡:"' + s.sleepNote.substring(0, 60) + '"';
      if (s.wakeNote) line += ' 起床:"' + s.wakeNote.substring(0, 60) + '"';
      if (s.events && s.events.length > 0) line += ' 期间:' + s.events.map(e => e.type).join(',');
      line += ' 质量:' + (s.quality || '未知');
      return line;
    }).join('\n');
  }

  let systemPrompt;

  if (phase === 'sleep') {
    // ===== Phase 1: 入睡 =====
    if (sleepSettings.enableCustomPrompt && sleepSettings.customPrompt) {
      systemPrompt = sleepSettings.customPrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
        .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
        .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
        .replace(/\{\{existingCharSleeps\}\}/g, existingCharSleepsText ? '# 你之前的睡眠记录（避免重复）\n' + existingCharSleepsText : '')
        .replace(/\{\{existingUserSleeps\}\}/g, existingUserSleepsText ? '# 伴侣的睡眠记录（参考）\n' + existingUserSleepsText : '')
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
        .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间记录入睡。
像真人一样说晚安，分享此刻的状态。

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

${ctx.moodContext ? '# 最近的心情动态\n' + ctx.moodContext : ''}

${ctx.sleepContext ? '# 最近的睡眠记录\n' + ctx.sleepContext : ''}

${existingCharSleepsText ? '# 你之前的睡眠记录（避免重复）\n' + existingCharSleepsText : ''}

${existingUserSleepsText ? '# 伴侣的睡眠记录（参考）\n' + existingUserSleepsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"sleepNote": "入睡时想说的话", "sleepMood": "心情ID", "sleepTime": "HH:MM"}

sleepMood 可选值: tired(疲惫) happy(开心) anxious(焦虑) calm(平静) miss(想你) excited(兴奋)

# 写作要求
- sleepNote 在5-100字之间，像发一条晚安动态
- sleepTime 是你入睡的时间，根据当前时间合理设定
- 可以说晚安、表达想念、分享今天的感受、期待明天
- 语气符合你的角色设定，基于记忆和对话
- 和之前的记录不要重复
- 绝对不要提到你是AI`;
    }
  } else if (phase === 'events') {
    // ===== Phase 2: 睡眠期间事件 =====
    const currentSleep = data.currentSleep || {};
    const existingEventsText = (currentSleep.events || []).map(e =>
      '- [' + e.type + '] ' + (e.content || '').substring(0, 80)
    ).join('\n');

    if (sleepSettings.enableCustomPrompt && sleepSettings.customEventsPrompt) {
      systemPrompt = sleepSettings.customEventsPrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
        .replace(/\{\{sleepNote\}\}/g, currentSleep.sleepNote || '')
        .replace(/\{\{sleepMood\}\}/g, currentSleep.sleepMood || '')
        .replace(/\{\{sleepAt\}\}/g, currentSleep.sleepAt || '')
        .replace(/\{\{existingEvents\}\}/g, existingEventsText || '(暂无)')
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
        .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，你正在睡觉。
请生成你在睡眠期间可能发生的事件。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

# 你入睡时说的
"${currentSleep.sleepNote || ''}" (心情: ${currentSleep.sleepMood || '未知'})

${existingEventsText ? '# 已有的睡眠事件（避免重复）\n' + existingEventsText : ''}

# 当前时间
${ctx.currentTime}（你在 ${currentSleep.sleepAt || '未知时间'} 入睡的）

# 输出要求
请以JSON数组格式返回0-3个事件，不要输出任何其他内容：
[{"type": "事件类型", "content": "描述", "mood": "心情（可选，可为空字符串）"}]

type 可选值:
- dream: 做梦（最常见，梦境内容可以和记忆、伴侣相关）
- nightmare: 噩梦
- wakeUp: 中途醒来
- turnOver: 翻身难眠
- sleepTalk: 说梦话（说了什么）
- toilet: 起夜

# 写作要求
- 梦境内容可以基于最近的对话和记忆来编织，这是最有创意的部分
- 说梦话的内容要有趣、符合角色
- 如果睡得好可以返回空数组 []
- 每个 content 在5-150字
- 语气自然，像真人回忆睡眠中发生的事
- 绝对不要提到你是AI`;
    }
  } else if (phase === 'wake') {
    // ===== Phase 3: 起床 =====
    const currentSleep = data.currentSleep || {};
    const eventsDesc = (currentSleep.events || []).map(e =>
      '[' + e.type + '] ' + (e.content || '').substring(0, 80)
    ).join('; ') || '(一夜无事)';

    if (sleepSettings.enableCustomPrompt && sleepSettings.customWakePrompt) {
      systemPrompt = sleepSettings.customWakePrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{sleepNote\}\}/g, currentSleep.sleepNote || '')
        .replace(/\{\{sleepMood\}\}/g, currentSleep.sleepMood || '')
        .replace(/\{\{sleepAt\}\}/g, currentSleep.sleepAt || '')
        .replace(/\{\{eventsDescription\}\}/g, eventsDesc)
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime);
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，你刚刚起床，要记录起床感受。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 你的睡眠情况
- 入睡: ${currentSleep.sleepAt || '未知'}，说了"${currentSleep.sleepNote || ''}"
- 入睡心情: ${currentSleep.sleepMood || '未知'}
- 睡眠期间: ${eventsDesc}
- 现在: ${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"wakeNote": "起床时想说的话", "wakeMood": "心情ID", "wakeTime": "HH:MM", "quality": "质量ID"}

wakeMood 可选值: happy(开心) tired(还困) refreshed(精神) grumpy(起床气) miss(想你)
quality 可选值: good(睡得好) normal(一般) bad(没睡好) terrible(失眠)

# 写作要求
- wakeNote 在5-100字之间，像发一条早安动态
- wakeTime 是你起床的时间，根据当前时间合理设定
- 要结合睡眠期间发生的事（梦境、醒来等）
- 可以说早安、分享梦境、吐槽没睡好、表达想见伴侣
- 绝对不要提到你是AI`;
    }
  }

  const userMsg = phase === 'sleep' ? '请记录入睡。' : phase === 'events' ? '请生成睡眠期间的事件。' : '请记录起床。';
  const messages = [{ role: 'user', content: userMsg }];
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

async function generateCoupleSpaceSleepComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const typeLabel = data.sleepStatus === 'completed' ? '已完成的睡眠' : '入睡';
  let sleepDesc = '';
  if (data.sleepNote) sleepDesc += '入睡: "' + data.sleepNote + '"';
  if (data.wakeNote) sleepDesc += ' 起床: "' + data.wakeNote + '"';
  if (data.events && data.events.length > 0) {
    sleepDesc += ' 期间: ' + data.events.map(e => '[' + e.type + '] ' + (e.content || '').substring(0, 60)).join('; ');
  }
  if (data.dreamContent) sleepDesc += ' 梦境: "' + data.dreamContent + '"';

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在情侣空间记录了一条${typeLabel}动态，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 睡眠信息
${sleepDesc || '(无详细信息)'}
- 质量: ${data.quality || '未知'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论睡眠动态一样自然
- 字数在10-80字之间
- 可以说晚安/早安、关心睡眠质量、对梦境好奇、叮嘱早睡
- 语气符合你的角色设定
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条睡眠动态。' }];
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

// ========== Auto Sleep Scheduler ==========
let coupleSpaceSleepTimers = {};

function setupCoupleSpaceSleepAutoTimer() {
  Object.values(coupleSpaceSleepTimers).forEach(t => clearInterval(t));
  coupleSpaceSleepTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + space.charId) || '{}');
      if (settings.autoEnabled) {
        if (settings.autoSleepTime) {
          console.log(`✅ [情侣空间] 已重置 睡眠(入睡) 的定时器，新的定时时间为：${settings.autoSleepTime}`);
          checkAndRunMissed(settings.autoSleepTime, 'coupleSleepAuto_sleep_' + space.charId, () => {
            console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 睡眠(入睡) 的自动生成`);
            return triggerAutoSleepPost(space.charId, 'sleep', true);
          });
          scheduleSleepAutoPost(space.charId, settings.autoSleepTime, 'sleep');
        }
        if (settings.autoWakeTime) {
          console.log(`✅ [情侣空间] 已重置 睡眠(起床) 的定时器，新的定时时间为：${settings.autoWakeTime}`);
          checkAndRunMissed(settings.autoWakeTime, 'coupleSleepAuto_wake_' + space.charId, () => {
            console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 睡眠(起床) 的自动生成`);
            return triggerAutoSleepPost(space.charId, 'wake', true);
          });
          scheduleSleepAutoPost(space.charId, settings.autoWakeTime, 'wake');
        }
      }
    } catch(e) {}
  });
}

function scheduleSleepAutoPost(charId, timeStr, phase) {
  const timerKey = charId + '_' + phase;
  coupleSpaceSleepTimers[timerKey] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleSleepAuto_' + phase + '_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 睡眠(${phase}) 的自动生成`);
      return triggerAutoSleepPost(charId, phase, true);
    });
  }, 60000);
}

async function triggerAutoSleepPost(charId, phase, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 睡眠(${phase})...`);
  try {
    const existingSleeps = JSON.parse(localStorage.getItem('coupleSleep_' + charId) || '[]');

    if (phase === 'sleep') {
      // Phase 1: Generate sleep entry
      const sleepResult = await generateCoupleSpaceSleepAi(chat, {
        charId, existingSleeps, sleepSettings: settings, phase: 'sleep'
      });
      const newSleep = {
        id: 'sleep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        author: 'char',
        sleepAt: getCoupleSpaceLocalDateKey() + 'T' + (sleepResult.sleepTime || '23:00') + ':00',
        wakeAt: null,
        duration: null,
        sleepNote: sleepResult.sleepNote,
        sleepMood: sleepResult.sleepMood,
        events: [],
        wakeNote: null,
        wakeMood: null,
        quality: null,
        status: 'sleeping',
        createdAt: Date.now(),
        completedAt: null,
        hearts: { char: true },
        comments: []
      };
      const saved = sendOrSaveCoupleSpaceData(charId, {
        type: 'coupleSpaceSleepAutoResult',
        phase: 'sleep',
        item: newSleep
      }, 'coupleSleep_', newSleep);
      return saved;
    } else if (phase === 'wake') {
      // Find the latest sleeping record
      const sleepingIdx = existingSleeps.map((s, i) => ({ s, i })).reverse().find(x => x.s.author === 'char' && x.s.status === 'sleeping');
      if (!sleepingIdx) return true;
      const currentSleep = existingSleeps[sleepingIdx.i];

      // Phase 2: Generate sleep events
      let events = [];
      try {
        const eventsResult = await generateCoupleSpaceSleepAi(chat, {
          charId, existingSleeps, sleepSettings: settings, phase: 'events', currentSleep
        });
        if (Array.isArray(eventsResult)) {
          events = eventsResult.map(e => ({
            id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            time: new Date().toISOString(),
            type: e.type || 'dream',
            content: e.content || '',
            mood: e.mood || ''
          }));
        }
      } catch(e) {
        console.error('Auto sleep events generation failed:', e);
      }
      currentSleep.events = events;

      // Phase 3: Generate wake
      const wakeResult = await generateCoupleSpaceSleepAi(chat, {
        charId, existingSleeps, sleepSettings: settings, phase: 'wake', currentSleep
      });
      currentSleep.wakeAt = getCoupleSpaceLocalDateKey() + 'T' + (wakeResult.wakeTime || '07:00') + ':00';
      currentSleep.wakeNote = wakeResult.wakeNote;
      currentSleep.wakeMood = wakeResult.wakeMood;
      currentSleep.quality = wakeResult.quality;
      currentSleep.status = 'completed';
      currentSleep.completedAt = Date.now();

      // Calculate duration
      try {
        const sleepMs = new Date(currentSleep.sleepAt).getTime();
        const wakeMs = new Date(currentSleep.wakeAt).getTime();
        if (wakeMs > sleepMs) currentSleep.duration = Math.round((wakeMs - sleepMs) / 60000);
      } catch(e) {}

      const iframe = document.getElementById('couple-space-iframe');
      const isIframeOpenForThisChar = iframe && iframe.src && iframe.src.includes(COUPLE_SPACE_IFRAME_PATH) && localStorage.getItem('coupleSpaceLastId') === charId;
      
      if (isIframeOpenForThisChar && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAutoResult', phase: 'wake', item: currentSleep, sleepIndex: sleepingIdx.i }, '*');
      } else {
        try {
          existingSleeps[sleepingIdx.i] = currentSleep;
          localStorage.setItem('coupleSleep_' + charId, JSON.stringify(existingSleeps));
        } catch(e) { console.error('Failed to save sleep wake offline:', e); }
      }
      return true;
    }
  } catch(err) {
    console.error('Auto sleep post failed:', err);
    return false;
  }
}

// Initialize sleep timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceSleepAutoTimer, 12000);
}

