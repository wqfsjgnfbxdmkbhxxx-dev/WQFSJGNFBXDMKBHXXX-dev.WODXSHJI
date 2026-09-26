  async function handleGenerateSimulatedMemos() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”分享TA的备忘录...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }
    const userPersona = chat.settings.myPersona || '(未设置)';
    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【12到20条】TA最近可能会写在手机备忘录里的内容。

# 核心规则
1.  **创造性与合理性**: 备忘录内容必须完全符合角色的性格、爱好、职业和生活环境。可以是购物清单、待办事项、灵感片段、一些随笔和感悟、草稿等。
2.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一条备忘录，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "备忘录的标题，例如：购物清单 或 周末计划",
        "content": "备忘录的详细内容，必须支持换行符\\n。"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- ** 你的聊天对象（用户）的人设**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组备忘录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的备忘录内容。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);


        let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.9
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });


      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error?.message || response.statusText;
        throw new Error(`API 错误: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedMemos;
      try {
        simulatedMemos = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      if (!Array.isArray(simulatedMemos)) {
        throw new Error(`AI返回的数据不是一个数组。原始返回: ${JSON.stringify(simulatedMemos)}`);
      }

      chat.memos = simulatedMemos.map(memo => ({
        id: Date.now() + Math.random(),
        title: memo.title,
        content: memo.content
      }));

      await db.chats.put(chat);
      await renderCharMemoList();

    } catch (error) {
      console.error("生成模拟备忘录失败:", error);
      await showCustomAlert("生成失败", `无法生成备忘录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleGenerateAmapHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在生成“${chat.name}”的出行足迹...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;
    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【12到20条】TA最近的“高德地图”出行足迹。

# 核心规则
1.  **【时间 (最高优先级)】**:
    -   今天的日期是 **${new Date().toISOString()}**。
    -   你生成的【所有】足迹的 \`timestamp\` 字段，【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
    -   请生成一个看起来像是过去几周内的、时间【从新到旧】排列的足迹列表。
2.  **创造性与合理性**: 足迹必须完全符合角色的性格、爱好、职业和生活环境。
3.  **多样性**: 地点类型要丰富，可以包括餐厅、商场、公园、公司、朋友家等。
4.  **【格式铁律 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一条足迹，格式【必须】如下:
    \`\`\`json
    [
      {
        "locationName": "一个具体、生动的地点名称",
        "address": "一个虚构但看起来很真实的详细地址",
        "comment": "这是角色对这次出行或这个地点的内心独白或评论，必须使用第一人称“我”来写。",
        "image_prompt": "(可选)一段用于生成这张地点照片的、详细的【英文】关键词, 风格为 realistic photo, high quality",
        "timestamp": "符合 ISO 8601 格式的日期时间字符串 (例如: '2025-09-25T18:30:00Z')"
      }
    ]
    \`\`\`
    - **重要**: 大约有【三分之一】的足迹需要包含 \`image_prompt\` 字段来生成一张照片。
    - **图片**: image_prompt 生成的图片【绝对禁止包含真人】。如果地点是室内，可以生成空无一人的场景；如果是室外，可以只有风景或建筑。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组足迹记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的高德地图足迹。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);


        let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.9
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedAmapData;
      try {
        simulatedAmapData = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedAmapHistory = simulatedAmapData;
      await db.chats.put(chat);

      await renderCharAmap();

    } catch (error) {
      console.error("生成模拟足迹失败:", error);
      await showCustomAlert("生成失败", `无法生成足迹，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  function renderCharAmap() {
    const listEl = document.getElementById('char-amap-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const history = char.simulatedAmapHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有留下任何足迹，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }


    history.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-amap-item';

      let photoHtml = '';
      if (item.image_prompt) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        photoHtml = `<div class="amap-item-photo" style="background-image: url('${imageUrl}')" data-comment="${item.comment}"></div>`;
      }

      // 使用我们之前创建的 formatTimeAgo 函数来格式化时间
      const timeAgo = item.timestamp ? formatTimeAgo(new Date(item.timestamp).getTime()) : '某个时间';

      itemEl.innerHTML = `
                    <div class="amap-item-header">
                        <div class="amap-item-icon">📍</div>
                        <div class="amap-item-info">
                            <div class="amap-item-title">${item.locationName}</div>
                            <div class="amap-item-address">${item.address}</div>
                        </div>
                    </div>
                    <div class="amap-item-body">
                        <div class="amap-item-comment">${item.comment.replace(/\n/g, '<br>')}</div>
                        ${photoHtml}
                    </div>
                    <div class="amap-item-footer">${timeAgo}</div>
                `;
      listEl.appendChild(itemEl);
    });

  }



  async function handleGenerateAppUsage() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在分析“${chat.name}”的手机使用习惯...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出TA最近一天的【手机App屏幕使用时间】记录，总共约20条。

# 核心规则
1.  **创造性与多样性**: 生成的App列表【不必局限于】Cphone主屏幕上已有的App。你可以自由地虚构TA可能使用的其他App，例如 Instagram, Twitter, 各种游戏 (如：原神, 王者荣耀), 视频App (如：抖音, YouTube), 学习或工作软件等，这能更好地体现角色的隐藏兴趣和生活习惯。
2.  **合理性**: 使用时长和App类型必须完全符合角色的性格、爱好、职业和生活环境。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一个App的使用记录，格式【必须】如下:
    \`\`\`json
    [
      {
        "appName": "App的名称 (例如: 微信, 微博, 原神)",
        "usageTimeMinutes": 125,
        "category": "App的分类 (例如: 社交, 游戏, 影音, 工具, 阅读, 购物)",
        "image_prompt": "一段用于生成这个App【图标】的、简洁的【英文】关键词。风格必须是 modern app icon, flat design, simple, clean background"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组App使用记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的App使用记录。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);


        let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.9
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');

      const simulatedUsageData = JSON.parse(cleanedJson);

      chat.simulatedAppUsage = simulatedUsageData;
      await db.chats.put(chat);

      await renderCharAppUsage();

    } catch (error) {
      console.error("生成模拟App使用记录失败:", error);
      await showCustomAlert("生成失败", `无法生成记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  function renderCharAppUsage() {
    const listEl = document.getElementById('char-usage-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const usageData = (char.simulatedAppUsage || []).sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);

    if (usageData.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有任何使用记录，<br>点击右上角刷新按钮生成一些吧！</p>';
      return;
    }

    usageData.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-usage-item';

      const hours = Math.floor(item.usageTimeMinutes / 60);
      const minutes = item.usageTimeMinutes % 60;
      let timeString = '';
      if (hours > 0) timeString += `${hours}小时`;
      if (minutes > 0) timeString += `${minutes}分钟`;
      if (!timeString) timeString = '小于1分钟';

      const prompt = item.image_prompt || `modern app icon for ${item.appName}, flat design, simple`;

      const iconUrl = getPollinationsImageUrl(prompt);


      itemEl.innerHTML = `
                    <img src="${iconUrl}" class="usage-item-icon">
                    <div class="usage-item-info">
                        <div class="usage-item-name">${item.appName}</div>
                        <div class="usage-item-category">${item.category}</div>
                    </div>
                    <div class="usage-item-time">${timeString}</div>
                `;
      listEl.appendChild(itemEl);
    });
  }


  async function handleGenerateSimulatedBilibili() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在结合世界观与人设，分析“${chat.name}”的B站兴趣...`);

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    // 1. 准备上下文
    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    // 2. 准备记忆和世界观
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');

    // 3. 准备世界书
    const longTermMemoryContext = await getMemoryContextForPromptAsync(chat, { queryText: recentHistoryWithUser }) || '无';

    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const userPersona = chat.settings.myPersona || '(未设置)';

    // 4. 构建 Prompt：核心改变是让 AI 生成关键词，而不是假数据
    const systemPrompt = `
# 你的任务
你是一个虚拟用户画像分析师。你的任务是扮演角色“${chat.name}”，根据TA的人设、所处的世界观、长期记忆、以及与用户（${userDisplayNameForAI}）的关系，**推测TA现在最想在 Bilibili (B站) 上搜索或观看的视频关键词**。

# 核心规则
1.  **深度人设绑定**: 关键词必须紧扣角色的性格、职业、爱好以及**世界观设定**。
    - 例如：如果世界书里设定了“魔法”，角色可能会搜“火球术教学”；如果是“末世”，可能会搜“生存指南”。
2.  **关系导向**: 如果用户人设是你喜欢的人，你可能会搜“给喜欢的人送什么礼物”；如果是死对头，可能会搜“如何优雅地怼人”。必须逻辑自洽。
3.  **多样性**: 请生成 **10到12个** 具体的搜索关键词。
4.  **具体性**: 关键词最好具体一点。
5.  **格式铁律**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 数组中的每个元素都是一个**字符串** (即搜索关键词)。
    - 示例: \`["关键词1", "关键词2", "关键词3"...]\`

# 供你参考的详细上下文
- **角色人设**: ${chat.settings.aiPersona}
- **用户(${userDisplayNameForAI})的人设**: ${userPersona} 
- **长期记忆**: 
${longTermMemoryContext}
${worldBookContext} 
- **最近对话**:
${recentHistoryWithUser}

现在，请结合以上所有信息，生成这组搜索关键词。`;

    try {
      const messagesForApi = [{ role: 'user', content: "请生成B站搜索关键词列表。" }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify((() => {
            let reqBody = {
              model: model,
              messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi],
              temperature: state.globalSettings.apiTemperature || 1.0
            };
            if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
            if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
            if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
            if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
            return reqBody;
          })())
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const keywords = JSON.parse(cleanedJson);

      if (!Array.isArray(keywords)) throw new Error("AI没有返回数组格式的关键词。");

      await showCustomAlert("请稍候...", `AI已结合世界观生成 ${keywords.length} 个关键词，正在逐个搜索B站视频 (为防封禁，速度会稍慢)...`);

      // 定义延时函数，防止请求太快被B站接口封IP
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const results = [];

      // 5. 遍历关键词，调用真实的搜索接口
      for (const [index, keyword] of keywords.entries()) {
        let retryCount = 0; // 当前关键词的重试次数
        let success = false; // 是否成功标记
        const maxRetries = 5; // 最大重试次数，防止死循环

        // 使用 while 循环，直到成功或超过最大重试次数
        while (!success && retryCount < maxRetries) {
          try {
            // 如果是重试，打印日志提示
            const retryMsg = retryCount > 0 ? ` (第 ${retryCount} 次重试)` : "";
            console.log(`[B站搜索 ${index + 1}/${keywords.length}] 正在搜索: ${keyword}${retryMsg}`);

            // 使用你脚本里原本使用的接口，经过CORS代理
            const targetUrl = `https://api.52vmy.cn/api/query/bilibili/video?msg=${encodeURIComponent(keyword)}&n=1`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const res = await fetch(proxyUrl);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();

            // --- 修改重点开始：检测限流并重试 ---
            if (text.includes("访问过快") || text.includes("频繁") || text.includes("Too Many Requests")) {
              console.warn(`⚠️ 关键词 "${keyword}" 触发限流，等待冷却后重试...`);

              // 动态等待时间：基础等待 5秒 + 每次重试增加 2秒 (5s, 7s, 9s...)
              await delay(5000 + (retryCount * 2000));

              retryCount++; // 增加重试计数
              continue; // 跳过本次 while 循环的剩余部分，重新发起请求
            }
            // --- 修改重点结束 ---

            let json;
            try {
              json = JSON.parse(text);
            } catch (e) {
              // 如果JSON解析失败（可能是接口报错返回了HTML），也视为失败进行重试
              console.warn(`JSON解析失败，准备重试: ${keyword}`);
              retryCount++;
              await delay(3000);
              continue;
            }

            // 接口返回格式兼容处理
            let videoData = null;
            if (json.data && Array.isArray(json.data) && json.data.length > 0) {
              videoData = json.data[0];
            } else if (json.code === 200 && json.data) {
              videoData = Array.isArray(json.data) ? json.data[0] : json.data;
            } else if (json.title) {
              videoData = json;
            }

            if (videoData && videoData.title && videoData.url) {
              results.push(videoData);
            }

            // 如果代码跑到这里，说明没有触发限流且没有报错，标记成功以退出 while 循环
            success = true;

          } catch (e) {
            console.warn(`搜索关键词 "${keyword}" 发生错误:`, e);
            // 网络错误也进行重试
            retryCount++;
            await delay(3000);
          }
        }

        // 如果超过最大重试次数仍然失败
        if (!success) {
          console.error(`❌ 关键词 "${keyword}" 重试 ${maxRetries} 次后仍然失败，已跳过。`);
        }

        // 关键词之间的正常间隔 (建议稍微调大一点，比如 2000ms，以减少触发限流的概率)
        await delay(1500);
      }

      // 6. 保存真实数据
      chat.simulatedBilibiliFeed = results;
      await db.chats.put(chat);

      // 7. 渲染界面
      renderCharBilibiliScreen();
      await showCustomAlert("完成", `成功为你生成了 ${results.length} 个符合 ${chat.name} 人设与世界观的视频推荐！`);

    } catch (error) {
      console.error("生成B站推荐失败:", error);
      await showCustomAlert("生成失败", `无法生成推荐内容。\n错误: ${error.message}`);
    }
  }
  function renderCharBilibiliScreen() {
    const listEl = document.getElementById('char-bilibili-list');
    listEl.innerHTML = '';

    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];

    // 读取保存的模拟数据
    const videos = chat.simulatedBilibiliFeed || [];

    if (videos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">首页空空如也，<br>点击右上角刷新按钮获取个性化推荐吧！</p>';
      return;
    }

    videos.forEach(video => {
      const item = document.createElement('div');
      item.className = 'bilibili-item';

      // 处理封面图和信息
      // 使用 img 标签配合 no-referrer 来绕过 Safari 的防盗链检查
      item.innerHTML = `
            <div class="bili-cover" style="position: relative; overflow: hidden;">
                <img src="${video.img_url || video.pic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;" onerror="this.style.display='none'">
                <div class="bili-duration" style="position: absolute; z-index: 2;">▶</div>
            </div>
            <div class="bili-info">
                <div class="bili-title">${video.title}</div>
                <div class="bili-author">UP: ${video.user || video.author || '未知UP主'}</div>
            </div>
        `;

      // 点击播放
      item.onclick = () => playCharBilibiliVideo(video);
      listEl.appendChild(item);
    });
  }
  async function handleGenerateSimulatedMusic() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”分享TA的私人歌单...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');


    const systemPrompt = `
# 你的任务
你是一个虚拟音乐品味模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，挑选出【14到18首】最能代表TA此刻心情或品味的歌曲。

# 核心规则
1.  **创造性与合理性**: 歌单必须完全符合角色的性格、爱好和生活背景。
2.  **多样性**: 歌曲风格可以多样，但必须逻辑自洽。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一首歌，格式【必须】如下:
    \`\`\`json
    [
      {
        "songName": "歌曲的准确名称",
        "artistName": "歌曲的准确艺术家/歌手名"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请生成这份歌单。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的歌单。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);


      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify((() => {
            let reqBody = {
              model: model,
              messages: [{
                role: 'system',
                content: systemPrompt
              }, ...messagesForApi],
              temperature: state.globalSettings.apiTemperature || 1.0
            };
            if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
            if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
            if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
            if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
            return reqBody;
          })())
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const songPicks = JSON.parse(cleanedJson);

      await showCustomAlert("请稍候...", `歌单已生成，正在从网络获取 ${songPicks.length} 首歌曲的详细信息...`);

      const songDetailPromises = songPicks.map(async (pick) => {
        let searchResults = await searchNeteaseMusic(pick.songName, pick.artistName);
        if (!searchResults || searchResults.length === 0) {
          searchResults = await searchTencentMusic(pick.songName);
        }
        if (searchResults.length > 0) {
          return getPlayableSongDetails(searchResults[0]);
        }
        console.warn(`所有音乐源都未能找到歌曲：“${pick.songName} - ${pick.artistName}”`);
        return null;
      });

      const fullSongObjects = (await Promise.all(songDetailPromises)).filter(Boolean);

      chat.simulatedMusicPlaylist = fullSongObjects;
      await db.chats.put(chat);

      await renderCharMusicScreen();

    } catch (error) {
      console.error("生成模拟歌单失败:", error);
      await showCustomAlert("生成失败", `无法生成歌单，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  // ==========================================
  // MY Phone 生成处理函数
  // ==========================================

