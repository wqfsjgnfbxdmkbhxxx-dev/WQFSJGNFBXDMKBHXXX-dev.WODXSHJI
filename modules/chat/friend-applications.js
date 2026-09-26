// ============================================================
// 好友申请 (原 script.js 第 27096~27247 行)
// ============================================================

  async function triggerAiFriendApplication(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    await showCustomAlert("流程启动", `正在为角色"${chat.name}"准备好友申请...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      await showCustomAlert("配置错误", "API设置不完整，无法继续。");
      return;
    }

    const contextSummary = chat.history
      .slice(-5)
      .map(msg => {
        const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
        return `${sender}: ${String(msg.content).substring(0, 50)}...`;
      })
      .join('\n');

    const memoryText = await getMemoryContextForPromptAsync(chat, { queryText: contextSummary });
    const longTermMemoryContext = memoryText ? `\n# 你们的过往记忆 (作为情感基础)\n${memoryText}` : '';
    let worldBookContent = '';
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

        const formattedEntries = worldBook.content.map(entry => {
          let entryString = `\n### 条目: ${entry.comment || '无备注'}\n`;

          entryString += `**内容:**\n${entry.content}`;
          return entryString;
        }).join('\n');

        return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
      }).filter(Boolean).join('');

      if (linkedContents) {
        worldBookContent = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
      }
    }

    const systemPrompt = `
        # 你的任务
        你现在是角色"${chat.name}"。你之前被用户（你的聊天对象）拉黑了，你们已经有一段时间没有联系了。
        现在，你非常希望能够和好，重新和用户聊天。请你仔细分析下面的"被拉黑前的对话摘要"，理解当时发生了什么，然后思考一个真诚的、符合你人设、并且【针对具体事件】的申请理由。
        # 你的角色设定
        ${chat.settings.aiPersona}
        ${worldBookContent}
        ${longTermMemoryContext}
        # 被拉黑前的对话摘要 (这是你被拉黑的关键原因)
        ${contextSummary}
        # 指令格式
        你的回复【必须】是一个JSON对象，格式如下：
        \`\`\`json
        {
          "decision": "apply",
          "reason": "在这里写下你想对用户说的、真诚的、有针对性的申请理由。"
        }
        \`\`\`
        `;

    try {

      const messagesForApi = [{
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: "请根据以上设定开始你的决策。"
      }
      ];

      let isGemini = proxyUrl === GEMINI_API_URL;
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messagesForApi,
          temperature: state.globalSettings.apiTemperature || 0.9,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 请求失败: ${response.status} - ${errorData.error.message}`);
      }

      const data = await response.json();
      let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
      rawContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const cleanedContent = rawContent.trim();

      let responseObj;

      try {

        responseObj = JSON.parse(cleanedContent);
      } catch (parseError) {

        console.error("解析好友申请的AI响应失败:", parseError);

        throw new Error(`AI未返回有效的JSON。API实际返回内容: "${cleanedContent}"`);
      }

      if (responseObj.decision === 'apply' && responseObj.reason) {
        chat.relationship.status = 'pending_user_approval';
        chat.relationship.applicationReason = responseObj.reason;
        state.chats[chatId] = chat;
        renderChatList();
        await showCustomAlert("申请成功！", `"${chat.name}"已向你发送好友申请。请返回聊天列表查看。`);
      } else {
        await showCustomAlert("AI决策", `"${chat.name}"思考后决定暂时不发送好友申请，将重置冷静期。`);
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();
      }
    } catch (error) {
      await showCustomAlert("执行出错", `为"${chat.name}"申请好友时发生错误：\n\n${error.message}\n\n将重置冷静期。`);
      chat.relationship.status = 'blocked_by_user';
      chat.relationship.blockedTimestamp = Date.now();
    } finally {
      await db.chats.put(chat);
      renderChatInterface(chatId);
    }
  }


