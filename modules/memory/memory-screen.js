  // ========== 全局暴露 ==========
  window.loadMoreMemories = loadMoreMemories;
  window.openLongTermMemoryScreen = openLongTermMemoryScreen;

  // ========== 从 script.js 迁移：renderMemoriesScreen 及辅助函数 ==========
  // activeCountdownTimers 已在 utils.js 中声明

  async function renderMemoriesScreen() {
    const listEl = document.getElementById('memories-list');
    listEl.innerHTML = '';

    const allMemories = await db.memories.orderBy('timestamp').reverse().toArray();

    if (allMemories.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有共同的回忆和约定呢~</p>';
      return;
    }

    allMemories.sort((a, b) => {
      const aIsActiveCountdown = a.type === 'countdown' && a.targetDate > Date.now();
      const bIsActiveCountdown = b.type === 'countdown' && b.targetDate > Date.now();
      if (aIsActiveCountdown && !bIsActiveCountdown) return -1;
      if (!aIsActiveCountdown && bIsActiveCountdown) return 1;
      if (aIsActiveCountdown && bIsActiveCountdown) return a.targetDate - b.targetDate;
      return 0;
    });

    allMemories.forEach(item => {
      let card;
      if (item.type === 'countdown' && item.targetDate > Date.now()) {
        card = createCountdownCard(item);
      } else {
        card = createMemoryCard(item);
      }
      listEl.appendChild(card);
    });

    startAllCountdownTimers();
  }

  function createMemoryCard(memory) {
    const card = document.createElement('div');
    card.className = 'memory-card';
    const memoryDate = new Date(memory.timestamp);
    const dateString = `${memoryDate.getFullYear()}-${String(memoryDate.getMonth() + 1).padStart(2, '0')}-${String(memoryDate.getDate()).padStart(2, '0')} ${String(memoryDate.getHours()).padStart(2, '0')}:${String(memoryDate.getMinutes()).padStart(2, '0')}`;

    let titleHtml, contentHtml;

    if (memory.type === 'countdown' && memory.targetDate) {
      titleHtml = `[约定达成] ${memory.description}`;
      contentHtml = parseMarkdown(`在 ${new Date(memory.targetDate).toLocaleString()}，我们一起见证了这个约定。`).replace(/\n/g, '<br>');
    } else {
      let authorDisplayName = '我们的回忆';
      if (memory.authorId) {
        const authorChat = state.chats[memory.authorId];
        if (authorChat) {
          authorDisplayName = authorChat.name;
        } else {
          authorDisplayName = memory.authorName || '一位朋友';
        }
      } else if (memory.authorName) {
        authorDisplayName = memory.authorName;
      }
      titleHtml = `${authorDisplayName} 的日记`;
      contentHtml = parseMarkdown(memory.description);
    }

    card.innerHTML = `
                <div class="header">
                    <div class="date">${dateString}</div>
                    <div class="author">${titleHtml}</div>
                </div>
                <div class="content">${contentHtml}</div>
            `;
    addLongPressListener(card, async () => {
      const confirmed = await showCustomConfirm('删除记录', '确定要删除这条记录吗？', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        await db.memories.delete(memory.id);
        renderMemoriesScreen();
      }
    });
    return card;
  }

  function createCountdownCard(countdown) {
    const card = document.createElement('div');
    card.className = 'countdown-card';
    const targetDate = new Date(countdown.targetDate);
    const targetDateString = targetDate.toLocaleString('zh-CN', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    card.innerHTML = `
                <div class="title">${countdown.description}</div>
                <div class="timer" data-target-date="${countdown.targetDate}">--天--时--分--秒</div>
                <div class="target-date">目标时间: ${targetDateString}</div>
            `;
    addLongPressListener(card, async () => {
      const confirmed = await showCustomConfirm('删除约定', '确定要删除这个约定吗？', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        await db.memories.delete(countdown.id);
        renderMemoriesScreen();
      }
    });
    return card;
  }

  function startAllCountdownTimers() {
    activeCountdownTimers.forEach(timerId => clearInterval(timerId));
    activeCountdownTimers = [];

    document.querySelectorAll('.countdown-card .timer').forEach(timerEl => {
      const targetTimestamp = parseInt(timerEl.dataset.targetDate);
      let timerId;
      const updateTimer = () => {
        const now = Date.now();
        const distance = targetTimestamp - now;
        if (distance < 0) {
          timerEl.textContent = "约定达成！";
          clearInterval(timerId);
          setTimeout(() => renderMemoriesScreen(), 2000);
          return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        timerEl.textContent = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
      };
      updateTimer();
      timerId = setInterval(updateTimer, 1000);
      activeCountdownTimers.push(timerId);
    });
  }

  window.renderMemoriesScreen = renderMemoriesScreen;
  window.summarizeExistingLongTermMemory = summarizeExistingLongTermMemory;
