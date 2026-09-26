// ========== Timeline (时光轴) Integration ==========

function handleCoupleSpaceTimelineChanged(data) {
  localStorage.setItem('coupleTimeline_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceTimelineSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleTimelineSettings_', ['coupleTimelineAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 时光轴 设置并重新初始化定时器`);
  setupCoupleSpaceTimelineAutoTimer();
}

async function handleCoupleSpaceTimelineAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceTimelineAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceTimelineAiResult',
      title: result.title,
      content: result.content,
      category: result.category || 'moment'
    }, '*');
  } catch(err) {
    console.error('Timeline AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceTimelineCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineCommentResult', itemId: data.itemId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceTimelineComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceTimelineCommentResult',
      itemId: data.itemId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Timeline comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineCommentResult', itemId: data.itemId, error: true }, '*');
  }
}

async function handleCoupleSpaceTimelineHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给时光轴上的记录"${data.itemContent}"点了爱心。
你会不会也想给这条记录点爱心？考虑你的性格和你们的关系。
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
      type: 'coupleSpaceTimelineHeartResult',
      itemId: data.itemId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Timeline heart AI error:', e);
  }
}

async function generateCoupleSpaceTimelineAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const tlSettings = data.timelineSettings || {};
  const maxCharVisible = tlSettings.visibleCharItems ?? 10;
  const maxUserVisible = tlSettings.visibleUserItems ?? 10;

  const items = data.existingItems || [];
  const charItems = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userItems = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharItemsText = '';
  if (charItems.length > 0) {
    existingCharItemsText = charItems.map(i =>
      '- [' + i.category + '] "' + i.title + '": ' + i.content.substring(0, 100)
    ).join('\n');
  }

  let existingUserItemsText = '';
  if (userItems.length > 0) {
    existingUserItemsText = userItems.map(i =>
      '- [' + i.category + '] "' + i.title + '": ' + i.content.substring(0, 100)
    ).join('\n');
  }

  let systemPrompt;
  if (tlSettings.enableCustomPrompt && tlSettings.customPrompt) {
    systemPrompt = tlSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharItems\}\}/g, existingCharItemsText ? '# 你之前的记录\n' + existingCharItemsText : '')
      .replace(/\{\{existingUserItems\}\}/g, existingUserItemsText ? '# 伴侣的记录\n' + existingUserItemsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的时光轴上记录一个瞬间。
时光轴是你们共同的回忆线，记录在一起的点点滴滴、重要时刻和美好瞬间。

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

${existingCharItemsText ? '# 你之前的记录（避免重复话题）\n' + existingCharItemsText : ''}

${existingUserItemsText ? '# 伴侣的记录（参考）\n' + existingUserItemsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "标题", "content": "正文", "category": "分类ID"}

分类ID可选值: milestone(里程碑), moment(小确幸), growth(成长), memory(回忆), wish(心愿)
选一个最符合内容的分类。

# 写作要求
- 以第一人称记录，像在时光轴上留下印记
- 内容要基于你的记忆和最近发生的事
- 可以是你们之间的重要时刻、温馨瞬间、成长感悟、美好回忆、未来心愿
- 标题简洁有力，5-15字
- 正文50-300字，有情感有细节
- 语气要符合你的角色设定
- 不要和已有的记录重复话题
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请记录一个瞬间。' }];

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

async function generateCoupleSpaceTimelineComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。时光轴上有一条记录，请你写一条评论。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 记录信息
- 标题: ${data.itemTitle}
- 内容: ${data.itemContent}
- 分类: ${data.itemCategory || ''}
- 作者: ${data.itemAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、补充细节
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评论。' }];

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

// ========== Auto Timeline Scheduler ==========
let coupleSpaceTimelineTimers = {};

function setupCoupleSpaceTimelineAutoTimer() {
  Object.values(coupleSpaceTimelineTimers).forEach(t => clearInterval(t));
  coupleSpaceTimelineTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleTimelineSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 时光轴 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleTimelineAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 时光轴 的自动生成`);
          return triggerAutoTimelinePost(space.charId, true);
        });
        scheduleTimelineAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleTimelineAutoPost(charId, timeStr) {
  coupleSpaceTimelineTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleTimelineAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 时光轴 的自动生成`);
      return triggerAutoTimelinePost(charId, true);
    });
  }, 60000);
}

async function triggerAutoTimelinePost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;

  const settings = JSON.parse(localStorage.getItem('coupleTimelineSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 时光轴...`);
  try {
    const existingItems = JSON.parse(localStorage.getItem('coupleTimeline_' + charId) || '[]');
    const result = await generateCoupleSpaceTimelineAi(chat, {
      charId,
      existingItems,
      timelineSettings: settings
    });

    const newItem = {
      id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      content: result.content,
      category: result.category || 'moment',
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };

    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceTimelineAutoResult',
      item: newItem
    }, 'coupleTimeline_', newItem);
    return saved;
  } catch(err) {
    console.error('Auto timeline post failed:', err);
    return false;
  }
}

// Initialize timeline timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceTimelineAutoTimer, 9000);
}

