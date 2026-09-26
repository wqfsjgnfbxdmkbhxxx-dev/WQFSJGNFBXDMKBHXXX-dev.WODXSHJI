// ========== Letter (信件) Integration ==========

function handleCoupleSpaceLetterChanged(data) {
  localStorage.setItem('coupleLetters_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceLetterSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleLetterSettings_', ['coupleLetterAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 信件 设置并重新初始化定时器`);
  setupCoupleSpaceLetterAutoTimer();
}

async function handleCoupleSpaceLetterAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterAiResult', charId: data.charId, error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLetterAi(chat, data);
    if (localStorage.getItem('coupleSpaceLastId') !== data.charId || !iframe.src.includes(COUPLE_SPACE_IFRAME_PATH)) {
      const letters = JSON.parse(localStorage.getItem('coupleLetters_' + data.charId) || '[]');
      letters.push(createCoupleSpaceLetterItem(result));
      localStorage.setItem('coupleLetters_' + data.charId, JSON.stringify(letters));
      return;
    }
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterAiResult',
      charId: data.charId,
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none'
    }, '*');
  } catch(err) {
    console.error('Letter AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterAiResult', charId: data.charId, error: true }, '*');
  }
}

async function handleCoupleSpaceLetterReplyRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterReplyResult', charId: data.charId, letterId: data.letterId, error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLetterReply(chat, data);
    if (localStorage.getItem('coupleSpaceLastId') !== data.charId || !iframe.src.includes(COUPLE_SPACE_IFRAME_PATH)) {
      const letters = JSON.parse(localStorage.getItem('coupleLetters_' + data.charId) || '[]');
      letters.push(createCoupleSpaceLetterItem(result, data.letterId || null));
      localStorage.setItem('coupleLetters_' + data.charId, JSON.stringify(letters));
      return;
    }
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterReplyResult',
      charId: data.charId,
      letterId: data.letterId,
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none'
    }, '*');
  } catch(err) {
    console.error('Letter reply AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterReplyResult', charId: data.charId, letterId: data.letterId, error: true }, '*');
  }
}

async function handleCoupleSpaceLetterCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterCommentResult', charId: data.charId, letterId: data.letterId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceLetterComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterCommentResult',
      charId: data.charId,
      letterId: data.letterId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Letter comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterCommentResult', charId: data.charId, letterId: data.letterId, error: true }, '*');
  }
}

async function handleCoupleSpaceLetterHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"写了一封信"${data.letterTitle}"并点了爱心。
你会不会也想给这封信点爱心？考虑你的性格和你们的关系。
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
      type: 'coupleSpaceLetterHeartResult',
      charId: data.charId,
      letterId: data.letterId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Letter heart AI error:', e);
  }
}

async function generateCoupleSpaceLetterAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const letterSettings = data.letterSettings || {};
  const maxCharVisible = letterSettings.visibleCharLetters ?? 5;
  const maxUserVisible = letterSettings.visibleUserLetters ?? 5;
  const items = data.existingLetters || [];
  const charLetters = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userLetters = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharLettersText = '';
  if (charLetters.length > 0) {
    existingCharLettersText = charLetters.map(l => '- "' + l.title + '": ' + (l.content || '').substring(0, 150) + '...').join('\n');
  }
  let existingUserLettersText = '';
  if (userLetters.length > 0) {
    existingUserLettersText = userLetters.map(l => '- "' + l.title + '": ' + (l.content || '').substring(0, 150) + '...').join('\n');
  }

  let systemPrompt;
  if (letterSettings.enableCustomPrompt && letterSettings.customPrompt) {
    systemPrompt = letterSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharLetters\}\}/g, existingCharLettersText ? '# 你之前写的信（避免重复话题）\n' + existingCharLettersText : '')
      .replace(/\{\{existingUserLetters\}\}/g, existingUserLettersText ? '# 伴侣写的信（参考）\n' + existingUserLettersText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间给"${ctx.myNickname}"写一封信。
信件不同于留言和日记，它更正式、更深情、更有仪式感，像真正的手写信一样。

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

${existingCharLettersText ? '# 你之前写的信（避免重复话题）\n' + existingCharLettersText : ''}

${existingUserLettersText ? '# 伴侣写的信（参考，可以回应）\n' + existingUserLettersText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "信件标题", "content": "信件正文", "envelope": "信封类型ID"}

envelope 可选值: none(普通) love(情书) classic(经典) seasonal(时令) handwrite(手写风)
（选一个最符合信件氛围的）

# 写作要求
- 像写一封真正的信，有称呼、正文、落款
- 字数在200-1000字之间，比留言更长更深入
- 可以回顾共同的记忆、表达深层的感受、畅想未来、倾诉心事
- 语气要符合你的角色设定，但信件中可以比平时更真诚
- 基于记忆和最近的对话，不要凭空编造
- 如果伴侣最近写了信，可以在内容中自然地回应
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请写一封信吧。' }];
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
  return validateCoupleSpaceLetterResult(parseCoupleSpaceJson(getGeminiResponseText(respData)));
}

async function generateCoupleSpaceLetterReply(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"给你写了一封信，请你回信。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 原信信息
- 标题: ${data.letterTitle}
- 内容: ${data.letterContent}
- 时间: ${data.letterDate || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "回信标题", "content": "回信正文", "envelope": "信封类型ID"}

envelope 可选值: none(普通) love(情书) classic(经典) seasonal(时令) handwrite(手写风)

# 写作要求
- 回信要回应原信的内容，像真正的书信往来
- 字数在150-800字之间
- 有称呼和落款
- 语气符合你的角色设定
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请回信。' }];
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
  return validateCoupleSpaceLetterResult(parseCoupleSpaceJson(getGeminiResponseText(respData)));
}

async function generateCoupleSpaceLetterComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在你们的信件上写了一条批注，请你也写一条批注回应。

# 你的角色设定
${ctx.aiPersona}

# 信件信息
- 标题: ${data.letterTitle}
- 内容: ${(data.letterContent || '').substring(0, 200)}

# 用户的批注
${data.userComment || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回批注文本，不要JSON格式，不要引号包裹。
- 像真人在信件旁边写批注一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应批注内容、表达感受
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写一条批注。' }];
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

// ========== Auto Letter Scheduler ==========
let coupleSpaceLetterTimers = {};

function setupCoupleSpaceLetterAutoTimer() {
  Object.values(coupleSpaceLetterTimers).forEach(t => clearInterval(t));
  coupleSpaceLetterTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleLetterSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 信件 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleLetterAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 信件 的自动生成`);
          return triggerAutoLetterPost(space.charId, true);
        });
        scheduleLetterAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleLetterAutoPost(charId, timeStr) {
  coupleSpaceLetterTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleLetterAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 信件 的自动生成`);
      return triggerAutoLetterPost(charId, true);
    });
  }, 60000);
}

async function triggerAutoLetterPost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleLetterSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 信件...`);
  try {
    const existingLetters = JSON.parse(localStorage.getItem('coupleLetters_' + charId) || '[]');
    const result = await generateCoupleSpaceLetterAi(chat, {
      charId,
      existingLetters,
      letterSettings: settings
    });
    const newLetter = {
      id: 'letter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none',
      author: 'char',
      replyTo: null,
      read: false,
      readAt: null,
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceLetterAutoResult',
      item: newLetter
    }, 'coupleLetters_', newLetter);
    return saved;
  } catch(err) {
    console.error('Auto letter post failed:', err);
    return false;
  }
}

function createCoupleSpaceLetterItem(result, replyTo = null) {
  return {
    id: 'letter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title: result.title,
    content: result.content,
    envelope: result.envelope || 'none',
    author: 'char',
    replyTo,
    read: false,
    readAt: null,
    createdAt: Date.now(),
    hearts: { char: true },
    comments: []
  };
}

function validateCoupleSpaceLetterResult(result) {
  if (!result || typeof result !== 'object') throw new Error('信件生成结果不是有效对象');
  const title = String(result.title || '').trim();
  const content = String(result.content || '').trim();
  if (!title || !content) throw new Error('信件生成结果缺少标题或正文');
  const allowedEnvelopes = ['none', 'love', 'classic', 'seasonal', 'handwrite'];
  return {
    title,
    content,
    envelope: allowedEnvelopes.includes(result.envelope) ? result.envelope : 'none'
  };
}

// Initialize letter timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceLetterAutoTimer, 10000);
}

