// ============================================================
// 分类管理/公告板 (原 script.js 第 32408~32630 行)
// ============================================================

  async function openCategoryManager() {
    await renderCategoryListInManager();
    document.getElementById('world-book-category-manager-modal').classList.add('visible');
  }


  async function renderCategoryListInManager() {
    const listEl = document.getElementById('existing-categories-list');
    const categories = await db.worldBookCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
    }
    categories.forEach(cat => {

      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
                    <span class="group-name">${cat.name}</span>
                    <span class="delete-group-btn" data-id="${cat.id}">×</span>
                `;
      listEl.appendChild(item);
    });
  }


  async function addNewCategory() {
    const input = document.getElementById('new-category-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分类名不能为空！');
      return;
    }
    const existing = await db.worldBookCategories.where('name').equals(name).first();
    if (existing) {
      alert(`分类 "${name}" 已经存在了！`);
      return;
    }
    await db.worldBookCategories.add({
      name
    });
    input.value = '';
    await renderCategoryListInManager();
  }


  async function deleteCategory(categoryId) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '删除分类后，该分类下的所有世界书将变为"未分类"。确定要删除吗？', {
      confirmButtonClass: 'btn-danger'
    }
    );
    if (confirmed) {
      await db.worldBookCategories.delete(categoryId);

      const booksToUpdate = await db.worldBooks.where('categoryId').equals(categoryId).toArray();
      for (const book of booksToUpdate) {
        book.categoryId = null;
        await db.worldBooks.put(book);
        const bookInState = state.worldBooks.find(wb => wb.id === book.id);
        if (bookInState) bookInState.categoryId = null;
      }
      await renderCategoryListInManager();
    }
  }


  async function publishToAnnouncementBoard() {
    if (!activeMessageTimestamp) return;

    const timestampToPublish = activeMessageTimestamp;
    hideMessageActions();

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToPublish);
    if (!message) return;


    let contentPreview = String(message.content || '').substring(0, 50) + '...';
    if (message.type === 'ai_image') contentPreview = '[图片] ' + contentPreview;

    const confirmed = await showCustomConfirm(
      "发布公告",
      `确定要将以下消息发布到公告板吗？\n\n"${contentPreview}"`, {
      confirmText: "确定发布"
    }
    );

    if (confirmed) {
      const myNickname = chat.settings.myNickname || '我';

      if (!Array.isArray(chat.announcements)) {
        chat.announcements = [];
      }


      const newAnnouncement = {
        id: 'anno_' + Date.now(),
        messageTimestamp: timestampToPublish,
        publisher: myNickname,
        publishedAt: Date.now(),
        isPinned: false
      };

      chat.announcements.push(newAnnouncement);

      const systemMessage = {
        role: 'system',
        type: 'pat_message',
        content: `${myNickname} 发布了一条新公告`,
        timestamp: Date.now()
      };
      chat.history.push(systemMessage);

      await db.chats.put(chat);
      appendMessage(systemMessage, chat);
      renderChatList();

      await showCustomAlert("成功", "公告已发布！");
    }
  }


  async function showAnnouncementBoard() {
    const chat = state.chats[state.activeChatId];
    const announcements = chat.announcements || [];

    if (!chat || announcements.length === 0) {
      showCustomAlert("提示", "当前群聊还没有公告哦。");
      return;
    }

    const contentEl = document.getElementById('announcement-board-content');
    contentEl.innerHTML = '';


    announcements.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));


    for (const anno of announcements) {
      const originalMessage = chat.history.find(m => m.timestamp === anno.messageTimestamp);

      const wrapper = document.createElement('div');
      wrapper.className = 'announcement-item-wrapper';

      if (originalMessage) {

        const messageBubbleEl = await createMessageElement(originalMessage, chat);
        if (messageBubbleEl) {
          wrapper.appendChild(messageBubbleEl);
        }
      } else {
        wrapper.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">公告的原消息已被删除。</p>';
      }

      if (anno.isPinned) {
        wrapper.innerHTML += `<div class="pinned-indicator">📌</div>`;
      }
      wrapper.innerHTML += `<div class="announcement-item-actions" data-anno-id="${anno.id}">...</div>`;

      contentEl.appendChild(wrapper);
    }

    document.getElementById('announcement-board-modal').classList.add('visible');
  }


  let activeAnnouncementId = null;


  function showAnnouncementActions(annoId) {
    activeAnnouncementId = annoId;
    const chat = state.chats[state.activeChatId];
    const announcement = chat.announcements.find(a => a.id === annoId);
    if (!announcement) return;

    const pinButton = document.getElementById('announcement-action-pin');

    pinButton.textContent = announcement.isPinned ? '取消置顶' : '置顶公告';

    document.getElementById('announcement-actions-modal').classList.add('visible');
  }


  async function handlePinAnnouncement() {
    if (!activeAnnouncementId) return;
    const chat = state.chats[state.activeChatId];
    const announcement = chat.announcements.find(a => a.id === activeAnnouncementId);
    if (announcement) {
      announcement.isPinned = !announcement.isPinned;
      await db.chats.put(chat);
      showAnnouncementBoard();
    }
    document.getElementById('announcement-actions-modal').classList.remove('visible');
  }


  async function handleDeleteAnnouncement() {
    if (!activeAnnouncementId) return;

    const confirmed = await showCustomConfirm("确认删除", "确定要删除这条公告吗？此操作不可恢复。", {
      confirmButtonClass: 'btn-danger'
    });

    if (confirmed) {
      const chat = state.chats[state.activeChatId];

      chat.announcements = chat.announcements.filter(a => a.id !== activeAnnouncementId);
      await db.chats.put(chat);
      showAnnouncementBoard();
    }
    document.getElementById('announcement-actions-modal').classList.remove('visible');
  }


