

  function renderCharChatList() {
    const listEl = document.getElementById('char-chat-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;


    const relatedChats = Object.values(state.chats).filter(chat => {

      if (chat.id === activeCharacterId) return true;

      if (chat.isGroup && chat.members.some(m => m.id === activeCharacterId)) return true;
      return false;
    });

    relatedChats.forEach(chat => {
      const item = createChatListItem(chat);
      listEl.appendChild(item);
    });
  }


  async function logAppUsage(characterId, appName) {
    const char = state.chats[characterId];
    if (!char) return;
    if (!char.appUsageLog) {
      char.appUsageLog = [];
    }
    char.appUsageLog.push({
      appName: appName,
      timestamp: Date.now()
    });

    if (char.appUsageLog.length > 50) {
      char.appUsageLog.shift();
    }
    await db.chats.put(char);
  }


  // renderCharAppUsage 旧版（使用 appUsageLog 的简化版）已删除
  // 保留下方使用 simulatedAppUsage 的完善版本

  async function sendCharLocationShare(locationName) {
    const userChat = state.chats[activeCharacterId];
    if (!userChat) return;

    const msg = {
      role: 'assistant',
      senderName: userChat.originalName,
      type: 'location_share',
      content: locationName,
      imageUrl: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756262526935_qdqqd_4uque3.jpeg',
      timestamp: Date.now()
    };

    userChat.history.push(msg);
    await db.chats.put(userChat);


    if (state.activeChatId === activeCharacterId) {
      appendMessage(msg, userChat);
    }

    await showCustomAlert("分享成功", `“${userChat.name}” 的位置已发送到你们的聊天中。`);
  }



  async function viewMemo(memoId) {
    const char = state.chats[activeCharacterId];
    if (!char || !char.memos) return;

    const memo = char.memos.find(m => m.id === memoId);
    if (memo) {

      activeMemoForViewing = memo;

      const titleEl = document.getElementById('char-memo-detail-title');
      const contentEl = document.getElementById('char-memo-detail-content');
      const favBtn = document.getElementById('favorite-memo-btn');

      if (titleEl) titleEl.textContent = memo.title;
      if (contentEl) contentEl.value = typeof memo.content === 'string' ? memo.content : (typeof memo.content?.content === 'string' ? memo.content.content : '');


      const existingFavorite = await db.favorites.where({
        type: 'char_memo',
        'content.id': memoId
      }).first();
      favBtn.classList.toggle('active', !!existingFavorite);

      switchToCharScreen('char-memo-detail-screen');

      // 记录窥屏行为
      await logSingleItemViewing(activeCharacterId, 'memo', memo);
    }
  }


  async function renderCharMemoList() {
    const listEl = document.getElementById('char-memo-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    const storedMemos = char.memos || [];
    let repaired = false;
    storedMemos.forEach(memo => {
      const nested = memo?.content;
      if (nested && typeof nested.title === 'string' && typeof nested.content === 'string' && memo.title == null) {
        memo.title = nested.title;
        memo.content = nested.content;
        repaired = true;
      }
    });
    const memos = storedMemos.slice().reverse();

    if (memos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有备忘录。</p>';
      return;
    }

    // SVG 图标: 类似文件的图标
    const memoIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    // SVG 图标: 右箭头
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    memos.forEach(memo => {
      const item = document.createElement('div');
      // 注意：移除了旧的 'list-item' 类，只保留 'memo-item' 以应用新样式
      item.className = 'memo-item';

      // 获取内容预览 (第一行)
      const previewText = (typeof memo.content === 'string' ? memo.content : '').split('\n')[0] || '无内容';

      item.innerHTML = `
            <div class="cphone-item-icon-box memo-icon-style">
                ${memoIconSVG}
            </div>
            <div class="cphone-item-info">
                <div class="cphone-item-title">${memo.title}</div>
                <div class="cphone-item-preview">${previewText}</div>
            </div>
            <div class="cphone-item-arrow">
                ${arrowIcon}
            </div>
        `;

      item.addEventListener('click', () => viewMemo(memo.id));
      addLongPressListener(item, () => deleteMemo(memo.id));
      listEl.appendChild(item);
    });

    if (repaired) {
      try {
        await db.chats.put(char);
      } catch (error) {
        console.error('修复角色备忘录数据失败:', error);
      }
    }
  }


  async function openMemoEditor(memoId = null) {
    editingMemoId = null;


    const newTitle = await showCustomPrompt("新建备忘录", "请输入标题");
    if (newTitle === null || !newTitle.trim()) return;

    const newContent = await showCustomPrompt(`标题: ${newTitle}`, "请输入备忘录内容", "", 'textarea');
    if (newContent !== null) {

      await saveMemo({
        title: newTitle.trim(),
        content: newContent
      });
      switchToCharScreen('char-memo-screen');
    }
  }

  async function saveMemo(memoData) {
    const char = state.chats[activeCharacterId];
    if (!char.memos) char.memos = [];
    const isMemoObject = memoData !== null && typeof memoData === 'object';
    const content = isMemoObject ? memoData.content : memoData;

    if (editingMemoId) {
      const memo = char.memos.find(m => m.id === editingMemoId);
      if (memo) memo.content = content;
    } else {
      const memo = {
        id: Date.now(),
        content: content
      };
      if (isMemoObject) memo.title = memoData.title;
      char.memos.push(memo);
    }

    await db.chats.put(char);
    renderCharMemoList();
    editingMemoId = null;
  }






