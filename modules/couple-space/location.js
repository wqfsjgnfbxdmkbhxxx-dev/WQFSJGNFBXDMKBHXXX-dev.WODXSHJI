// ========== Location (定位) Integration ==========

let coupleSpaceLocationTimers = {};

function handleCoupleSpaceLocationChanged(data) {
  localStorage.setItem('coupleLocations_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceLocationSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleLocSettings_', ['coupleLocAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 定位 设置并重新初始化定时器`);
  setupCoupleSpaceLocationAutoTimer();
}

async function handleCoupleSpaceLocationAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLocationAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationAiResult',
      name: result.name,
      description: result.description,
      category: result.category,
      address: result.address
    }, '*');
  } catch(err) {
    console.error('Location AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceLocationCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationCommentResult', locationId: data.locationId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceLocationComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationCommentResult',
      locationId: data.locationId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Location comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationCommentResult', locationId: data.locationId, error: true }, '*');
  }
}

async function handleCoupleSpaceLocationHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const prompt = `你是"${ctx.charName}"。伴侣"${ctx.myNickname}"给一条定位记录点了爱心。
地点: "${data.locationName}"
描述: "${data.locationDesc || ''}"
你想回一个爱心吗？请只回答 "yes" 或 "no"。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '回爱心吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '回爱心吗？' }], temperature: 0.5 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationHeartResult',
      locationId: data.locationId,
      shouldHeart: answer.includes('yes')
    }, '*');
  } catch(err) {
    console.error('Location heart AI error:', err);
  }
}

async function generateCoupleSpaceLocationAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const locSettings = data.locationSettings || {};
  const maxCharVisible = locSettings.visibleCharLocations ?? 10;
  const maxUserVisible = locSettings.visibleUserLocations ?? 10;
  const items = data.existingLocations || [];
  const charLocs = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userLocs = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharLocsText = '';
  if (charLocs.length > 0) {
    existingCharLocsText = charLocs.map(i => '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) + (i.address ? ' (' + i.address + ')' : '')).join('\n');
  }
  let existingUserLocsText = '';
  if (userLocs.length > 0) {
    existingUserLocsText = userLocs.map(i => '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) + (i.address ? ' (' + i.address + ')' : '')).join('\n');
  }

  let systemPrompt;
  if (locSettings.enableCustomPrompt && locSettings.customPrompt) {
    systemPrompt = locSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharLocations\}\}/g, existingCharLocsText ? '# 你之前分享的地点（避免重复）\n' + existingCharLocsText : '')
      .replace(/\{\{existingUserLocations\}\}/g, existingUserLocsText ? '# 伴侣分享的地点（参考）\n' + existingUserLocsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间分享一个地点。
可以是你们去过的地方、想去的地方、或者一个有特殊意义的地点。

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

${ctx.locationContext ? '# 最近的定位动态\n' + ctx.locationContext : ''}

${existingCharLocsText ? '# 你之前分享的地点（避免重复）\n' + existingCharLocsText : ''}

${existingUserLocsText ? '# 伴侣分享的地点（参考）\n' + existingUserLocsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"name": "地点名称", "description": "关于这个地点的描述或心情", "category": "分类ID", "address": "地址描述"}

分类ID可选值: date(约会地) food(美食地) travel(旅行地) daily(日常地) memory(回忆地) wish(想去的地方)

# 写作要求
- 地点名称简洁，3-20字
- 描述30-200字，有情感有故事
- 地址可以是具体的也可以是模糊的
- 基于你的记忆和对话，不要凭空编造不存在的地方
- 和之前分享的地点不要重复
- 语气符合你的角色设定
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请分享一个地点。' }];
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

async function generateCoupleSpaceLocationComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。定位记录上有一条地点分享，请你写一条评论。

# 你的角色设定
${ctx.aiPersona}

# 地点信息
- 地点名: "${data.locationName || ''}"
- 描述: "${data.locationDesc || ''}"
- 用户评论: "${data.userComment || ''}"

# 要求
- 用1-3句话评论，自然亲切
- 可以表达对这个地方的感受、回忆、或期待
- 语气符合你的角色设定
- 绝对不要提到你是AI
- 只返回评论文字，不要JSON`;

  const messages = [{ role: 'user', content: '请评论这个地点。' }];
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
  return getGeminiResponseText(respData).trim();
}

function setupCoupleSpaceLocationAutoTimer() {
  Object.values(coupleSpaceLocationTimers).forEach(t => clearInterval(t));
  coupleSpaceLocationTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleLocSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 定位 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleLocAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 定位 的自动生成`);
          return triggerAutoLocationPost(space.charId, true);
        });
        scheduleLocationAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleLocationAutoPost(charId, timeStr) {
  coupleSpaceLocationTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleLocAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 定位 的自动生成`);
      return triggerAutoLocationPost(charId, true);
    });
  }, 60000);
}

async function triggerAutoLocationPost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleLocSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 定位...`);
  try {
    const existingLocations = JSON.parse(localStorage.getItem('coupleLocations_' + charId) || '[]');
    const result = await generateCoupleSpaceLocationAi(chat, {
      charId,
      existingLocations,
      locationSettings: settings
    });
    const newLoc = {
      id: 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: result.name,
      description: result.description,
      category: result.category || 'daily',
      address: result.address || '',
      lat: null,
      lng: null,
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceLocationAutoResult',
      item: newLoc
    }, 'coupleLocations_', newLoc);
    return saved;
  } catch(err) {
    console.error('Auto location post failed:', err);
    return false;
  }
}

// Initialize location timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceLocationAutoTimer, 11000);
}

