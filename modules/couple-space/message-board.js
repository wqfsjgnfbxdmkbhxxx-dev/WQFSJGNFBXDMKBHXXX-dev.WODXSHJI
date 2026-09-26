// ========== Message Board AI Integration ==========

function handleCoupleSpaceMessageChanged(data) {
  localStorage.setItem('coupleMessages_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceMessageSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleMessageSettings_', ['coupleMessageAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 留言板 设置并重新初始化定时器`);
  setupCoupleSpaceMessageAutoTimer();
}

async function handleCoupleSpaceMessageAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceMessageAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageAiResult',
      content: result.content,
      sticker: result.sticker || 'none'
    }, '*');
  } catch(err) {
    console.error('Message AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceMessageReplyRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageReplyResult', msgId: data.msgId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceMessageReply(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageReplyResult',
      msgId: data.msgId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Message reply AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageReplyResult', msgId: data.msgId, error: true }, '*');
  }
}

async function handleCoupleSpaceMessageHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给留言"${data.msgContent}"点了爱心。
你会不会也想给这条留言点爱心？考虑你的性格和你们的关系。
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
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }],
          temperature: 0.7
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    const liked = answer.includes('yes');

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageHeartResult',
      msgId: data.msgId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Message heart AI error:', e);
  }
}

async function generateCoupleSpaceMessageAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const msgSettings = data.messageSettings || {};
  const maxCharVisible = msgSettings.visibleCharMessages ?? 10;
  const maxUserVisible = msgSettings.visibleUserMessages ?? 10;

  const items = data.existingMessages || [];
  const charMsgs = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userMsgs = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharMsgsText = '';
  if (charMsgs.length > 0) {
    existingCharMsgsText = charMsgs.map(m => {
      let line = '- "' + m.content + '"';
      if (m.comments && m.comments.length > 0) {
        line += '\n  评论: ' + m.comments.map(c => (c.author === 'char' ? ctx.charName : ctx.myNickname) + ': ' + c.content).join(' | ');
      }
      return line;
    }).join('\n');
  }

  let existingUserMsgsText = '';
  if (userMsgs.length > 0) {
    existingUserMsgsText = userMsgs.map(m => {
      let line = '- "' + m.content + '"';
      if (m.comments && m.comments.length > 0) {
        line += '\n  评论: ' + m.comments.map(c => (c.author === 'char' ? ctx.charName : ctx.myNickname) + ': ' + c.content).join(' | ');
      }
      return line;
    }).join('\n');
  }

  let systemPrompt;
  if (msgSettings.enableCustomPrompt && msgSettings.customPrompt) {
    systemPrompt = msgSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharMessages\}\}/g, existingCharMsgsText ? '# 你之前的留言\n' + existingCharMsgsText : '')
      .replace(/\{\{existingUserMessages\}\}/g, existingUserMsgsText ? '# 伴侣的留言\n' + existingUserMsgsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的留言板上给"${ctx.myNickname}"留一条言。
留言板是你们之间的小纸条，随意、温暖、真实。

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

${existingCharMsgsText ? '# 你之前的留言（避免重复话题）\n' + existingCharMsgsText : ''}

${existingUserMsgsText ? '# 伴侣的留言（参考）\n' + existingUserMsgsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"content": "留言内容", "sticker": "分类ID"}

分类ID可选值: none(无), love(表白), miss(想念), care(关心), share(分享), daily(日常)
（选一个最符合留言氛围的，或 none）

# 写作要求
- 像在便签纸上写给对方的话，自然随意
- 可以是想说的话、碎碎念、撒娇、关心、分享心情、表白等
- 字数在15-200字之间，不要太长
- 语气要符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和日记不同，留言更短更直接，是说给对方听的
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请留一条言吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8,
                top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
                presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
                frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return parseCoupleSpaceJson(raw);
}

async function generateCoupleSpaceMessageReply(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在留言板上给你留了一条言，请你回复。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 留言信息
- 内容: ${data.msgContent}
- 时间: ${data.msgDate || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回回复文本，不要JSON格式，不要引号包裹。
- 像真人回复留言一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请回复这条留言。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8,
                top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
                presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
                frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Message Scheduler ==========
let coupleSpaceMessageTimers = {};

function setupCoupleSpaceMessageAutoTimer() {
  Object.values(coupleSpaceMessageTimers).forEach(t => clearInterval(t));
  coupleSpaceMessageTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleMessageSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 留言板 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleMessageAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 留言板 的自动生成`);
          return triggerAutoMessagePost(space.charId, true);
        });
        scheduleMessageAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleMessageAutoPost(charId, timeStr) {
  coupleSpaceMessageTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleMessageAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 留言板 的自动生成`);
      return triggerAutoMessagePost(charId, true);
    });
  }, 60000);
}

async function triggerAutoMessagePost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;

  const settings = JSON.parse(localStorage.getItem('coupleMessageSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 留言...`);
  try {
    const existingMessages = JSON.parse(localStorage.getItem('coupleMessages_' + charId) || '[]');
    const result = await generateCoupleSpaceMessageAi(chat, {
      charId,
      existingMessages,
      messageSettings: settings
    });

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      content: result.content,
      sticker: result.sticker || 'none',
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };

    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceMessageAutoResult',
      item: newMsg
    }, 'coupleMessages_', newMsg);
    return saved;
  } catch(err) {
    console.error('Auto message post failed:', err);
    return false;
  }
}

// Initialize message timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceMessageAutoTimer, 8000);
}

