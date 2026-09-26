// ============================================================
// 搜索历史记录 (原 script.js 第 47250~47396 行)
// ============================================================

  function openSearchHistoryScreen() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];


    document.getElementById('keyword-search-input').value = '';
    document.getElementById('date-search-input').value = '';

    document.getElementById('chat-search-results-list').innerHTML = `<p style="text-align:center; color: var(--text-secondary);">输入关键词或选择日期进行搜索。</p>`;


    showScreen('search-history-screen');
  }

  async function handleSearchHistory() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const keyword = document.getElementById('keyword-search-input').value.trim().toLowerCase();
    const dateValue = document.getElementById('date-search-input').value;

    if (!keyword && !dateValue) {
      alert("请输入关键词或选择一个日期。");
      return;
    }

    let results = chat.history.filter(msg => !msg.isHidden);


    if (keyword) {
      results = results.filter(msg => {
        let contentString = '';

        if (typeof msg.content === 'string') {
          contentString = msg.content;
        } else if (msg.type === 'voice_message') {
          contentString = msg.content;
        } else if (msg.type === 'ai_image' || msg.type === 'user_photo') {
          contentString = msg.content;
        } else if (msg.type === 'offline_text') {
          contentString = `${msg.dialogue || ''} ${msg.description || ''}`;
        } else if (msg.quote) {
          contentString = msg.content;
        }
        return contentString.toLowerCase().includes(keyword);
      });
    }


    if (dateValue) {
      const selectedDate = new Date(dateValue);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999)).getTime();

      results = results.filter(msg => msg.timestamp >= startOfDay && msg.timestamp <= endOfDay);
    }


    await renderSearchResults(results);
  }



  async function renderSearchResults(results) {
    const listEl = document.getElementById('chat-search-results-list');
    const chat = state.chats[state.activeChatId];
    listEl.innerHTML = '';

    if (results.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">未找到相关的聊天记录。</p>';
      return;
    }

    let lastDateString = '';
    for (const msg of results) {
      const msgDate = new Date(msg.timestamp);
      const currentDateString = msgDate.toLocaleDateString();

      if (currentDateString !== lastDateString) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.textContent = `--- ${msgDate.getFullYear()}年${msgDate.getMonth() + 1}月${msgDate.getDate()}日 ---`;
        listEl.appendChild(dateSeparator);
        lastDateString = currentDateString;
      }

      const messageEl = await createMessageElement(msg, chat);
      if (messageEl) {


        messageEl.style.cursor = 'pointer';

        messageEl.addEventListener('click', () => jumpToOriginalMessage(msg.timestamp));

        listEl.appendChild(messageEl);
      }
    }
  }




  async function jumpToOriginalMessage(timestamp) {
    const chatId = state.activeChatId;
    if (!chatId) return;

    showScreen('chat-interface-screen');

    setTimeout(async () => {
      const messagesContainer = document.getElementById('chat-messages');
      const selector = `.message-bubble[data-timestamp="${timestamp}"]`;
      let targetMessage = messagesContainer.querySelector(selector);

      // 如果当前界面没有这条消息，使用历史上下文加载
      if (!targetMessage) {
        console.log(`目标消息未找到, 正在进入历史上下文模式...`);
        if (typeof renderChatContext === 'function') {
          await renderChatContext(chatId, timestamp);
        } else {
           console.error("renderChatContext is not defined");
        }
      } else {
        scrollToOriginalMessage(timestamp);
      }
    }, 200);
  }




  async function clearSearchFilters() {
    document.getElementById('keyword-search-input').value = '';
    document.getElementById('date-search-input').value = '';

    await renderSearchResults(state.chats[state.activeChatId].history.filter(msg => !msg.isHidden));
  }


