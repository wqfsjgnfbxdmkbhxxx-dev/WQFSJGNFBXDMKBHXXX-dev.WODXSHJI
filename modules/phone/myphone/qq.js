  // ============================================================
  // MyPhone QQ 渲染函数（从 script.js 迁移）
  // ============================================================

  let myPhoneConversationRenderVersion = 0;
  window.invalidateMyPhoneConversationRender = () => { myPhoneConversationRenderVersion += 1; };

  async function renderMyPhoneSimulatedQQ() {
    const listEl = document.getElementById('myphone-chat-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const userDisplayName = state.qzoneSettings.nickname || '我';
    const lastRealMessage = char.history.filter(m => !m.isHidden).slice(-1)[0] || { content: '...' };

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

    const charAvatar = char.settings.aiAvatar || defaultAvatar;
    const charFrame = char.settings.aiAvatarFrame || '';
    let avatarHtml;
    if (charFrame) {
      avatarHtml = `<div class="avatar-group has-frame" style="width: 45px; height: 45px;"><div class="avatar-with-frame" style="width: 45px; height: 45px;"><img src="${charAvatar}" class="avatar-img" style="border-radius: 50%;"><img src="${charFrame}" class="avatar-frame"></div></div>`;
    } else {
      avatarHtml = `<div class="avatar-group" style="width: 45px; height: 45px;"><img src="${charAvatar}" class="avatar" style="border-radius: 50%; width: 45px; height: 45px;"></div>`;
    }

    const charChatItem = document.createElement('div');
    charChatItem.className = 'chat-list-item';
    charChatItem.dataset.conversationIndex = "-1";
    charChatItem.innerHTML = `
      ${avatarHtml}
      <div class="info">
          <div class="name-line">
              <span class="name">${char.name}</span>
          </div>
          <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
      </div>
  `;
    charChatItem.addEventListener('click', () => openMyPhoneConversation(-1));
    listEl.appendChild(charChatItem);

    const simulatedConversations = char.myPhoneSimulatedQQConversations || [];
    simulatedConversations.forEach((conv, idx) => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.conversationIndex = idx;

      // 检查是否在删除模式下
      const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'qq';

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${idx})">
        <img src="${conv.avatar || defaultAvatar}" class="avatar">
        <div class="info">
          <div class="name-line">
            <span class="name">${conv.name}</span>
          </div>
          <div class="last-msg">${conv.lastMessage || '...'}</div>
        </div>
      `;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        item.innerHTML = `
        <img src="${conv.avatar || defaultAvatar}" class="avatar">
        <div class="info">
          <div class="name-line">
            <span class="name">${conv.name}</span>
          </div>
          <div class="last-msg">${conv.lastMessage || '...'}</div>
        </div>
      `;
        item.addEventListener('click', () => openMyPhoneConversation(idx));
      }

      listEl.appendChild(item);
    });

    document.getElementById('back-to-myphone-qq-list-btn').onclick = () => switchToMyPhoneScreen('myphone-qq-screen');
  }

  async function openMyPhoneConversation(index) {
    const openedCharacterId = activeMyPhoneCharacterId;
    const renderVersion = ++myPhoneConversationRenderVersion;
    const char = state.chats[openedCharacterId];
    if (!char) return;

    // 保存当前对话索引
    window.currentMyPhoneConversationIndex = index;
    myphoneActiveConversationIndex = index;

    const messagesEl = document.getElementById('myphone-conversation-messages');
    messagesEl.innerHTML = '';
    messagesEl.dataset.theme = char.settings.theme || 'default';

    let partnerName, messages, tempChatObject;
    const settingsBtn = document.getElementById('myphone-conversation-settings-btn');

    if (index === -1) {
      // 与角色的真实对话 - 不显示设置按钮，使用渲染窗口机制
      partnerName = char.name;
      settingsBtn.style.display = 'none';

      tempChatObject = {
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

      // 使用渲染窗口机制，只渲染最近的消息
      myphoneRenderedCount = 0;
      isLoadingMoreMyPhoneMessages = false;

      const allVisibleMessages = char.history.filter(m => !m.isHidden);
      const renderWindow = state.globalSettings.chatRenderWindow || 50;
      const initialMessages = allVisibleMessages.slice(-renderWindow);
      messages = initialMessages;
      myphoneRenderedCount = initialMessages.length;
    } else {
      // 模拟对话 - 显示设置按钮
      const conv = char.myPhoneSimulatedQQConversations[index];
      partnerName = conv.name;
      settingsBtn.style.display = 'block';

      const userAvatar = char.settings.myAvatar || state.qzoneSettings.avatar || defaultAvatar;
      const userAvatarFrame = char.settings.myAvatarFrame || '';

      tempChatObject = {
        id: 'temp_myphone_simulated_chat',
        isGroup: false,
        name: conv.name,
        settings: {
          myAvatar: userAvatar,
          myAvatarFrame: userAvatarFrame,
          aiAvatar: conv.avatar || defaultAvatar,
          aiAvatarFrame: ''
        }
      };

      messages = conv.messages || [];
    }

    document.getElementById('myphone-conversation-partner-name').textContent = partnerName;

    for (const msg of messages) {
      if (renderVersion !== myPhoneConversationRenderVersion || activeMyPhoneCharacterId !== openedCharacterId) return;
      const messageEl = await createMessageElement(msg, tempChatObject);
      if (renderVersion !== myPhoneConversationRenderVersion || activeMyPhoneCharacterId !== openedCharacterId) return;
      if (messageEl) {
        messagesEl.appendChild(messageEl);
      }
    }

    if (renderVersion !== myPhoneConversationRenderVersion || activeMyPhoneCharacterId !== openedCharacterId) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    switchToMyPhoneScreen('myphone-qq-conversation-screen');
  }


  // ============================================================
  // 全局暴露（供 HTML onclick 和其他模块调用）
  // ============================================================
  window.openMyphoneScreen = openMyphoneScreen;
  window.openMyPhoneApp = openMyPhoneApp;
  window.renderMyPhoneSimulatedQQ = renderMyPhoneSimulatedQQ;
  window.openMyPhoneConversation = openMyPhoneConversation;
  window.switchToMyPhoneHomeScreen = switchToMyPhoneHomeScreen;
  window.switchToMyPhoneScreen = switchToMyPhoneScreen;
  window.switchToCPhone = switchToCPhone;
  window.openMyPhoneSettings = openMyPhoneSettings;
  window.openMyPhoneViewRecords = openMyPhoneViewRecords;
  window.showMyPhoneAddContactDialog = showMyPhoneAddContactDialog;
  window.manualCreateMyPhoneContact = manualCreateMyPhoneContact;
  window.showImportMainScreenCharacters = showImportMainScreenCharacters;
  window.updateImportSelectAllState = updateImportSelectAllState;
  window.importSelectedCharacters = importSelectedCharacters;
  window.openMyPhoneContactSettings = openMyPhoneContactSettings;
  window.saveMyPhoneContactSettings = saveMyPhoneContactSettings;
  window.changeMyPhoneContactAvatar = changeMyPhoneContactAvatar;
  window.addMyPhoneMessage = addMyPhoneMessage;
  window.showMyPhoneTransferActionModal = showMyPhoneTransferActionModal;
  window.handleMyPhoneTransferResponse = handleMyPhoneTransferResponse;
  window.toggleMyPhoneDeleteMode = toggleMyPhoneDeleteMode;
  window.enterMyPhoneDeleteMode = enterMyPhoneDeleteMode;
  window.applyMyPhoneAppIcons = applyMyPhoneAppIcons;
  window.enterMyPhone = enterMyPhone;
  window.renderMyPhoneHomeScreen = renderMyPhoneHomeScreen;
  window.renderMyPhoneCharacterSelector = renderMyPhoneCharacterSelector;
  window.showMyPhoneLockScreen = showMyPhoneLockScreen;
  window.updateMyPhoneLockScreenClock = updateMyPhoneLockScreenClock;
  window.showMyPhonePasswordInput = showMyPhonePasswordInput;
  window.hideMyPhonePasswordInput = hideMyPhonePasswordInput;
  window.checkMyPhoneLockPassword = checkMyPhoneLockPassword;
  window.renderMyPhoneContactMessages = renderMyPhoneContactMessages;


