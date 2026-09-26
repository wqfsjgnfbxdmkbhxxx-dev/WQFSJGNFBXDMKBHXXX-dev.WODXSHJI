// ============================================================
// 通话记录/分享转发选择器 (原 script.js 第 31019~31282 行)
// ============================================================

  async function renderCallHistoryScreen() {
    showScreen('call-history-screen');

    const listEl = document.getElementById('call-history-list');
    const titleEl = document.getElementById('call-history-title');
    listEl.innerHTML = '';
    titleEl.textContent = '所有通话记录';

    const records = await db.callRecords.orderBy('timestamp').reverse().toArray();

    if (records.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有通话记录哦~</p>';
      return;
    }

    records.forEach(record => {
      const card = createCallRecordCard(record);

      addLongPressListener(card, async () => {

        const newName = await showCustomPrompt(
          "自定义通话名称",
          "请输入新的名称（留空则恢复默认）",
          record.customName || ''
        );


        if (newName === null) return;


        await db.callRecords.update(record.id, {
          customName: newName.trim()
        });


        await renderCallHistoryScreen();


        await showCustomAlert('成功', '通话名称已更新！');
      });
      listEl.appendChild(card);
    });
  }



  function createCallRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'call-record-card';
    card.dataset.recordId = record.id;

    const chatInfo = state.chats[record.chatId];
    const chatName = chatInfo ? chatInfo.name : '未知会话';

    const timestamp = Number.isFinite(new Date(record.timestamp).getTime()) ? new Date(record.timestamp).getTime() : Date.now();
    const callDate = new Date(timestamp);
    const dateString = `${callDate.getFullYear()}-${String(callDate.getMonth() + 1).padStart(2, '0')}-${String(callDate.getDate()).padStart(2, '0')} ${String(callDate.getHours()).padStart(2, '0')}:${String(callDate.getMinutes()).padStart(2, '0')}`;
    const duration = Math.max(0, Number(record.duration) || 0);
    const durationText = `${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒`;

    // 判断通话类型
    const callTypeIcon = record.callType === 'voice' ? '📞' : '📹';
    const callTypeText = record.callType === 'voice' ? '语音通话' : '视频通话';

    const avatarsHtml = (Array.isArray(record.participants) ? record.participants : []).map(p =>
      `<img src="${escapeHTML(String(p.avatar || ''))}" alt="${escapeHTML(String(p.name || ''))}" class="participant-avatar" title="${escapeHTML(String(p.name || ''))}">`
    ).join('');
    const statusText = record.status === 'interrupted'
      ? ' · 意外中断'
      : (record.status === 'active' ? ' · 进行中' : '');

    card.innerHTML = `
                <div class="card-header">
                    <span class="date">${callTypeIcon} ${dateString}</span>
                    <span class="duration">${durationText}</span>
                </div>
                <div class="card-body">
                    ${record.customName ? `<div class="custom-title">${escapeHTML(String(record.customName))}</div>` : ''}
                    
                    <div class="participants-info">
                        <div class="participants-avatars">${avatarsHtml}</div>
                        <span class="participants-names">与 ${escapeHTML(chatName)} 的${callTypeText}${statusText}</span>
                    </div>
                </div>
            `;
    return card;
  }



  async function showCallTranscript(recordId) {
    const record = await db.callRecords.get(recordId);
    if (!record) return;

    const modal = document.getElementById('call-transcript-modal');
    const titleEl = document.getElementById('transcript-modal-title');
    const bodyEl = document.getElementById('call-transcript-modal-body');

    const callTypeText = record.callType === 'voice' ? '语音通话' : '视频通话';
    const recordDate = Number.isFinite(new Date(record.timestamp).getTime()) ? new Date(record.timestamp) : new Date();
    const duration = Math.max(0, Number(record.duration) || 0);
    const statusText = record.status === 'interrupted'
      ? '，意外中断'
      : (record.status === 'active' ? '，进行中' : '');
    titleEl.textContent = `${callTypeText}于 ${recordDate.toLocaleString()} (时长: ${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒${statusText})`;
    bodyEl.innerHTML = '';

    const deleteBtn = document.getElementById('delete-transcript-btn');
    const summarizeBtn = document.getElementById('manual-summarize-btn');

    if (!record.transcript || record.transcript.length === 0) {
      bodyEl.innerHTML = '<p style="text-align:center; color: #8a8a8a;">这次通话没有留下文字记录。</p>';
      summarizeBtn.style.display = 'none';
    } else {
      summarizeBtn.style.display = 'block';
      record.transcript.forEach(entry => {
        const bubble = document.createElement('div');
        bubble.className = `transcript-entry ${entry.role}`;
        bubble.textContent = entry.content;
        bodyEl.appendChild(bubble);
      });
    }

    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    const newSummarizeBtn = summarizeBtn.cloneNode(true);
    summarizeBtn.parentNode.replaceChild(newSummarizeBtn, summarizeBtn);

    newDeleteBtn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm(
        "确认删除", "确定要永久删除这条通话记录吗？此操作不可恢复。", {
        confirmButtonClass: 'btn-danger'
      }
      );
      if (confirmed) {
        modal.classList.remove('visible');
        await db.callRecords.delete(recordId);
        await renderCallHistoryScreen();
        alert('通话记录已删除。');
      }
    });



    newSummarizeBtn.addEventListener('click', async () => {

      const confirmed = await showCustomConfirm(
        '确认操作',
        '这将提取当前通话记录发送给AI进行总结，会消耗API额度。确定要继续吗？', {
        confirmText: '确认总结'
      }
      );


      if (!confirmed) return;

      modal.classList.remove('visible');
      const chat = state.chats[record.chatId];
      if (!chat) {
        alert('错误：找不到该通话记录所属的聊天对象。');
        return;
      }

      await showCustomAlert("请稍候...", "正在请求AI进行手动总结...");

      try {
        const transcriptText = record.transcript.map(h => {
          const sender = h.role === 'user' ? (chat.settings.myNickname || '我') : (h.senderName || chat.name);
          return `${sender}: ${h.content}`;
        }).join('\n');

        await summarizeCallTranscript(record.chatId, transcriptText);

        await showCustomAlert("总结成功", `手动总结已完成！新的记忆已添加到"${chat.name}"的长期记忆中。`);

      } catch (error) {
        await showCustomAlert("总结失败", `操作失败，未能生成长期记忆。\n\n错误详情: ${error.message}`);
      }
    });





    const closeBtn = document.getElementById('close-transcript-modal-btn');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    newCloseBtn.addEventListener('click', () => {
      modal.classList.remove('visible');
    });


    modal.classList.add('visible');
  }


  async function handleEditStatusClick() {

    if (!state.activeChatId || state.chats[state.activeChatId].isGroup) {
      return;
    }
    const chat = state.chats[state.activeChatId];


    const newStatusText = await showCustomPrompt(
      '编辑对方状态',
      '请输入对方现在的新状态：',
      chat.status.text
    );


    if (newStatusText !== null) {

      chat.status.text = newStatusText.trim() || '在线';
      chat.status.isBusy = false;
      chat.status.lastUpdate = Date.now();
      await db.chats.put(chat);


      renderChatInterface(state.activeChatId);
      renderChatList();


      await showCustomAlert('状态已更新', `"${chat.name}"的当前状态已更新为：${chat.status.text}`);
    }
  }


  async function openShareTargetPicker() {
    const modal = document.getElementById('share-target-modal');
    const listEl = document.getElementById('share-target-list');
    listEl.innerHTML = '';


    const chats = Object.values(state.chats);

    chats.forEach(chat => {

      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.innerHTML = `
                    <input type="checkbox" class="share-target-checkbox" data-chat-id="${chat.id}" style="margin-right: 15px;">
                    <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
                    <span class="name">${chat.name}</span>
                `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  async function openForwardTargetPicker() {
    const modal = document.getElementById('forward-target-modal');
    const listEl = document.getElementById('forward-target-list');
    listEl.innerHTML = '';
    
    // 清空搜索框
    const searchInput = document.getElementById('forward-target-search-input');
    if (searchInput) {
      searchInput.value = '';
    }

    const chats = Object.values(state.chats);

    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.dataset.searchName = (chat.name || '').toLowerCase();
      item.innerHTML = `
                    <input type="checkbox" class="forward-target-checkbox" data-chat-id="${chat.id}" style="margin-right: 15px;">
                    <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
                    <span class="name">${chat.name}</span>
                `;
      listEl.appendChild(item);
    });
    
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim().toLowerCase();
        const items = listEl.querySelectorAll('.contact-picker-item');
        items.forEach(item => {
          const name = item.dataset.searchName || '';
          if (name.includes(keyword)) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });
      });
      searchInput.dataset.bound = 'true';
    }

    modal.classList.add('visible');
  }


