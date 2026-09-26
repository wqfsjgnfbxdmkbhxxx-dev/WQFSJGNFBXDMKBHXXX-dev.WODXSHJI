  // ========== 从 script.js 迁移：handleDeleteThought ==========
  async function handleDeleteThought(timestamp) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '确定要永久删除这条心声记录吗？此操作不可恢复。', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.thoughtsHistory) return;

      const indexToDelete = chat.thoughtsHistory.findIndex(thought => thought.timestamp === timestamp);
      if (indexToDelete === -1) return;

      const isLatest = indexToDelete === chat.thoughtsHistory.length - 1;

      chat.thoughtsHistory = chat.thoughtsHistory.filter(thought => thought.timestamp !== timestamp);

      if (isLatest) {
        if (chat.thoughtsHistory.length > 0) {
          const newLatestThought = chat.thoughtsHistory[chat.thoughtsHistory.length - 1];
          chat.heartfeltVoice = newLatestThought.heartfeltVoice;
          chat.randomJottings = newLatestThought.randomJottings;
          chat.customThoughts = newLatestThought.customThoughts ? JSON.parse(JSON.stringify(newLatestThought.customThoughts)) : {};

          const heartfeltVoiceEl = document.getElementById('profile-heartfelt-voice');
          const randomJottingsEl = document.getElementById('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("已删除最新心声，当前心声已回滚至上一条。");
        } else {
          chat.heartfeltVoice = '...';
          chat.randomJottings = '...';
          chat.customThoughts = {};

          const heartfeltVoiceEl = document.getElementById('profile-heartfelt-voice');
          const randomJottingsEl = document.getElementById('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("已删除最后一条心声，当前心声已重置。");
        }
      }

      await db.chats.put(chat);
      renderThoughtsHistory();
      await showCustomAlert('成功', '该条记录已成功删除。');
    }
  }

  window.handleDeleteThought = handleDeleteThought;

  // 绑定心声历史列表的删除按钮事件
  // 该事件已在 initThoughtsManagementEvents 中由全选/批量删除及 renderThoughtsHistory 时绑定，此处可保留或整合，为避免重复绑定此处不再额外添加
