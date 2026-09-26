  async function handleGenerateSimulatedDiaries() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”翻开TA的日记本...`);

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
    const userPersona = chat.settings.myPersona || '(未设置)';
    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器和故事作家。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【5到8篇】TA最近可能会写的日记。

# 核心规则
1.  **【时间 (最高优先级)】**:
    -   今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。
    -   你生成的【所有】日记的标题日期，【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
2.  **【沉浸感】**: 每一篇日记都必须使用【第一人称视角 ("我")】来写，并且要充满角色的个人情感、思考和秘密。在日记中描述自己的行为或想法时，【绝对禁止】使用第三人称“他”或“她” (TA)。
3.  **【长度】**: 每一篇日记的正文长度【必须不少于300字】。
4.  **【格式铁律 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一篇日记，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "这篇日记的标题，例如：9月20日 晴",
        "content": "这里是日记的详细正文，必须支持换行符\\n，并且必须巧妙地使用下面的【日记专属Markdown语法】来丰富文本表现力。"
      }
    ]
    \`\`\`
5.  **【占位符替换 (最高优先级)】**: 在你的日记内容中，【绝对不能】出现 "{{user}}" 这个占位符。你【必须】使用 “${userDisplayNameForAI}” 来指代你的聊天对象（用户）。
6.  **【日记专属Markdown语法 (必须使用！)】**:
    -   \`**加粗文字**\`: 用于强调。
    -   \`~~划掉的文字~~\`: 用于表示改变主意或自我否定。
    -   \`!h{黄色高亮}\`: 用于标记关键词或重要信息。
    -   \`!u{粉色下划线}\`: 用于标注人名、地名或特殊名词。
    -   \`!e{粉色强调}\`: 用于表达强烈的情绪。
    -   \`!w{手写体}\`: 用于写下引言、歌词或特殊笔记。
    -   \`!m{凌乱的手写体}\`: 用于表达激动、慌乱或潦草记录时的心情。
    -   \`||涂黑||\`: 用于隐藏秘密或敏感词汇 (每次涂黑2~5个字)。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的聊天对象设定**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始撰写这组充满真情实感、并熟练运用了Markdown语法的日记。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的日记内容。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);


      let reqBody = {
        model: model,
        messages: [{
          role: 'system',
          content: systemPrompt
        }, ...messagesForApi],
        temperature: state.globalSettings.apiTemperature || 0.95
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
      let simulatedDiaries;
      try {
        simulatedDiaries = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.diary = simulatedDiaries.map(entry => ({
        id: Date.now() + Math.random(),
        title: entry.title,
        content: entry.content,
        timestamp: Date.now()
      }));

      await db.chats.put(chat);
      await renderCharDiaryList();

    } catch (error) {
      console.error("生成模拟日记失败:", error);
      await showCustomAlert("生成失败", `无法生成日记，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleWriteNewDiaryEntry() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”写一篇新日记...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId => state.worldBooks.find(wb => wb.id === bookId)).filter(Boolean).map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`).join('');


    const systemPrompt = `          
# 你的任务
你是一个虚拟生活模拟器和故事作家。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【1篇】TA今天可能会写的日记。

# 核心规则
1.  **【【【时间铁律 (最高优先级)】】】**:
    -   今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。
    -   你生成的日记标题日期【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
2.  **【【【沉浸感铁律】】】**: 日记必须使用【第一人称视角 ("我")】来写，并且要充满角色的个人情感、思考和秘密。在日记中描述自己的行为或想法时，【绝对禁止】使用第三人称“他”或“她” (TA)。
3.  **【【【长度铁律】】】**: 日记的正文长度【必须不少于300字】。
4.  **【【【格式铁律 (最高优先级)】】】**: 你的回复【必须且只能】是一个JSON数组，且数组中【只包含一个】对象，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "这篇日记的标题，例如：9月20日 晴",
        "content": "这里是日记的详细正文，必须支持换行符\\n，并且必须巧妙地使用下面的【日记专属Markdown语法】来丰富文本表现力。"
      }
    ]
    \`\`\`
5.  **【【【日记专属Markdown语法 (必须使用！)】】】**:
    -   \`**加粗文字**\`: 用于强调。
    -   \`~~划掉的文字~~\`: 用于表示改变主意或自我否定。
    -   \`!h{黄色高亮}\`: 用于标记关键词或重要信息。
    -   \`!u{粉色下划线}\`: 用于标注人名、地名或特殊名词。
    -   \`!e{粉色强调}\`: 用于表达强烈的情绪。
    -   \`!w{手写体}\`: 用于写下引言、歌词或特殊笔记。
    -   \`!m{凌乱的手写体}\`: 用于表达激动、慌乱或潦草记录时的心情。
    -   \`||涂黑||\`: 用于隐藏秘密或敏感词汇(每次涂黑2~5个字)。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始撰写这篇充满真情实感、并熟练运用了Markdown语法的日记。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，写一篇新日记。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);
      let reqBody = {
          model: model,
          messages: [{
            role: 'system',
            content: systemPrompt
          }, ...messagesForApi],
          temperature: state.globalSettings.apiTemperature || 0.95
      };
      if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
      if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
      if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
      if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
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
      let newDiaryEntry;
      try {
        newDiaryEntry = JSON.parse(cleanedJsonString)[0];
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      if (!chat.diary) chat.diary = [];

      chat.diary.push({
        id: Date.now(),
        title: newDiaryEntry.title,
        content: newDiaryEntry.content,
        timestamp: Date.now()
      });

      await db.chats.put(chat);
      await renderCharDiaryList();

    } catch (error) {
      console.error("生成新日记失败:", error);
      await showCustomAlert("生成失败", `错误: ${error.message}`);
    }
  }

  function renderCharDiaryList() {
    const listEl = document.getElementById('char-diary-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    const diaries = (char.diary || []).slice().reverse();

    if (diaries.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">日记本还是空的。</p>';
      return;
    }

    // SVG 图标: 书本图标
    const diaryIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    // SVG 图标: 右箭头
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    diaries.forEach(entry => {
      const item = document.createElement('div');
      // 注意：移除了旧的 'list-item' 类
      item.className = 'diary-item';

      // 格式化日期
      const dateStr = new Date(entry.timestamp).toLocaleDateString('zh-CN');

      item.innerHTML = `
             <div class="cphone-item-icon-box diary-icon-style">
                ${diaryIconSVG}
            </div>
            <div class="cphone-item-info">
                <div class="cphone-item-title">${entry.title}</div>
                <div class="cphone-item-preview">${dateStr}</div>
            </div>
            <div class="cphone-item-arrow">
                ${arrowIcon}
            </div>
        `;

      item.addEventListener('click', () => viewDiary(entry.id));
      addLongPressListener(item, () => deleteDiary(entry.id));
      listEl.appendChild(item);
    });
  }



  async function viewDiary(diaryId) {
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;

    const entry = char.diary.find(d => d.id === diaryId);
    if (entry) {

      activeDiaryForViewing = entry;

      const titleEl = document.getElementById('char-diary-detail-title');
      const contentEl = document.getElementById('char-diary-detail-content');
      const favBtn = document.getElementById('favorite-diary-btn');

      titleEl.textContent = entry.title;
      const formattedContent = parseMarkdown(entry.content)
        .split('\n')
        .map(p => `<p>${p || '&nbsp;'}</p>`)
        .join('');
      contentEl.innerHTML = formattedContent;


      const existingFavorite = await db.favorites.where({
        type: 'char_diary',
        'content.id': diaryId
      }).first();
      favBtn.classList.toggle('active', !!existingFavorite);

      switchToCharScreen('char-diary-detail-screen');

      // 记录窥屏行为
      await logSingleItemViewing(activeCharacterId, 'diary', entry);
    }
  }


  async function toggleDiaryFavorite() {
    if (!activeDiaryForViewing || !activeCharacterId) return;

    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-diary-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_diary',
      'content.id': diary.id
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_diary',

        content: {
          id: diary.id,
          title: diary.title,
          content: diary.content,
          timestamp: diary.timestamp,
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



  async function toggleMemoFavorite() {

    if (!activeMemoForViewing || !activeCharacterId) return;

    const memo = activeMemoForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-memo-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_memo',
      'content.id': memo.id
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_memo',

        content: {
          id: memo.id,
          title: memo.title,
          content: memo.content,
          timestamp: memo.timestamp,
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


  async function deleteDiary(diaryId) {
    const confirmed = await showCustomConfirm('删除日记', '确定要删除这篇日记吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      const char = state.chats[activeCharacterId];
      char.diary = char.diary.filter(d => d.id !== diaryId);
      await db.chats.put(char);
      renderCharDiaryList();
    }
  }

  function editDiary() {
    if (!activeDiaryForViewing || !activeCharacterId) return;

    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;

    const escapedTitle = diary.title.replace(/"/g, '&quot;');
    const escapedContent = diary.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">标题</label>
          <input id="edit-diary-title-input" type="text" value="${escapedTitle}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:16px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">内容</label>
          <textarea id="edit-diary-content-input" rows="10" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:15px;box-sizing:border-box;resize:vertical;line-height:1.6;">${escapedContent}</textarea>
        </div>
      </div>`;

    window._modalResolve = null;
    window._modalTitle.textContent = '编辑日记';
    window._modalBody.innerHTML = formHtml;

    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.style.maxHeight = '';
      modalFooter.style.overflowY = '';
      modalFooter.innerHTML = `
        <button id="custom-modal-cancel">取消</button>
        <button id="custom-modal-confirm" class="confirm-btn">保存</button>`;
    }

    document.getElementById('custom-modal-cancel').onclick = () => hideCustomModal();
    document.getElementById('custom-modal-confirm').onclick = async () => {
      const newTitle = document.getElementById('edit-diary-title-input').value.trim();
      const newContent = document.getElementById('edit-diary-content-input').value;
      if (!newTitle) { await showCustomAlert('提示', '标题不能为空。'); return; }

      const entryIndex = char.diary.findIndex(d => d.id === diary.id);
      if (entryIndex === -1) return;

      char.diary[entryIndex].title = newTitle;
      char.diary[entryIndex].content = newContent;
      await db.chats.put(char);

      activeDiaryForViewing = char.diary[entryIndex];
      document.getElementById('char-diary-detail-title').textContent = newTitle;
      const formattedContent = parseMarkdown(newContent)
        .split('\n')
        .map(p => `<p>${p || '&nbsp;'}</p>`)
        .join('');
      document.getElementById('char-diary-detail-content').innerHTML = formattedContent;

      renderCharDiaryList();
      hideCustomModal();
      await showCustomAlert('编辑成功', '日记已更新。');
    };

    showCustomModal();
  }




