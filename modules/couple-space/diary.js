// ========== Diary AI Integration ==========

async function handleCoupleSpaceDiaryAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true }, '*');
    return;
  }
  // 移除手动触发限制，允许无限手动生成
  
  // 检查AI自主决定设置（仅用于手动触发时）
  const settings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + data.charId) || '{}');
  if (settings.aiDecide) {
    try {
      const shouldWrite = await askAiIfShouldWriteDiary(chat);
      if (!shouldWrite) {
        iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true, reason: 'ai_decided_no' }, '*');
        return;
      }
    } catch(e) {
      console.error('AI decide failed, will write anyway:', e);
    }
  }
  
  try {
    const result = await generateCoupleSpaceDiaryAi(chat, data);
    // 手动触发时，返回结果给iframe，由iframe负责保存
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceDiaryAiResult',
      title: result.title,
      content: result.content,
      mood: result.mood
    }, '*');
  } catch(err) {
    console.error('Diary AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceDiaryCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryCommentResult', diaryId: data.diaryId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceDiaryComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceDiaryCommentResult',
      diaryId: data.diaryId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Diary comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryCommentResult', diaryId: data.diaryId, error: true }, '*');
  }
}

function handleCoupleSpaceDiarySettingsChanged(data) {
  // Store settings in parent for auto-trigger scheduling
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleDiarySettings_', ['coupleDiaryAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 日记 设置并重新初始化定时器`);
  setupCoupleSpaceDiaryAutoTimer();
}

async function handleCoupleSpaceDiarySummaryRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) throw new Error('API未配置');

    const authorName = data.diaryAuthor === 'char' ? data.charName : data.userName;
    let commentsText = '';
    if (data.diaryComments && data.diaryComments.length > 0) {
      commentsText = '\n评语：\n' + data.diaryComments.map(c => {
        const cName = c.author === 'char' ? data.charName : data.userName;
        return cName + ': ' + c.content;
      }).join('\n');
    }

    const prompt = `请为以下日记生成一段简洁的摘要（50-100字），概括日记的核心内容、情感和关键事件。直接返回摘要文本，不要任何格式包裹。

日记标题: ${data.diaryTitle}
作者: ${authorName}
心情: ${data.diaryMood || '未标注'}
正文:
${data.diaryContent}
${commentsText}`;

    const messages = [{ role: 'user', content: prompt }];
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, messages);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, ...messages], temperature: 0.5 })
      });
    }
    if (!response.ok) throw new Error('API请求失败');
    const respData = await response.json();
    const summary = getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiarySummaryResult', diaryId: data.diaryId, summary }, '*');
  } catch(err) {
    console.error('Diary summary error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiarySummaryResult', diaryId: data.diaryId, error: true }, '*');
  }
}

function buildDiaryAiContext(chat) {
  const myNickname = chat.settings.myNickname || '我';
  const charName = chat.name;

  // Memory: pick one based on memoryMode setting
  let memoryContext = '';
  try { memoryContext = getMemoryContextForPrompt(chat); } catch(e) {}

  // Short-term memory (recent chat)
  const maxMemory = parseInt(chat.settings.maxMemory) || 10;
  const recentHistory = chat.history.filter(m => !m.isExcluded && !m.isHidden).slice(-maxMemory);
  let shortTermMemory = '';
  if (recentHistory.length > 0) {
    shortTermMemory = recentHistory.map(msg => {
      const sender = msg.role === 'user' ? myNickname : charName;
      let content = '';
      if (msg.type === 'voice_message') content = '[语音] ' + msg.content;
      else if (msg.type === 'ai_image' || msg.type === 'user_photo') content = '[图片] ' + msg.content;
      else if (msg.type === 'sticker') content = '[表情: ' + (msg.meaning || '') + ']';
      else content = String(msg.content || '').substring(0, 150);
      return sender + ': ' + content;
    }).join('\n');
  }

  // Linked memories
  let linkedMemory = '';
  const memoryCount = chat.settings.linkedMemoryCount || 10;
  if (chat.settings.linkedMemoryChatIds && chat.settings.linkedMemoryChatIds.length > 0) {
    const idsToMount = chat.settings.linkedMemoryChatIds.filter(id => id !== chat.id);
    idsToMount.forEach(id => {
      const linkedChat = state.chats[id];
      if (!linkedChat) return;
      const recent = linkedChat.history.filter(m => !m.isHidden).slice(-memoryCount);
      if (recent.length > 0) {
        linkedMemory += '\n来自"' + linkedChat.name + '"的记忆:\n';
        recent.forEach(msg => {
          const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : linkedChat.name;
          linkedMemory += sender + ': ' + String(msg.content || '').substring(0, 100) + '\n';
        });
      }
    });
  }

  // World book
  let worldBook = '';
  let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
  if (typeof state !== 'undefined' && state.worldBooks) {
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) allWorldBookIds.push(wb.id);
    });
    allWorldBookIds.forEach(bookId => {
      const wb = state.worldBooks.find(w => w.id === bookId);
      if (!wb || !Array.isArray(wb.content)) return;
      wb.content.filter(e => e.enabled !== false).forEach(entry => {
        worldBook += entry.content + '\n';
      });
    });
  }

  // Time
  let currentTime = '';
  try {
    const tz = chat.settings.timeZone || 'Asia/Shanghai';
    currentTime = new Date().toLocaleString('zh-CN', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
  } catch(e) {
    currentTime = new Date().toLocaleString('zh-CN');
  }

  // Weather
  let weatherInfo = '';
  // Weather is async, skip for simplicity; AI can infer from time

  // Anniversaries
  let anniversaryContext = '';
  try {
    const annivs = JSON.parse(localStorage.getItem('coupleAnniv_' + chat.id) || '[]');
    if (annivs.length > 0) {
      const now = new Date(); now.setHours(0,0,0,0);
      const todayItems = [];
      const upcomingItems = [];
      const allItems = [];

      annivs.forEach(a => {
        const d = new Date(a.date + 'T00:00:00');
        const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        const nextOcc = thisYear >= now ? thisYear : new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
        const daysUntil = Math.floor((nextOcc - now) / 86400000);
        const daysSince = Math.floor((now - d) / 86400000);
        const heartInfo = [];
        if (a.hearts && a.hearts.user) heartInfo.push(myNickname + '点了爱心');
        if (a.hearts && a.hearts.char) heartInfo.push(charName + '点了爱心');

        const entry = `"${a.title}" (${a.date}, ${a.reason || '无理由'})${heartInfo.length > 0 ? ' [' + heartInfo.join(', ') + ']' : ''}`;

        if (daysUntil === 0) todayItems.push(entry);
        else if (daysUntil <= 7) upcomingItems.push(`${entry} - 还有${daysUntil}天`);
        allItems.push(`- ${entry} (已${daysSince}天)`);
      });

      if (todayItems.length > 0) anniversaryContext += '🎉 今天是纪念日: ' + todayItems.join('; ') + '\n';
      if (upcomingItems.length > 0) anniversaryContext += '📅 即将到来: ' + upcomingItems.join('; ') + '\n';
      anniversaryContext += '所有纪念日:\n' + allItems.join('\n');
    }
  } catch(e) {}

  // Summary
  let summaryContext = '';
  if (typeof generateSummaryForTimeframe === 'function') {
    try {
      const s1 = generateSummaryForTimeframe(chat, 1, 'days');
      const s3 = generateSummaryForTimeframe(chat, 3, 'days');
      if (s1) summaryContext += s1;
      if (s3) summaryContext += s3;
    } catch(e) {}
  }

  // Checklist context
  let checklistContext = '';
  try {
    const clItems = JSON.parse(localStorage.getItem('coupleChecklist_' + chat.id) || '[]');
    if (clItems.length > 0) {
      const pending = clItems.filter(i => !i.done);
      const done = clItems.filter(i => i.done).slice(-5);
      if (pending.length > 0) {
        checklistContext += '待完成:\n' + pending.map(i =>
          '- "' + i.title + '" (' + i.category + ', ' +
          (i.author === 'char' ? charName : myNickname) + '创建)'
        ).join('\n') + '\n';
      }
      if (done.length > 0) {
        checklistContext += '最近完成:\n' + done.map(i =>
          '- "' + i.title + '" (完成于' + new Date(i.doneAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Timeline context
  let timelineContext = '';
  try {
    const tlItems = JSON.parse(localStorage.getItem('coupleTimeline_' + chat.id) || '[]');
    if (tlItems.length > 0) {
      const recent = tlItems.slice(-5);
      timelineContext = '最近的时光记录:\n' + recent.map(i =>
        '- [' + (i.category || 'moment') + '] "' + i.title + '": ' + (i.content || '').substring(0, 80) +
        ' (' + (i.author === 'char' ? charName : myNickname) + '记录)'
      ).join('\n');
    }
  } catch(e) {}

  // Mood context
  let moodContext = '';
  try {
    const moodItems = JSON.parse(localStorage.getItem('coupleMoods_' + chat.id) || '[]');
    if (moodItems.length > 0) {
      const charMoods = moodItems.filter(i => i.author === 'char').slice(-5);
      const userMoods = moodItems.filter(i => i.author === 'user').slice(-5);
      if (charMoods.length > 0) {
        moodContext += charName + '最近的心情:\n' + charMoods.map(i =>
          '- ' + i.moodType + ': "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userMoods.length > 0) {
        moodContext += myNickname + '最近的心情:\n' + userMoods.map(i =>
          '- ' + i.moodType + ': "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Letter context
  let letterContext = '';
  try {
    const letterItems = JSON.parse(localStorage.getItem('coupleLetters_' + chat.id) || '[]');
    if (letterItems.length > 0) {
      const charLetters = letterItems.filter(i => i.author === 'char').slice(-3);
      const userLetters = letterItems.filter(i => i.author === 'user').slice(-3);
      if (charLetters.length > 0) {
        letterContext += charName + '最近写的信:\n' + charLetters.map(i =>
          '- "' + i.title + '": ' + (i.content || '').substring(0, 100) + '... (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userLetters.length > 0) {
        letterContext += myNickname + '最近写的信:\n' + userLetters.map(i =>
          '- "' + i.title + '": ' + (i.content || '').substring(0, 100) + '... (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Garden (Tree) context
  let gardenContext = '';
  try {
    const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + chat.id) || '{}');
    const waterLogs = gardenData.waterLogs || [];
    if (waterLogs.length > 0) {
      const treeName = gardenData.treeName || '情侣树';
      const totalCoins = gardenData.totalCoins || 0;
      const stages = [
        { min: 0, name: '种子' }, { min: 1, name: '嫩芽' }, { min: 31, name: '小树苗' },
        { min: 101, name: '小树' }, { min: 301, name: '大树' }, { min: 601, name: '开花' }, { min: 1001, name: '结果' }
      ];
      let stageName = '种子';
      for (let i = stages.length - 1; i >= 0; i--) { if (totalCoins >= stages[i].min) { stageName = stages[i].name; break; } }
      gardenContext += treeName + ' (' + stageName + ', 总收入' + totalCoins.toFixed(2) + '元, 共浇水' + waterLogs.length + '次)\n';
      const charWaters = waterLogs.filter(i => i.author === 'char').slice(-3);
      const userWaters = waterLogs.filter(i => i.author === 'user').slice(-3);
      if (charWaters.length > 0) {
        gardenContext += charName + '最近的浇水:\n' + charWaters.map(i =>
          '- "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userWaters.length > 0) {
        gardenContext += myNickname + '最近的浇水:\n' + userWaters.map(i =>
          '- "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Location context
  let locationContext = '';
  try {
    const locItems = JSON.parse(localStorage.getItem('coupleLocations_' + chat.id) || '[]');
    if (locItems.length > 0) {
      const charLocs = locItems.filter(i => i.author === 'char').slice(-5);
      const userLocs = locItems.filter(i => i.author === 'user').slice(-5);
      if (charLocs.length > 0) {
        locationContext += charName + '分享的地点:\n' + charLocs.map(i =>
          '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) +
          (i.address ? ' (' + i.address + ')' : '')
        ).join('\n') + '\n';
      }
      if (userLocs.length > 0) {
        locationContext += myNickname + '分享的地点:\n' + userLocs.map(i =>
          '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) +
          (i.address ? ' (' + i.address + ')' : '')
        ).join('\n');
      }
    }
  } catch(e) {}

  // Sleep context
  let sleepContext = '';
  try {
    const sleepItems = JSON.parse(localStorage.getItem('coupleSleep_' + chat.id) || '[]');
    if (sleepItems.length > 0) {
      const charSleeps = sleepItems.filter(i => i.author === 'char').slice(-5);
      const userSleeps = sleepItems.filter(i => i.author === 'user').slice(-5);
      if (charSleeps.length > 0) {
        sleepContext += charName + '最近的睡眠:\n' + charSleeps.map(i => {
          let line = '- ' + new Date(i.sleepAt || i.createdAt).toLocaleDateString('zh-CN');
          if (i.sleepNote) line += ' 入睡:"' + i.sleepNote.substring(0, 50) + '"';
          if (i.events && i.events.length > 0) {
            line += ' 期间:[' + i.events.map(e => e.type + ':"' + (e.content || '').substring(0, 40) + '"').join(', ') + ']';
          }
          if (i.wakeNote) line += ' 起床:"' + i.wakeNote.substring(0, 50) + '"';
          line += ' 质量:' + (i.quality || '未知');
          return line;
        }).join('\n') + '\n';
      }
      if (userSleeps.length > 0) {
        sleepContext += myNickname + '最近的睡眠:\n' + userSleeps.map(i => {
          let line = '- ' + new Date(i.sleepAt || i.createdAt).toLocaleDateString('zh-CN');
          if (i.sleepNote) line += ' 入睡:"' + i.sleepNote.substring(0, 50) + '"';
          if (i.events && i.events.length > 0) {
            line += ' 期间:[' + i.events.map(e => e.type + ':"' + (e.content || '').substring(0, 40) + '"').join(', ') + ']';
          }
          if (i.wakeNote) line += ' 起床:"' + i.wakeNote.substring(0, 50) + '"';
          line += ' 质量:' + (i.quality || '未知');
          return line;
        }).join('\n');
      }
    }
  } catch(e) {}

  // Finance context
  let financeContext = '';
  try {
    const finItems = JSON.parse(localStorage.getItem('coupleFinance_' + chat.id) || '[]');
    if (finItems.length > 0) {
      const now = new Date();
      const thisMonth = finItems.filter(i => {
        const d = new Date(i.date || i.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const monthExpense = thisMonth.filter(i => i.type === 'expense').reduce((s, i) => s + (i.amount || 0), 0);
      const monthIncome = thisMonth.filter(i => i.type === 'income').reduce((s, i) => s + (i.amount || 0), 0);
      financeContext += '本月支出: ' + monthExpense.toFixed(2) + '元, 收入: ' + monthIncome.toFixed(2) + '元\n';
      const charFin = finItems.filter(i => i.author === 'char').slice(-5);
      const userFin = finItems.filter(i => i.author === 'user').slice(-5);
      if (charFin.length > 0) {
        financeContext += charName + '最近记的账:\n' + charFin.map(i =>
          '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"'
        ).join('\n') + '\n';
      }
      if (userFin.length > 0) {
        financeContext += myNickname + '最近记的账:\n' + userFin.map(i =>
          '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"'
        ).join('\n');
      }
    }
  } catch(e) {}

  return {
    aiPersona: chat.settings.aiPersona || '',
    myPersona: chat.settings.myPersona || '',
    myNickname,
    charName,
    memoryContext,
    shortTermMemory,
    linkedMemory,
    worldBook,
    currentTime,
    summaryContext,
    anniversaryContext,
    checklistContext,
    timelineContext,
    moodContext,
    letterContext,
    gardenContext,
    locationContext,
    sleepContext,
    financeContext
  };
}

async function generateCoupleSpaceDiaryAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let recentDiariesText = '';
  if (data.recentDiaries && data.recentDiaries.length > 0) {
    recentDiariesText = data.recentDiaries.map(d =>
      '- [' + d.date + '] ' + d.author + '《' + d.title + '》: ' + d.content
    ).join('\n');
  }

  // 检查是否有自定义提示词
  let diarySettings = {};
  try { diarySettings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + data.charId) || '{}'); } catch(e) {}

  let systemPrompt;
  if (diarySettings.enableCustomPrompt && diarySettings.customPrompt) {
    // 使用自定义提示词模板，替换变量
    systemPrompt = diarySettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{structuredMemory\}\}/g, ctx.memoryContext || '(暂无记忆)')
      .replace(/\{\{longTermMemory\}\}/g, ctx.memoryContext ? '# 记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{recentDiaries\}\}/g, recentDiariesText ? '# 最近的日记（避免重复话题）\n' + recentDiariesText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间里写一篇日记。这篇日记是写给你自己的，但你的伴侣"${ctx.myNickname}"可以看到并写评语。

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

${recentDiariesText ? '# 最近的日记（避免重复话题）\n' + recentDiariesText : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "日记标题", "content": "日记正文", "mood": "心情ID"}

心情ID可选值: happy, calm, moved, miss, sad, angry, excited, tired（选一个最符合的）

# 写作要求
- 以第一人称写，像真人写日记一样自然
- 内容要基于你的记忆和最近发生的事
- 可以写对伴侣的感受、今天的心情、发生的事、未来的期待等
- 字数在100-400字之间
- 语气要符合你的角色设定
- 不要写成流水账，要有情感和细节
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请写一篇日记。' }];

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

async function generateCoupleSpaceDiaryComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let taskDesc = '';
  if (data.diaryAuthor === 'user') {
    taskDesc = `${ctx.myNickname}写了一篇日记，请你作为${ctx.charName}写一条评语。`;
  } else {
    taskDesc = `你（${ctx.charName}）之前写了一篇日记，${ctx.myNickname}给你写了评语："${data.userComment}"。请你回复这条评语。`;
  }

  const systemPrompt = `# 你的任务
${taskDesc}

# 你的角色设定
${ctx.aiPersona}

# 日记信息
- 标题: ${data.diaryTitle}
- 内容: ${data.diaryContent}
- 心情: ${data.diaryMood || '未标注'}
- 作者: ${data.diaryAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

# 输出要求
直接返回评语文本，不要JSON格式，不要引号包裹。

# 写作要求
- 像真人写评论一样自然
- 字数在20-150字之间
- 语气符合你的角色设定
- 可以表达感受、回应日记内容、或者撒娇/关心
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评语。' }];

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

// ========== Auto Diary Scheduler ==========
let coupleSpaceDiaryTimers = {};

function setupCoupleSpaceDiaryAutoTimer() {
  // Clear existing timers
  Object.values(coupleSpaceDiaryTimers).forEach(t => clearInterval(t));
  coupleSpaceDiaryTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(sp => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + sp.charId)) || {};
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 日记 的定时器，新的定时时间为：${settings.autoTime}`);
        // Check if missed today's execution on startup
        checkAndRunMissed(settings.autoTime, 'coupleDiaryAutoLast_' + sp.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 日记 的自动生成`);
          return triggerAutoDiaryWrite(sp.charId, true);
        });
        scheduleDiaryAutoWrite(sp.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleDiaryAutoWrite(charId, timeStr) {
  coupleSpaceDiaryTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleDiaryAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 日记 的自动生成`);
      return triggerAutoDiaryWrite(charId, true);
    });
  }, 60000);
}

async function triggerAutoDiaryWrite(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;

  const settings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + charId) || '{}');

  // 如果开启了AI自主决定，先询问AI是否要写日记 (定时器触发时强制跳过)
  if (settings.aiDecide && !isTimer) {
    try {
      const shouldWrite = await askAiIfShouldWriteDiary(chat);
      if (!shouldWrite) {
        console.log('AI decided not to write diary today for', chat.name);
        return true;
      }
    } catch(e) {
      console.error('AI decide failed, will write anyway:', e);
    }
  }

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 日记...`);
  try {
    const recentDiaries = [];
    try {
      const diaries = JSON.parse(localStorage.getItem('coupleDiaries_' + charId)) || [];
      diaries.slice(-5).forEach(d => {
        recentDiaries.push({
          author: d.author === 'char' ? chat.name : (chat.settings.myNickname || '我'),
          title: d.title,
          content: (d.content || '').substring(0, 200),
          mood: d.mood,
          date: new Date(d.timestamp).toLocaleString('zh-CN')
        });
      });
    } catch(e) {}

    const result = await generateCoupleSpaceDiaryAi(chat, {
      charId,
      recentDiaries,
      charName: chat.name,
      userName: chat.settings.myNickname || '我'
    });

    const newDiary = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      author: 'char',
      title: result.title || '无题',
      content: result.content || '',
      mood: result.mood || '',
      timestamp: Date.now(),
      comments: []
    };

    console.log('Auto diary written for', chat.name, ':', result.title);

    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceDiaryAutoWritten',
      charId: charId,
      diary: newDiary
    }, 'coupleDiaries_', newDiary);
    return saved;
  } catch(err) {
    console.error('Auto diary write failed:', err);
    return false;
  }
}

async function askAiIfShouldWriteDiary(chat) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) return false;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的互动，判断今天是否有值得写进日记的事情。

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '今天要写日记吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '今天要写日记吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return false;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    return answer.includes('yes');
  } catch(e) {
    return false;
  }
}

// Initialize auto diary timers when app loads
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceDiaryAutoTimer, 5000);
}
