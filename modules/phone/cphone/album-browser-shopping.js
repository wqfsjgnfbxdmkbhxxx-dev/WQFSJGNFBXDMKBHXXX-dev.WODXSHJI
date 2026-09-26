  async function handleGenerateSimulatedAlbum() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];

    if (!chat) {
      await showCustomAlert("操作失败", "无法找到当前角色的数据。");
      return;
    }

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”回忆TA的相册照片...`);

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
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });
    const worldBookContext = allWorldBookIds
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
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，构思出【8到10张】TA最近可能会拍摄或珍藏在手机相册里的照片。

# 核心规则
1.  **创造性与合理性**: 照片内容必须完全符合角色的性格、爱好、职业和生活环境。
2.  **多样性**: 照片主题要丰富，可以包括自拍、风景、食物、宠物、朋友合影、工作场景等。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一张照片，格式【必须】如下:
    \`\`\`json
    [
      {
        "description": "这是照片背后的故事或角色的心情日记，必须使用第一人称“我”来写。",
        "image_prompt": "一段用于生成这张照片的、详细的【英文】关键词。"
      }
    ]
    \`\`\`
    - **【image_prompt 绝对禁止】**: 绝对禁止包含任何中文字符、句子、特殊符号、或任何可能涉及敏感（NSFW）、暴力、血腥、政治的内容！也禁止真人！
    - **【image_prompt 必须是】**: 必须是纯英文的、用逗号分隔的【关键词组合】 (e.g., "1boy, solo, basketball jersey, in locker room, smiling, selfie")。
    - **【画风指令】**: 在 prompt 的末尾，总是加上画风指令，例如： \`best quality, masterpiece, anime style, cinematic lighting\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组照片的描述和绘画指令。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的相册内容。"
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
      let simulatedAlbumData;
      try {
        simulatedAlbumData = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedAlbum = simulatedAlbumData;
      await db.chats.put(chat);

      await renderCharAlbum();

    } catch (error) {
      console.error("生成模拟相册失败:", error);
      await showCustomAlert("生成失败", `无法生成模拟相册，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  // renderCharAlbum 旧版（无 viewPhotoDetail 点击事件）已删除
  // 保留上方有窥屏记录功能的版本

  async function handleGenerateBrowserHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在模拟“${chat.name}”的网上冲浪足迹...`);

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
    const recentHistoryWithUser = chat.history.slice(-maxMemory).map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
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
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【10到20条】TA最近的浏览器搜索/浏览记录。

# 核心规则
1.  **创造性与合理性**: 记录必须完全符合角色的性格、爱好、职业和生活环境。
2.  **多样性**: 记录类型要丰富，可以是帖子、文章、新闻、问答等。
3.  **【格式 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都代表一条浏览记录，并且【必须】使用以下格式:
    \`\`\`json
    [
      {
        "type": "text",
        "title": "精炼且吸引人的标题 (不超过20字)",
        "url": "www.example.com/article/123 (看起来像真实的简洁网址)",
        "content": "一篇200-400字的、分段良好的文章正文，使用\\n换行。"
      }
    ]
    \`\`\`
    
    **【绝对禁止】**: 你的回复中【绝对不能】包含 "type": "image" 的对象。所有记录都必须是文字内容。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- ** 你的聊天对象（用户）的人设**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组【纯文本】的浏览记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的浏览器记录。"
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
      let simulatedHistory;
      try {
        simulatedHistory = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedBrowserHistory = simulatedHistory;
      await db.chats.put(chat);

      await renderCharBrowserHistory();

    } catch (error) {
      console.error("生成模拟浏览器历史失败:", error);
      await showCustomAlert("生成失败", `无法生成浏览记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  // renderCharBrowserHistory 旧版（无图标/URL清理的简化版）已删除
  // 保留上方有地球图标和箭头的完善版本

  async function openCharArticle(index) {
    const char = state.chats[activeCharacterId];
    const articleData = char.simulatedBrowserHistory[index];
    if (!articleData) return;



    activeArticleForViewing = articleData;


    renderCharArticle(articleData);
    switchToCharScreen('char-browser-article-screen');



    const favBtn = document.getElementById('favorite-article-btn');

    const existingFavorite = await db.favorites.where({
      type: 'char_browser_article',
      'content.url': articleData.url
    }).first();
    favBtn.classList.toggle('active', !!existingFavorite);

  }


  async function toggleBrowserArticleFavorite() {
    if (!activeArticleForViewing || !activeCharacterId) return;

    const article = activeArticleForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-article-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_browser_article',
      'content.url': article.url
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_browser_article',

        content: {
          ...article,
          characterId: activeCharacterId,
          characterName: char.name
        },
        timestamp: Date.now()
      };
      await db.favorites.add(newFavorite);
      favBtn.classList.add('active');
      await showCustomAlert('操作成功', '已成功收藏到“我的收藏”页面！');
    }
  }

  function renderCharArticle(articleData) {
    const titleEl = document.getElementById('char-article-title'); // 顶部导航栏的小标题
    const contentEl = document.getElementById('char-article-content'); // 内容区域

    // 导航栏只显示来源或简略标题
    let navTitle = "网页浏览";
    if (articleData.url) {
      // 尝试从 URL 提取域名作为导航标题
      try {
        const urlObj = new URL(articleData.url.startsWith('http') ? articleData.url : `http://${articleData.url}`);
        navTitle = urlObj.hostname.replace('www.', '');
      } catch (e) {
        navTitle = articleData.title.substring(0, 10) + '...';
      }
    }
    titleEl.textContent = navTitle;

    contentEl.innerHTML = '';

    if (articleData.type === 'image') {
      // 图片类型的文章
      contentEl.innerHTML = `
            <div class="char-browser-image-description">
                <div style="font-size: 40px; margin-bottom: 20px; opacity: 0.5;">🖼️</div>
                ${articleData.title || '(无标题图片)'}
            </div>`;
    } else {
      // 文本类型的文章
      const largeTitle = `<div class="article-large-title">${articleData.title}</div>`;

      // 处理正文换行，包裹在 p 标签中
      const paragraphs = (articleData.content || '内容加载失败...')
        .split('\n')
        .filter(line => line.trim() !== '') // 过滤空行
        .map(line => `<p>${line}</p>`)
        .join('');

      contentEl.innerHTML = `
            ${largeTitle}
            <div class="article-body">
                ${paragraphs}
            </div>
        `;
    }
  }





  async function handleGenerateTaobaoHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在模拟“${chat.name}”的购物习惯...`);

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
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出TA最近的淘宝购物记录和账户余额。

# 核心规则
1.  **余额铁律 (最高优先级)**: 你【必须】根据角色的【经济状况】设定一个合理的 \`totalBalance\` (总余额)。例如，富有的角色应该有更高的余额，而学生或经济拮据的角色则应该有较低的余额。
2.  **合理性**: 购买记录必须完全符合角色的性格、爱好和经济状况。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个【单一的JSON对象】。
    - 你的回复必须以 \`{\` 开始，并以 \`}\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记。
    - 格式【必须】如下:
    \`\`\`json
    {
      "totalBalance": 12345.67, // (这是一个示例数字，你必须根据角色的经济状况生成一个全新的、合理的余额！)
      "purchases": [
        {
          "itemName": "一个具体、生动的商品名称",
          "price": 128.80,
          "status": "已签收",
          "reason": "这是角色购买这件商品的内心独白或理由，必须使用第一人称“我”来写。",
          "image_prompt": "一段用于生成这张商品图片的、详细的【英文】关键词, 风格为 realistic product photo, high quality, on a clean white background"
        }
      ]
    }
    \`\`\`
    - **purchases**: 一个包含12到15个商品对象的数组。
    - **status (订单状态)**: 只能从 "已签收", "待发货", "运输中", "待评价" 中选择。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请生成包含总余额和购买记录的JSON对象。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的淘宝购买记录和余额。"
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

      const jsonMatch = aiResponseContent.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error("AI返回的内容中未找到有效的JSON对象。");
      const simulatedTaobaoData = JSON.parse(jsonMatch[0]);


      if (!simulatedTaobaoData.purchases) {
        simulatedTaobaoData.purchases = [];
      }

      chat.simulatedTaobaoHistory = simulatedTaobaoData;
      await db.chats.put(chat);

      await renderCharTaobao();

    } catch (error) {
      console.error("生成模拟淘宝记录失败:", error);
      await showCustomAlert("生成失败", `无法生成购物记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }



  function openCharWallet() {
    renderCharWallet();
    switchToCharScreen('char-wallet-screen');
  }


  async function renderCharWallet() {
    const contentEl = document.getElementById('char-wallet-content');
    contentEl.innerHTML = '';

    // 获取当前角色信息
    const char = state.chats[activeCharacterId];
    const history = char.simulatedTaobaoHistory || {};
    const purchases = history.purchases || [];
    const totalBalance = history.totalBalance || 0;

    // 1. 显示账户余额卡片
    const summaryCard = document.createElement('div');
    summaryCard.style.cssText = `
        background-color: #fff;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        margin-bottom: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    `;
    summaryCard.innerHTML = `
        <p style="color: #8a8a8a; margin: 0 0 10px 0;">账户余额</p>
        <p style="font-size: 32px; font-weight: 600; color: #1f1f1f; margin: 0;">¥${totalBalance.toFixed(2)}</p>
    `;
    contentEl.appendChild(summaryCard);

    // 2. 显示亲属卡 (修复名字 + 增加解绑)
    try {
      const myWallet = await db.userWallet.get('main');
      const kinshipCard = myWallet?.kinshipCards?.find(c => c.chatId === activeCharacterId);

      if (kinshipCard) {
        // 【修复名字逻辑】优先使用聊天设置里的昵称，其次是动态昵称，最后是“我”
        const myNicknameInChat = char.settings.myNickname || state.qzoneSettings.nickname || '我';

        const cardDiv = document.createElement('div');
        // 样式：红色背景卡片，增加 relative 定位以便放置解绑按钮
        cardDiv.style.cssText = `
                background: linear-gradient(135deg, #ff5252, #ff1744); 
                color: white; 
                padding: 15px; 
                border-radius: 12px; 
                margin-bottom: 20px; 
                box-shadow: 0 4px 10px rgba(255,82,82,0.3); 
                display: flex; 
                flex-direction: column; 
                gap: 5px;
                position: relative; 
            `;

        const remaining = kinshipCard.limit - (kinshipCard.spent || 0);

        cardDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:14px; opacity:0.9; font-weight:500;">${myNicknameInChat} 赠送的亲属卡</div>
                    <div style="font-size:12px; opacity:0.8;">支付宝</div>
                </div>
                <div style="font-size:28px; font-weight:bold; margin:10px 0; font-family: 'DIN Alternate', sans-serif;">¥ ${remaining.toFixed(2)}</div>
                <div style="font-size:12px; opacity:0.8; display:flex; justify-content:space-between;">
                    <span>本月可用额度</span>
                    <span>总额 ¥${kinshipCard.limit}</span>
                </div>
                
                <!-- 解绑按钮 -->
                <button class="unbind-kinship-btn" data-chat-id="${activeCharacterId}" style="
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.4);
                    color: white;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 10px;
                    cursor: pointer;
                    backdrop-filter: blur(2px);
                ">解绑</button>
            `;
        contentEl.appendChild(cardDiv);
      }
    } catch (e) {
      console.error("渲染亲属卡失败:", e);
    }

    // 3. 显示最近支出
    const detailsTitle = document.createElement('h3');
    detailsTitle.textContent = '最近支出';
    detailsTitle.style.cssText = `font-size: 16px; color: #555; margin-bottom: 10px;`;
    contentEl.appendChild(detailsTitle);

    if (purchases.length === 0) {
      contentEl.innerHTML += '<p style="text-align:center; color: var(--text-secondary);">暂无支出记录。</p>';
    } else {
      purchases.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid #f0f0f0;
            `;
        itemEl.innerHTML = `
                <div>
                    <p style="font-weight: 500; margin: 0 0 4px 0;">${item.itemName}</p>
                    <p style="font-size: 12px; color: #8a8a8a; margin: 0;">${item.status}</p>
                </div>
                <div style="font-weight: 600; font-size: 16px; color: #ff5722;">- ¥${(item.price || 0).toFixed(2)}</div>
            `;
        contentEl.appendChild(itemEl);
      });
    }
  }





