// ========== Anniversary AI Integration ==========

function handleCoupleSpaceAnnivChanged(data) {
  // Store anniversary data for context injection
  localStorage.setItem('coupleAnniv_' + data.charId, JSON.stringify(data.anniversaries || []));
}

function handleCoupleSpaceAnnivSettingsChanged(data) {
  localStorage.setItem('coupleAnnivSettings_' + data.charId, JSON.stringify(data.settings || {}));
  // Re-setup discovery timers based on new settings
  setupCoupleSpaceAnnivDiscovery();
}

async function handleCoupleSpaceAnnivHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给纪念日"${data.annivTitle}"点了爱心。
理由: ${data.annivReason || '(无)'}

你会不会也想给这个纪念日点爱心？考虑你的性格和你们的关系。
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
      type: 'coupleSpaceAnnivHeartResult',
      annivId: data.annivId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Anniv heart AI error:', e);
  }
}

// ========== Anniversary AI Create (on-demand) ==========
async function handleCoupleSpaceAnnivCreateRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
    return;
  }

  try {
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true, reason: 'noApi' }, '*');
      return;
    }

    const ctx = buildDiaryAiContext(chat);
    const existingAnnivs = data.existingAnnivs || JSON.parse(localStorage.getItem('coupleAnniv_' + data.charId) || '[]');
    const existingList = existingAnnivs.map(a => `- "${a.title}" (${a.date})`).join('\n') || '(暂无)';
    const todayStr = getCoupleSpaceLocalDateKey();

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"让你创建一个纪念日。根据你们的对话和关系，想一个有意义的纪念日。

今天的日期是: ${todayStr}
你的名字是: ${ctx.charName}
你的伴侣名字是: ${ctx.myNickname}

${ctx.aiPersona ? '你的人设:\n' + ctx.aiPersona + '\n' : ''}
${ctx.myPersona ? '伴侣的人设:\n' + ctx.myPersona + '\n' : ''}

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.memoryContext ? '记忆:\n' + ctx.memoryContext : ''}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

已有的纪念日:
${existingList}

请创建一个新的纪念日，以JSON格式返回：
{"title": "纪念日标题", "date": "YYYY-MM-DD", "type": "first/love/birthday/custom", "reason": "为什么值得纪念"}

要求：
- 不要和已有纪念日重复
- 选择真正有意义的事件（第一次做某事、重要承诺、特别的日子等）
- date 必须严格基于对话记录、记忆或人设中明确提到的日期或事件
- 如果对话/记忆中明确提到了某个过去的日期（比如"我们200天前在一起了"），可以使用那个真实日期
- 如果对话/记忆中没有提到具体的过去日期，只能使用今天(${todayStr})或最近几天的日期
- 绝对不要凭空编造一个很久以前的日期！只有记忆中有明确依据才能用过去的日期
- 确保纪念日内容和"${ctx.charName}"与"${ctx.myNickname}"的对话相关
- reason要像真人说话一样自然，并说明日期的依据来源`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '帮我创建一个纪念日吧' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '帮我创建一个纪念日吧' }],
          temperature: 0.7
        })
      });
    }

    if (!response.ok) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
      return;
    }

    const respData = await response.json();
    const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(raw);

    if (result.title && result.date) {
      // Validate date: don't allow future dates beyond 1 year, and don't allow dates before 2020
      const resultDate = new Date(result.date + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      const daysDiff = Math.floor((now - resultDate) / 86400000);
      const maxFutureDays = 365;
      const minDate = new Date('2020-01-01');
      if (resultDate > new Date(now.getTime() + maxFutureDays * 86400000) || resultDate < minDate) {
        // Only reject truly unreasonable dates, not legitimate past dates from memory
        result.date = todayStr;
      }

      iframe.contentWindow.postMessage({
        type: 'coupleSpaceAnnivAiCreated',
        title: result.title,
        date: result.date,
        annivType: result.type || 'custom',
        reason: result.reason || ''
      }, '*');
      // 只通知iframe，由iframe负责保存（避免重复保存）
    } else {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
    }
  } catch(e) {
    console.error('Anniv create AI error:', e);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
  }
}

// ========== Anniversary Auto-Discovery ==========
let coupleSpaceAnnivDiscoveryTimers = {};

function setupCoupleSpaceAnnivDiscovery() {
  Object.values(coupleSpaceAnnivDiscoveryTimers).forEach(t => clearInterval(t));
  coupleSpaceAnnivDiscoveryTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleAnnivSettings_' + space.charId) || '{}');
      if (!settings.autoEnabled) return; // Only run if auto-create is enabled
    } catch(e) { return; }

    // Check once every 2 hours
    coupleSpaceAnnivDiscoveryTimers[space.charId] = setInterval(() => {
      triggerAnnivDiscovery(space.charId);
    }, 7200000);
    // Also check on startup after a delay
    setTimeout(() => triggerAnnivDiscovery(space.charId), 30000);
  });
}

async function triggerAnnivDiscovery(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) return;

  // Check settings
  const settings = JSON.parse(localStorage.getItem('coupleAnnivSettings_' + charId) || '{}');
  if (!settings.autoEnabled) return;

  const ctx = buildDiaryAiContext(chat);
  const todayStr = getCoupleSpaceLocalDateKey();

  const existingAnnivs = JSON.parse(localStorage.getItem('coupleAnniv_' + charId) || '[]');
  const existingList = existingAnnivs.map(a => `- "${a.title}" (${a.date})`).join('\n') || '(暂无)';

  // If aiDecide is off, skip the discovery
  if (!settings.aiDecide) return;

  const prompt = `你是"${ctx.charName}"。根据你和"${ctx.myNickname}"最近的对话，判断是否有值得创建纪念日的事件。

今天的日期是: ${todayStr}
你的名字是: ${ctx.charName}
你的伴侣名字是: ${ctx.myNickname}

${ctx.aiPersona ? '你的人设:\n' + ctx.aiPersona + '\n' : ''}
${ctx.myPersona ? '伴侣的人设:\n' + ctx.myPersona + '\n' : ''}

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.memoryContext ? '记忆:\n' + ctx.memoryContext : ''}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

已有的纪念日:
${existingList}

如果发现了值得纪念的新事件（比如第一次做某事、重要的承诺、特别的日子等），请以JSON格式返回：
{"found": true, "title": "纪念日标题", "date": "YYYY-MM-DD", "type": "first/love/birthday/custom", "reason": "为什么值得纪念"}

如果没有发现，返回：
{"found": false}

重要规则：
- 不要和已有纪念日重复
- 只有真正有意义的事件才值得创建
- date 必须严格基于对话记录、记忆或人设中明确提到的日期或事件
- 如果对话/记忆中明确提到了某个过去的日期（比如"我们200天前确认了关系"），可以使用那个真实日期
- 如果对话/记忆中没有提到具体的过去日期，只能使用今天(${todayStr})或最近几天的日期
- 绝对不要凭空编造一个很久以前的日期！只有记忆中有明确依据才能用过去的日期
- 确保纪念日内容和"${ctx.charName}"与"${ctx.myNickname}"的对话相关，不要混入其他角色的内容
- reason中要说明日期依据的来源（来自哪条记忆/对话）`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '有新的纪念日吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '有新的纪念日吗？' }],
          temperature: 0.6
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(raw);

    if (result.found && result.title && result.date) {
      // Validate date: reject truly unreasonable dates (before 2020 or more than 1 year in future)
      const resultDate = new Date(result.date + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      const minDate = new Date('2020-01-01');
      const maxFutureDate = new Date(now.getTime() + 365 * 86400000);
      if (resultDate < minDate || resultDate > maxFutureDate) {
        console.warn('Anniv discovery: AI suggested unreasonable date, skipping:', result.date);
        return;
      }

      const newAnniv = {
        id: 'anniv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: result.title,
        date: result.date,
        type: result.type || 'custom',
        reason: result.reason || '',
        author: 'char',
        createdAt: Date.now(),
        hearts: { char: true },
        comments: []
      };

      sendOrSaveCoupleSpaceData(charId, {
        type: 'coupleSpaceAnnivAiCreated',
        title: result.title,
        date: result.date,
        annivType: result.type || 'custom',
        reason: result.reason || ''
      }, 'coupleAnniv_', newAnniv);
    }
  } catch(e) {
    console.error('Anniv discovery error:', e);
  }
}

// Start discovery on load
try { setupCoupleSpaceAnnivDiscovery(); } catch(e) {}

// ========== Checklist AI Integration ==========
