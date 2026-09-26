
function handleCoupleSpaceChecklistChanged(data) {
  localStorage.setItem('coupleChecklist_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceChecklistSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleChecklistSettings_', ['coupleChecklistAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 清单 设置并重新初始化定时器`);
  setupCoupleSpaceChecklistAutoTimer();
}

async function handleCoupleSpaceChecklistAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceChecklistAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceChecklistAiResult',
      title: result.title,
      category: result.category,
      priority: result.priority,
      note: result.note
    }, '*');
  } catch(err) {
    console.error('Checklist AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceChecklistCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistCommentResult', itemId: data.itemId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceChecklistComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceChecklistCommentResult',
      itemId: data.itemId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Checklist comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistCommentResult', itemId: data.itemId, error: true }, '*');
  }
}

async function handleCoupleSpaceChecklistHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给清单项"${data.itemTitle}"点了爱心。
备注: ${data.itemNote || '(无)'}

你会不会也想给这个清单项点爱心？考虑你的性格和你们的关系。
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
      type: 'coupleSpaceChecklistHeartResult',
      itemId: data.itemId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Checklist heart AI error:', e);
  }
}

async function generateCoupleSpaceChecklistAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const clSettings = data.checklistSettings || {};
  const maxCharVisible = clSettings.visibleCharItems ?? 10;
  const maxUserVisible = clSettings.visibleUserItems ?? 10;

  const items = data.existingItems || [];
  const charItems = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userItems = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharItemsText = '';
  if (charItems.length > 0) {
    existingCharItemsText = charItems.map(i =>
      '- ' + (i.done ? '[✓] ' : '[ ] ') + '"' + i.title + '" (' + i.category + ')' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }

  let existingUserItemsText = '';
  if (userItems.length > 0) {
    existingUserItemsText = userItems.map(i =>
      '- ' + (i.done ? '[✓] ' : '[ ] ') + '"' + i.title + '" (' + i.category + ')' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }

  let systemPrompt;
  if (clSettings.enableCustomPrompt && clSettings.customPrompt) {
    systemPrompt = clSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharItems\}\}/g, existingCharItemsText ? '# 你之前推荐的清单项\n' + existingCharItemsText : '')
      .replace(/\{\{existingUserItems\}\}/g, existingUserItemsText ? '# 伴侣创建的清单项\n' + existingUserItemsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的清单里推荐一件想和伴侣"${ctx.myNickname}"一起做的事。

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

${existingCharItemsText ? '# 你之前推荐的清单项（避免重复）\n' + existingCharItemsText : ''}

${existingUserItemsText ? '# 伴侣创建的清单项（参考）\n' + existingUserItemsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "清单标题", "category": "分类ID", "priority": "优先级ID", "note": "为什么想做这件事"}

分类ID可选值: travel, food, experience, daily, custom
优先级ID可选值: wish(遥远的愿望), low(不急), normal(一般), high(很想做)

# 要求
- 基于你的记忆和最近的对话来推荐，不要凭空编造
- 不要和已有清单项重复
- 可以是旅行、美食、体验、日常小事、浪漫的事等
- note 要像真人说话，体现你的性格，说明为什么想做
- 字数控制在 20-80 字
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '推荐一件想一起做的事吧。' }];

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

async function generateCoupleSpaceChecklistComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。情侣清单里的"${data.itemTitle}"被标记为完成了。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 清单项信息
- 标题: ${data.itemTitle}
- 分类: ${data.itemCategory || '未分类'}
- 创建者: ${data.itemAuthor === 'char' ? ctx.charName : ctx.myNickname}
- 完成者: ${data.doneBy === 'char' ? ctx.charName : ctx.myNickname}
- 完成感想: ${data.doneNote || '(无)'}

# 当前时间
${ctx.currentTime}

# 要求
请写一段简短的评论（30-100字），表达你对完成这件事的感受。
直接返回评论文本，不要任何格式包裹。
语气要符合你的角色设定，像真人一样自然。
绝对不要提到你是AI。`;

  const messages = [{ role: 'user', content: '写一段完成感想吧。' }];

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

// ========== Auto Checklist Scheduler ==========
let coupleSpaceChecklistTimers = {};

function setupCoupleSpaceChecklistAutoTimer() {
  Object.values(coupleSpaceChecklistTimers).forEach(t => clearInterval(t));
  coupleSpaceChecklistTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleChecklistSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 清单 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleChecklistAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 清单 的自动生成`);
          return triggerAutoChecklistRecommend(space.charId, true);
        });
        scheduleChecklistAutoRecommend(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleChecklistAutoRecommend(charId, timeStr) {
  coupleSpaceChecklistTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleChecklistAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 清单 的自动生成`);
      return triggerAutoChecklistRecommend(charId, true);
    });
  }, 60000);
}

async function triggerAutoChecklistRecommend(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;

  const settings = JSON.parse(localStorage.getItem('coupleChecklistSettings_' + charId) || '{}');

  // Checklist without aiDecide prompt explicitly in original code, but we add log anyway
  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 清单项...`);
  try {
    const existingItems = JSON.parse(localStorage.getItem('coupleChecklist_' + charId) || '[]');
    const result = await generateCoupleSpaceChecklistAi(chat, {
      charId,
      existingItems,
      checklistSettings: settings
    });

    const newItem = {
      id: 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      category: result.category || 'custom',
      priority: result.priority || 'normal',
      note: result.note || '',
      done: false,
      doneAt: null,
      author: 'char',
      createdAt: Date.now(),
      doneNote: '',
      hearts: { char: true },
      comments: []
    };

    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceChecklistAutoResult',
      item: newItem
    }, 'coupleChecklist_', newItem);
    return saved;
  } catch(err) {
    console.error('Auto checklist recommend failed:', err);
    return false;
  }
}

// Initialize checklist timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceChecklistAutoTimer, 7000);
}

