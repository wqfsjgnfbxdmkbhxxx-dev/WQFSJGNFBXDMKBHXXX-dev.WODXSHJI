  let cphoneConversationRenderVersion = 0;
  window.invalidateCPhoneConversationRender = () => { cphoneConversationRenderVersion += 1; };

  async function renderCharSimulatedQQ() {
    const renderVersion = ++cphoneConversationRenderVersion;
    const renderedCharacterId = activeCharacterId;
    const listEl = document.getElementById('char-chat-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    if (!char) return;


    const userDisplayName = char.settings.myNickname || (state.qzoneSettings.nickname || '我');
    const lastRealMessage = char.history.filter(m => !m.isHidden).slice(-1)[0] || {
      content: '...'
    };


    let lastMsgContent = '...';
    if (lastRealMessage) {
      if (typeof lastRealMessage.content === 'string') {
        lastMsgContent = lastRealMessage.content;
      } else if (Array.isArray(lastRealMessage.content) && lastRealMessage.content[0]?.type === 'image_url') {
        lastMsgContent = '[图片]';
      } else if (lastRealMessage.type) {
        const typeMap = {
          'voice_message': '[语音]',
          'transfer': '[转账]',
          'ai_image': '[图片]'
        };
        lastMsgContent = typeMap[lastRealMessage.type] || `[${lastRealMessage.type}]`;
      }
    }


    const myAvatar = char.settings.myAvatar || defaultAvatar;
    const myFrame = char.settings.myAvatarFrame || '';
    let avatarHtml;
    if (myFrame) {
      avatarHtml = `<div class="avatar-group has-frame" style="width: 45px; height: 45px;"><div class="avatar-with-frame" style="width: 45px; height: 45px;"><img src="${myAvatar}" class="avatar-img" style="border-radius: 50%;"><img src="${myFrame}" class="avatar-frame"></div></div>`;
    } else {
      avatarHtml = `<div class="avatar-group" style="width: 45px; height: 45px;"><img src="${myAvatar}" class="avatar" style="border-radius: 50%; width: 45px; height: 45px;"></div>`;
    }

    const userChatItem = document.createElement('div');
    userChatItem.className = 'chat-list-item';

    userChatItem.dataset.conversationIndex = "-1";
    userChatItem.innerHTML = `
        ${avatarHtml}
        <div class="info">
            <div class="name-line">
                <span class="name">${userDisplayName}</span>
            </div>
            <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
        </div>
    `;
    listEl.appendChild(userChatItem);


    const allNpcs = await db.npcs.toArray();
    if (renderVersion !== cphoneConversationRenderVersion || activeCharacterId !== renderedCharacterId) return;
    const npcMap = new Map(allNpcs.map(npc => [npc.name, npc]));
    const conversations = char.simulatedConversations || [];

    if (conversations.length === 0 && !userChatItem) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">点击右上角刷新按钮，<br>看看TA最近都和谁聊天了吧！</p>';
      return;
    }

    conversations.forEach((convo, index) => {

      if (convo.type === 'private_user') {
        return;
      }


      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.conversationIndex = index;

      let lastMessage, avatarHtml, displayName;

      if (convo.type === 'group') {
        displayName = convo.groupName + ` <span class="group-tag">群</span>`;
        lastMessage = convo.messages.slice(-1)[0] || {
          content: '...'
        };
        const groupAvatarPrompt = `logo, simple, flat design, for a group chat named '${convo.groupName}'`;
        const avatarUrl = state.globalSettings.enableAiDrawing ? getPollinationsImageUrl(groupAvatarPrompt) : defaultGroupAvatar;
        avatarHtml = `<div class="avatar-group"><img src="${avatarUrl}" class="avatar" style="border-radius: 50%;"></div>`;

      } else {
        displayName = convo.participant.name;
        lastMessage = convo.messages.slice(-1)[0] || {
          content: '...'
        };
        const npcData = npcMap.get(displayName);
        let avatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
          (state.globalSettings.enableAiDrawing ? getPollinationsImageUrl(convo.participant.avatar_prompt || 'anime person') : defaultGroupMemberAvatar);
        avatarHtml = `<div class="avatar-group"><img src="${avatarUrl}" class="avatar" style="border-radius: 50%;"></div>`;
      }

      let lastMsgContent = '...';
      if (lastMessage && lastMessage.content) {
        lastMsgContent = lastMessage.content;
      }

      item.innerHTML = `
            ${avatarHtml}
            <div class="info">
                <div class="name-line">
                    <span class="name">${displayName}</span>
                </div>
                <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
            </div>
        `;
      listEl.appendChild(item);
    });
  }

  async function handleGenerateSimulatedQQ() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在根据“${chat.name}”的记忆和人设，生成全新的社交动态...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const allNpcs = await db.npcs.toArray();
    const associatedNpcs = allNpcs.filter(npc =>
      npc.associatedWith && npc.associatedWith.includes(activeCharacterId)
    );
    let npcContext = "# 你的社交圈 (绑定的NPC)\n";
    if (associatedNpcs.length > 0) {
      npcContext += "这是你认识的、关系密切的NPC。在生成对话时，你应该【优先】与他们互动。\n";
      associatedNpcs.forEach(npc => {
        npcContext += `- **姓名**: ${npc.name}\n  - **人设**: ${npc.persona}\n`;
      });
    } else {
      npcContext += "（你目前没有绑定的NPC伙伴，可以自由创造新的NPC。）\n";
    }

    const userDisplayNameForAI = state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname ? '用户' : state.qzoneSettings.nickname;
    const userNicknameInThisChat = chat.settings.myNickname || userDisplayNameForAI;
    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistoryWithUser_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistoryWithUser_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userNicknameInThisChat : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
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
      .map(book => `\n## 世界书《${book.name}》设定 (你可以将其中角色作为聊天对象):\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const characterOriginalName = chat.originalName || chat.name;
    const stickerContext = getGroupStickerContextForPrompt(chat);

    const systemPrompt = `
# 你的任务
你是一个虚拟社交生活模拟器，扮演角色“${chat.name}”。你的任务是虚构出【5到7段】TA最近的QQ聊天记录。

# 核心规则
1.  **【NPC唯一性铁律】**: 在你本次生成的所有对话中（包括私聊和群聊），每一个NPC的名字【必须是独一-无二的】。绝对禁止出现重名的NPC，禁止出现重复群聊。
2.  **【NPC来源】**: 你应该优先从“你的社交圈 (绑定的NPC)”和“世界书”中寻找角色作为聊天对象。如果不够，你也可以自由创造全新的NPC，对话内容要多样化，反映角色的生活。
3.  **关联性**: 对话内容应巧妙地反映角色的长期记忆、世界观，以及与用户互动可能带来的心情变化。
4.  **简洁性**: 每段对话的总长度应在8到15句之间。
# 格式铁律 (最高优先级)
- 你的回复【必须且只能】是一个JSON数组格式的字符串，以 \`[\` 开始，并以 \`]\` 结束。
- 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记。
- 数组中的每个元素都代表一段对话，且【必须】是以下两种格式之一：



### 格式 A：与NPC的私聊
\`\`\`json
{
  "type": "private_npc",
  "participant": {
    "name": "NPC的名字",
    "avatar_prompt": "(仅当NPC是新创造时提供)一段用于生成头像的【英文】关键词, 风格为动漫/插画/二次元等, 禁止真人"
  },
"messages": [
  {"sender": "${characterOriginalName}", "content": "对话内容1"},
  {"sender": "NPC的名字", "content": "对话内容2"},
  {"sender": "${characterOriginalName}", "type": "sticker", "meaning": "表情的含义(必须从可用表情列表选择)"}
]
}
\`\`\`

### 格式 B：群聊
\`\`\`json
{
  "type": "group",
  "groupName": "一个虚构的群名",
  "participants": [
    {"name": "NPC成员1", "avatar_prompt": "(仅当NPC是新创造时提供) 成员1头像【英文】关键词"},
    {"name": "NPC成员2", "avatar_prompt": "(仅当NPC是新创造时提供) 成员2头像【英文】关键词"}
  ],
"messages": [
  {"sender": "${characterOriginalName}", "content": "我在群里说的话"},
  {"sender": "NPC成员1", "content": "成员1回复我"},
  {"sender": "NPC成员2", "type": "sticker", "meaning": "表情的含义(必须从可用表情列表选择)"}
]
}
\`\`\`

# 角色与上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**: ${longTermMemoryContext}
- **世界观**: ${worldBookContext}
- **最近与用户的互动**: ${recentHistoryWithUser}
${npcContext}
# 可用表情包 (必须严格遵守！)
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
${stickerContext}
现在，请严格按照格式铁律，生成聊天记录的JSON数组。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成模拟聊天记录。"
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
      let simulatedConversations;
      try {
        simulatedConversations = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }

      chat.simulatedConversations = simulatedConversations;
      await db.chats.put(chat);

      await renderCharSimulatedQQ();


      const hiddenMessage = {
        role: 'system',
        content: `[系统指令：你刚刚在自己的手机上活动了一番（和朋友聊天、逛群等）。现在请根据你的角色设定，主动给用户发一条消息，可以聊聊你刚才看到或聊到的趣事，或者仅仅是问候一下。]`,
        timestamp: Date.now(),
        isHidden: true
      };
      chat.history.push(hiddenMessage);
      await db.chats.put(chat);
      triggerAiResponse();

    } catch (error) {
      console.error("生成模拟聊天失败:", error);
      await showCustomAlert("生成失败", `无法生成模拟聊天记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleContinueRealConversationFromCPhone() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;



    try {
      const {
        proxyUrl,
        apiKey,
        model
      } = state.apiConfig;
      if (!proxyUrl || !apiKey || !model) {
        throw new Error('API未配置，无法生成对话。');
      }

      const maxMemory = parseInt(chat.settings.maxMemory) || 10;
      const historySlice = chat.history.slice(-maxMemory);
      const filteredHistory = await filterHistoryWithDoNotSendRules(historySlice, activeCharacterId);
      const myNickname = chat.settings.myNickname || '我';






      const userPersona = chat.settings.myPersona || '用户';


      const longTermMemoryContext = `# 长期记忆 (必须严格遵守)\n${getMemoryContextForPrompt(chat) || '- (暂无)'}`;


      let worldBookContext = '';
      // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
      let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
      // 添加所有全局世界书
      state.worldBooks.forEach(wb => {
        if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
          allWorldBookIds.push(wb.id);
        }
      });

      if (allWorldBookIds.length > 0) {
        const linkedContents = allWorldBookIds.map(bookId => {
          const worldBook = state.worldBooks.find(wb => wb.id === bookId);
          if (!worldBook || !Array.isArray(worldBook.content)) return '';
          const formattedEntries = worldBook.content
            .filter(entry => entry.enabled !== false)
            .map(entry => `\n### 条目: ${entry.comment || '无备注'}\n**内容:**\n${entry.content}`)
            .join('');
          return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
        }).filter(Boolean).join('');
        if (linkedContents) {
          worldBookContext = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
        }
      }

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
      const stickerContext = getStickerContextForPrompt(chat);
      const systemPrompt = `
# 你的核心任务
你正在扮演角色“${chat.originalName}”。用户刚刚在TA的手机（CPhone）上点击了一个按钮，希望你能继续你们之前的对话。你的任务是根据上下文，生成【3到5条】符合你人设的、简短的、连续的新回复。

# 输出格式铁律 (最高优先级)
- 你的回复【必须】是一个JSON数组，每个对象代表一条消息。
- 格式: \`[{"type": "text", "content": "第一句话"}, {"type": "text", "content": "第二句话"}, {"type": "sticker", "meaning": "表情的含义(从可用表情列表选择)"}]\`
- 你可以自由组合使用 "text", "sticker", "ai_image", "voice_message" 等多种消息类型。
请根据当前情景和你的情绪，从列表中【选择一个最合适的】表情含义来使用 "sticker" 指令。尽量让你的表情丰富多样，避免重复。
# 你的角色设定
${chat.settings.aiPersona}
# 可用表情包 (必须严格遵守！)
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
${stickerContext}

# 你的聊天对象（用户）的人设
${userPersona}  

# 供你参考的上下文
- **你的本名**: "${chat.originalName}"
- **用户的备注**: "${myNickname}"
${worldBookContext}
${longTermMemoryContext}
${multiLayeredSummaryContext} 
- **你们最后的对话**:
${historySlice.map(msg => `${msg.role === 'user' ? myNickname : chat.name}: ${String(msg.content)}`).join('\n')}

现在，请继续这场对话。
`;


      const messagesPayload = filteredHistory.map(msg => ({
        role: msg.role,
        content: `${msg.role === 'user' ? myNickname : chat.name}: ${String(msg.content)}`
      }));

      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesPayload);

        let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesPayload],
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

      if (!response.ok) {
        throw new Error(`API 请求失败: ${(await response.json()).error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const messagesArray = parseAiResponse(aiResponseContent);

      if (!messagesArray || messagesArray.length === 0) {
        throw new Error("AI返回了空内容。");
      }

      let newMessagesCount = 0;
      let messageTimestamp = Date.now();
      for (const msgData of messagesArray) {
        const baseMessage = {
          role: 'assistant',
          senderName: chat.originalName,
          timestamp: messageTimestamp++
        };
        let aiMessage = null;
        switch (msgData.type) {
          case 'text':
            aiMessage = {
              ...baseMessage,
              content: String(msgData.content || msgData.message)
            };
            break;
          case 'sticker':
            if (msgData.meaning) {
              const sticker = findBestStickerMatch(msgData.meaning, state.userStickers);
              if (sticker) {
                aiMessage = {
                  ...baseMessage,
                  type: 'sticker',
                  content: sticker.url,
                  meaning: sticker.name
                };
              } else {
                console.warn(`AI (CPhone) 尝试使用一个不存在的表情: "${msgData.meaning}"`);
                aiMessage = null;
              }
            } else {
              console.warn("AI (CPhone) 发送了一个没有 'meaning' 的 sticker 指令。", msgData);
              aiMessage = {
                ...baseMessage,
                type: 'sticker',
                content: msgData.url,
                meaning: '未知表情'
              };
            }
            break;
        }
        if (aiMessage) {
          chat.history.push(aiMessage);
          newMessagesCount++;
        }
      }

      if (newMessagesCount > 0) {
        chat.unreadCount = (chat.unreadCount || 0) + newMessagesCount;
      }

      await db.chats.put(chat);
      await renderChatList();

      if (newMessagesCount > 0) {
        showNotification(chat.id, `发来了 ${newMessagesCount} 条新消息`);
      }

    } catch (error) {
      console.error("从CPhone推进真实对话失败:", error);
      await showCustomAlert('操作失败', `无法生成新回复: ${error.message}`);
    }
  }

  async function loadMoreMirroredMessages() {
    if (isLoadingMoreCphoneMessages || !activeCharacterId) return;
    isLoadingMoreCphoneMessages = true;

    const messagesContainer = document.getElementById('char-conversation-messages');
    const mainChar = state.chats[activeCharacterId];
    if (!mainChar) {
      isLoadingMoreCphoneMessages = false;
      return;
    }

    showLoader(messagesContainer, 'top');
    const oldScrollHeight = messagesContainer.scrollHeight;


    await new Promise(resolve => setTimeout(resolve, 500));

    const totalMessages = mainChar.history.length;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const nextSliceEnd = totalMessages - cphoneRenderedCount;
    const nextSliceStart = Math.max(0, nextSliceEnd - renderWindow);

    const messagesToPrepend = mainChar.history.slice(nextSliceStart, nextSliceEnd);


    hideLoader(messagesContainer);

    if (messagesToPrepend.length === 0) {
      isLoadingMoreCphoneMessages = false;
      return;
    }


    for (const msg of messagesToPrepend.reverse()) {
      const mirroredMsg = {
        ...msg,
        role: msg.role === 'user' ? 'assistant' : 'user'
      };


      const tempChatObjectForRendering = {
        id: 'temp_user_chat_mirror',
        isGroup: false,
        name: mainChar.name,
        settings: {
          ...mainChar.settings,
          myAvatar: mainChar.settings.aiAvatar,
          myAvatarFrame: mainChar.settings.aiAvatarFrame,
          aiAvatar: mainChar.settings.myAvatar,
          aiAvatarFrame: mainChar.settings.myAvatarFrame
        }
      };

      const messageEl = await createMessageElement(mirroredMsg, tempChatObjectForRendering);
      if (messageEl) {
        messagesContainer.prepend(messageEl);
      }
    }

    cphoneRenderedCount += messagesToPrepend.length;


    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;

    isLoadingMoreCphoneMessages = false;
  }

  async function loadMoreMyPhoneMessages() {
    if (isLoadingMoreMyPhoneMessages || !activeMyPhoneCharacterId) return;
    isLoadingMoreMyPhoneMessages = true;

    const messagesContainer = document.getElementById('myphone-conversation-messages');
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    // 只有在查看真实对话（index === -1）时才支持滚动加载
    if (myphoneActiveConversationIndex !== -1) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    showLoader(messagesContainer, 'top');
    const oldScrollHeight = messagesContainer.scrollHeight;

    await new Promise(resolve => setTimeout(resolve, 500));

    const totalMessages = char.history.filter(m => !m.isHidden).length;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const nextSliceEnd = totalMessages - myphoneRenderedCount;
    const nextSliceStart = Math.max(0, nextSliceEnd - renderWindow);

    const allVisibleMessages = char.history.filter(m => !m.isHidden);
    const messagesToPrepend = allVisibleMessages.slice(nextSliceStart, nextSliceEnd);

    hideLoader(messagesContainer);

    if (messagesToPrepend.length === 0) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    // 创建临时聊天对象用于渲染（角色视角）
    const tempChatObject = {
      id: 'temp_myphone_user_chat',
      isGroup: false,
      name: state.qzoneSettings.nickname || '我',
      settings: {
        ...char.settings,
        myAvatar: char.settings.myAvatar || defaultAvatar,
        myAvatarFrame: char.settings.myAvatarFrame || '',
        aiAvatar: char.settings.aiAvatar || defaultAvatar,
        aiAvatarFrame: char.settings.aiAvatarFrame || ''
      }
    };

    for (const msg of messagesToPrepend.reverse()) {
      const messageEl = await createMessageElement(msg, tempChatObject);
      if (messageEl) {
        messagesContainer.prepend(messageEl);
      }
    }

    myphoneRenderedCount += messagesToPrepend.length;

    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;

    isLoadingMoreMyPhoneMessages = false;
  }

  async function openCharSimulatedConversation(conversationIndex) {
    const openedCharacterId = activeCharacterId;
    const renderVersion = ++cphoneConversationRenderVersion;
    const mainChar = state.chats[openedCharacterId];
    if (!mainChar) return;

    cphoneActiveConversationType = (conversationIndex === -1) ? 'private_user' : mainChar.simulatedConversations[conversationIndex]?.type;

    const bodyEl = document.getElementById('char-conversation-messages');
    bodyEl.innerHTML = '';
    bodyEl.dataset.theme = mainChar.settings.theme || 'default';
    const isDarkMode = document.getElementById('phone-screen').classList.contains('dark-mode');
    bodyEl.style.backgroundColor = isDarkMode ? '#000000' : '#f0f2f5';

    let tempChatObjectForRendering;
    let messagesToRender = [];
    const allNpcs = await db.npcs.toArray();
    if (renderVersion !== cphoneConversationRenderVersion || activeCharacterId !== openedCharacterId) return;
    const npcMap = new Map(allNpcs.map(npc => [npc.name, npc]));

    if (conversationIndex === -1) {

      cphoneActiveConversationType = 'private_user';
      const titleEl = document.getElementById('char-conversation-partner-name');

      const inputEl = document.getElementById('char-simulated-input');

      bodyEl.innerHTML = '';
      titleEl.textContent = mainChar.settings.myNickname || (state.qzoneSettings.nickname || '我');
      inputEl.placeholder = `与 ${mainChar.settings.myNickname || '我'} 的对话 (只读)`;

      cphoneRenderedCount = 0;
      isLoadingMoreCphoneMessages = false;

      const history = mainChar.history;
      const renderWindow = state.globalSettings.chatRenderWindow || 50;
      const initialMessages = history.slice(-renderWindow);

      tempChatObjectForRendering = {
        id: 'temp_user_chat_mirror',
        isGroup: false,
        name: mainChar.name,
        settings: {
          ...mainChar.settings,
          myAvatar: mainChar.settings.aiAvatar,
          myAvatarFrame: mainChar.settings.aiAvatarFrame,
          aiAvatar: mainChar.settings.myAvatar,
          aiAvatarFrame: mainChar.settings.myAvatarFrame
        }
      };

      messagesToRender = initialMessages.map(msg => ({
        ...msg,
        role: msg.role === 'user' ? 'assistant' : 'user'
      }));
      cphoneRenderedCount = initialMessages.length;

    } else {

      const conversation = mainChar.simulatedConversations[conversationIndex];
      if (!conversation) return;
      cphoneActiveConversationType = conversation.type;

      const titleEl = document.getElementById('char-conversation-partner-name');

      const inputEl = document.getElementById('char-simulated-input');

      if (conversation.type === 'group') {
        titleEl.textContent = `${conversation.groupName} (${conversation.participants.length + 1})`;
        inputEl.placeholder = `在 ${conversation.groupName} 中聊天`;
        tempChatObjectForRendering = {
          id: 'temp_group_chat',
          isGroup: true,
          name: conversation.groupName,
          originalName: mainChar.originalName,
          members: conversation.participants.map(p => {
            const npcData = npcMap.get(p.name);
            let avatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
              (state.globalSettings.enableAiDrawing ?
                getPollinationsImageUrl(p.avatar_prompt || 'anime person') :
                defaultGroupMemberAvatar);
            return {
              originalName: p.name,
              groupNickname: p.name,
              avatar: avatarUrl
            };
          }),
          settings: {
            ...mainChar.settings,
            myNickname: mainChar.name,
            myAvatar: mainChar.settings.aiAvatar,
            myAvatarFrame: mainChar.settings.aiAvatarFrame,
          }
        };
      } else {
        titleEl.textContent = conversation.participant.name;
        inputEl.placeholder = `与 ${conversation.participant.name} 的对话`;
        const npcData = npcMap.get(conversation.participant.name);
        const npcAvatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
          (state.globalSettings.enableAiDrawing ?
            getPollinationsImageUrl(conversation.participant.avatar_prompt || 'anime person') :
            defaultGroupMemberAvatar);
        tempChatObjectForRendering = {
          id: 'temp_npc_chat',
          isGroup: false,
          name: conversation.participant.name,
          originalName: mainChar.originalName,
          settings: {
            ...mainChar.settings,
            myAvatar: mainChar.settings.aiAvatar,
            myAvatarFrame: mainChar.settings.aiAvatarFrame,
            aiAvatar: npcAvatarUrl,
            aiAvatarFrame: ''
          }
        };
      }
      messagesToRender = conversation.messages;
    }



    for (const msg of messagesToRender) {
      if (renderVersion !== cphoneConversationRenderVersion || activeCharacterId !== openedCharacterId) return;
      let role = msg.role;
      if (conversationIndex !== -1) {
        const isFromMainChar = msg.sender === (mainChar.originalName || mainChar.name);
        role = isFromMainChar ? 'user' : 'assistant';
      }

      const tempMessageObject = {
        role: role,
        senderName: msg.sender || (role === 'user' ? tempChatObjectForRendering.settings.myNickname : tempChatObjectForRendering.name),
        timestamp: msg.timestamp || (Date.now() + Math.random())
      };


      if (msg.type === 'sticker' && msg.meaning) {

        const sticker = state.userStickers.find(s => s.name === msg.meaning);
        if (sticker) {
          tempMessageObject.content = sticker.url;
          tempMessageObject.meaning = msg.meaning;
          tempMessageObject.type = 'sticker';
        } else {

          console.warn(`模拟表情含义 "${msg.meaning}" 在库中未找到。`);
          tempMessageObject.content = `[表情: ${msg.meaning}]`;
          tempMessageObject.type = 'text';
        }
      } else {

        tempMessageObject.content = msg.content;
        tempMessageObject.type = msg.type || 'text';
      }

      const bubbleElement = await createMessageElement(tempMessageObject, tempChatObjectForRendering);
      if (renderVersion !== cphoneConversationRenderVersion || activeCharacterId !== openedCharacterId) return;
      if (bubbleElement) {
        bodyEl.appendChild(bubbleElement);
      }
    }

    switchToCharScreen('char-qq-conversation-screen');
    setTimeout(() => {
      if (renderVersion === cphoneConversationRenderVersion && activeCharacterId === openedCharacterId) {
        bodyEl.scrollTop = bodyEl.scrollHeight;
      }
    }, 0); // 渲染完成后滚动到底部
  }

  function closeSimulatedTranscriptModal() {
    document.getElementById('char-qq-transcript-modal').classList.remove('visible');
  }



