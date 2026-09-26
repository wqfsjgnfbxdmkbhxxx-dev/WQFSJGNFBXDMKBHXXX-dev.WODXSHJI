  // ========== 数据检查与修复 ==========

  async function checkAndFixData() {
    const confirmed = await showCustomConfirm(
      '确认操作',
      '此功能将扫描数据库，尝试找出并修复"角色在数据库中存在，但未在聊天列表显示"的问题。<br><br><strong>操作通常是安全的，但仍建议在操作前备份数据。</strong>', {
      confirmText: '开始检查'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在扫描和修复数据...");

    try {
      const chatsFromDB = await db.chats.toArray();
      let fixedCount = 0;

      for (const chat of chatsFromDB) {
        let isModified = false;


        if (!Array.isArray(chat.history)) {
          chat.history = [];
          isModified = true;
        }

        if (typeof chat.settings !== 'object' || chat.settings === null) {
          chat.settings = {};
          isModified = true;
        }

        if (!chat.isGroup && !chat.originalName) {
          chat.originalName = chat.name;
          isModified = true;
        }

        if (typeof chat.unreadCount === 'undefined') {
          chat.unreadCount = 0;
          isModified = true;
        }

        if (!Array.isArray(chat.longTermMemory)) {
          chat.longTermMemory = [];
          isModified = true;
        }



        if (isModified) {
          fixedCount++;
          console.log(`修复了角色 "${chat.name}" (ID: ${chat.id}) 的残缺数据。`);
          await db.chats.put(chat);
        }


        state.chats[chat.id] = chat;
      }

      if (fixedCount > 0) {
        await showCustomAlert(
          '修复完成！',
          `成功检查并修复了 ${fixedCount} 个角色的数据问题！\n\n聊天列表已为您刷新。`
        );

        await renderChatList();
      } else {
        await showCustomAlert('检查完成', '未发现任何需要修复的数据问题。');
      }

    } catch (error) {
      console.error("数据检查与修复失败:", error);
      await showCustomAlert('操作失败', `执行检查时发生错误: ${error.message}`);
    }
  }

  // ========== 世界书删除 ==========

  async function openWorldBookDeletionModal() {
    const modal = document.getElementById('delete-world-books-modal');
    const listEl = document.getElementById('delete-world-books-list');
    const selectAllCheckbox = document.getElementById('select-all-world-books-for-clear');
    listEl.innerHTML = '';
    selectAllCheckbox.checked = false;

    const books = await db.worldBooks.toArray();

    if (books.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">没有可以删除的世界书。</p>';
    } else {
      books.forEach(book => {
        const item = document.createElement('div');
        item.className = 'clear-posts-item';
        item.dataset.bookId = book.id;
        item.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${book.name}</span>
            `;
        listEl.appendChild(item);
      });
    }

    modal.classList.add('visible');
  }


  async function handleConfirmWorldBookDeletion() {
    const selectedItems = document.querySelectorAll('#delete-world-books-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要删除的世界书。");
      return;
    }

    const idsToDelete = Array.from(selectedItems).map(item => item.dataset.bookId);

    const confirmed = await showCustomConfirm(
      '最后确认！',
      `此操作将永久删除您选择的 ${selectedItems.length} 本世界书，并解除它们与所有角色的关联。此操作【不可恢复】！`, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行删除操作...");

    try {
      await db.transaction('rw', db.worldBooks, db.chats, async () => {

        await db.worldBooks.bulkDelete(idsToDelete);


        const allChats = await db.chats.toArray();
        for (const chat of allChats) {
          if (chat.settings && Array.isArray(chat.settings.linkedWorldBookIds)) {
            const originalCount = chat.settings.linkedWorldBookIds.length;

            chat.settings.linkedWorldBookIds = chat.settings.linkedWorldBookIds.filter(id => !idsToDelete.includes(id));


            if (chat.settings.linkedWorldBookIds.length < originalCount) {
              await db.chats.put(chat);
            }
          }
        }
      });


      state.worldBooks = state.worldBooks.filter(book => !idsToDelete.includes(book.id));

      document.getElementById('delete-world-books-modal').classList.remove('visible');
      await showCustomAlert("删除成功", `${selectedItems.length} 本世界书已成功删除。`);

    } catch (error) {
      console.error("删除世界书失败:", error);
      await showCustomAlert("删除失败", `操作失败: ${error.message}`);
    }
  }


