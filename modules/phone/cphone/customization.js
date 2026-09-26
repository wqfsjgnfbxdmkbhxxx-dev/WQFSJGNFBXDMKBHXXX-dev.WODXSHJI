  async function handleEditText(element) {
    const elementId = element.id;
    const currentValue = element.textContent;
    const newValue = await showCustomPrompt("修改文字", "请输入新的内容：", currentValue);
    if (newValue !== null && newValue.trim() !== "") {
      const trimmedValue = newValue.trim();
      element.textContent = trimmedValue;
      state.globalSettings.widgetData[elementId] = trimmedValue;
      await db.globalSettings.put(state.globalSettings);
      alert("文字已更新！");
    }
  }

  async function handleEditImage(element) {
    const elementId = element.id;
    const choice = await showChoiceModal("修改图片", [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    if (choice === 'reset') {
      const defaultSrc = element.dataset.defaultSrc;
      if (defaultSrc) {
        element.src = defaultSrc;
        if (state.globalSettings.widgetData && state.globalSettings.widgetData[elementId]) {
          delete state.globalSettings.widgetData[elementId];
          await db.globalSettings.put(state.globalSettings);
        }
        await showCustomAlert("成功", "已重置为默认图片！");
      } else {
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        element.src = whitePixel;
        if (state.globalSettings.widgetData && state.globalSettings.widgetData[elementId]) {
          delete state.globalSettings.widgetData[elementId];
          await db.globalSettings.put(state.globalSettings);
        }
        await showCustomAlert("成功", "没有默认信息，已重置为纯白！");
      }
      return;
    }

    let newUrl = null;
    let isBase64 = false;

    if (choice === 'local') {
      newUrl = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => {
          const file = e.target.files[0];
          if (file) { const reader = new FileReader(); reader.onload = (re) => resolve(re.target.result); reader.readAsDataURL(file); } else { resolve(null); }
        };
        input.click();
      });
      if (newUrl) isBase64 = true;
    } else if (choice === 'url') {
      newUrl = await showCustomPrompt("修改图片", "请输入新的图片URL：", element.src, "url");
      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();
      element.src = trimmedUrl;
      if (!state.globalSettings.widgetData) { state.globalSettings.widgetData = {}; }
      state.globalSettings.widgetData[elementId] = trimmedUrl;
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "组件图片已更新并保存！");

      if (isBase64 && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
        (async () => {
          console.log(`[ImgBB] 启动 ${elementId} 的静默上传...`);
          await silentlyUpdateDbUrl(db.globalSettings, 'main', `widgetData.${elementId}`, trimmedUrl);
        })();
      }
    }
  }

  window.handleEditText = handleEditText;
  window.handleEditImage = handleEditImage;

  // ========== 从 script.js 迁移：头像框相关函数 ==========

  async function handleUploadFrame() {
    const fileInput = document.getElementById('custom-frame-upload-input');
    const file = await new Promise(resolve => {
      const changeHandler = (e) => { resolve(e.target.files[0] || null); fileInput.removeEventListener('change', changeHandler); };
      fileInput.addEventListener('change', changeHandler, { once: true });
      fileInput.click();
    });
    if (!file) return;
    const name = await showCustomPrompt("命名头像框", "请为这个新头像框起个名字");
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async (readerEvent) => { resolve(readerEvent.target.result); };
      reader.readAsDataURL(file);
    });
    const newFrame = { name: trimmedName, url: base64Url };
    const newId = await db.customAvatarFrames.add(newFrame);
    populateFrameGrids(editingFrameForMember);
    await showCustomAlert("添加成功！", `头像框"${trimmedName}"已添加。\n\n图片将在后台静默上传到图床...`);
    (async () => {
      await silentlyUpdateDbUrl(db.customAvatarFrames, newId, 'url', base64Url);
    })();
  }

  async function handleBatchUploadFrames() {
    const placeholder = `请按照以下格式粘贴，一行一个：\n\n头像框名字1: https://.../image1.png\n头像框名字2: https://.../image2.gif`;
    const pastedText = await showCustomPrompt("批量导入头像框", "从完整链接批量导入", "", 'textarea', `<p style="font-size:12px;color:#888;">${placeholder}</p>`);
    if (!pastedText || !pastedText.trim()) return;
    const lines = pastedText.trim().split('\n');
    const newFrames = [];
    let errorCount = 0;
    for (const line of lines) {
      const match = line.match(/^(.+?)[:：]\s*(https?:\/\/.+)$/);
      if (match) { newFrames.push({ name: match[1].trim(), url: match[2].trim() }); } else if (line.trim()) { errorCount++; }
    }
    if (newFrames.length > 0) {
      await db.customAvatarFrames.bulkAdd(newFrames);
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert("导入成功", `成功导入 ${newFrames.length} 个新头像框！`);
    }
    if (errorCount > 0) { await showCustomAlert("部分失败", `有 ${errorCount} 行格式不正确，已被忽略。`); }
  }

  async function handleDeleteCustomFrame(frameId) {
    const frame = await db.customAvatarFrames.get(frameId);
    if (!frame) return;
    const confirmed = await showCustomConfirm("确认删除", `确定要删除头像框 "${frame.name}" 吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      await db.customAvatarFrames.delete(frameId);
      populateFrameGrids(editingFrameForMember);
    }
  }

  function toggleFrameManagementMode() {
    isFrameManagementMode = !isFrameManagementMode;
    const manageBtn = document.getElementById('manage-frames-btn');
    const actionBar = document.getElementById('frame-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-frames-checkbox');
    document.querySelectorAll('.frame-grid').forEach(grid => { grid.classList.toggle('management-mode', isFrameManagementMode); });
    if (isFrameManagementMode) {
      manageBtn.textContent = '完成'; actionBar.style.display = 'flex'; selectedFrames.clear(); selectAllCheckbox.checked = false; updateDeleteFrameButton();
    } else {
      manageBtn.textContent = '管理'; actionBar.style.display = 'none';
      document.querySelectorAll('.frame-item.selected').forEach(item => { item.classList.remove('selected'); });
    }
  }

  function updateDeleteFrameButton() {
    const btn = document.getElementById('delete-selected-frames-btn');
    btn.textContent = `删除 (${selectedFrames.size})`;
  }

  async function executeBatchDeleteFrames() {
    if (selectedFrames.size === 0) return;
    const confirmed = await showCustomConfirm('确认删除', `确定要永久删除选中的 ${selectedFrames.size} 个自定义头像框吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      const idsToDelete = [...selectedFrames];
      await db.customAvatarFrames.bulkDelete(idsToDelete);
      toggleFrameManagementMode();
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert('删除成功', '选中的头像框已成功删除。');
    }
  }

  function openFrameSelectorModal(type = 'chat') {
    const frameModal = document.getElementById('avatar-frame-modal');
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    editingFrameForMember = (type === 'member');
    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (!member) return;
      currentFrameSelection.my = member.avatarFrame || '';
      populateFrameGrids(true, member.avatar, member.avatarFrame);
    } else {
      currentFrameSelection.ai = chat.settings.aiAvatarFrame || '';
      currentFrameSelection.my = chat.settings.myAvatarFrame || '';
      populateFrameGrids(false);
    }
    frameModal.classList.add('visible');
  }

  async function saveSelectedFrames() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (member) { member.avatarFrame = currentFrameSelection.my; }
    } else {
      chat.settings.aiAvatarFrame = currentFrameSelection.ai;
      chat.settings.myAvatarFrame = currentFrameSelection.my;
    }
    await db.chats.put(chat);
    if (!editingFrameForMember && !chat.isGroup) {
      const characterId = chat.id;
      for (const groupChat of Object.values(state.chats)) {
        if (groupChat.isGroup && groupChat.members) {
          const memberToUpdate = groupChat.members.find(m => m.id === characterId);
          if (memberToUpdate) {
            memberToUpdate.avatarFrame = chat.settings.aiAvatarFrame;
            await db.chats.put(groupChat);
          }
        }
      }
    }
    document.getElementById('avatar-frame-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    alert('头像框已保存并同步！');
    editingFrameForMember = false;
  }

  window.handleUploadFrame = handleUploadFrame;
  window.handleBatchUploadFrames = handleBatchUploadFrames;
  window.handleDeleteCustomFrame = handleDeleteCustomFrame;
  window.toggleFrameManagementMode = toggleFrameManagementMode;
  window.updateDeleteFrameButton = updateDeleteFrameButton;
  window.executeBatchDeleteFrames = executeBatchDeleteFrames;
  window.openFrameSelectorModal = openFrameSelectorModal;
  window.saveSelectedFrames = saveSelectedFrames;

  // ========== 从 script.js 迁移：handleIconChange ==========

  async function handleIconChange(iconId, phoneType, itemElement) {
    const appName = itemElement.querySelector('.icon-preview').alt;
    const choice = await showChoiceModal(`更换"${appName}"图标`, [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    if (choice === 'reset') {
      const iconElement = itemElement.querySelector('.icon-preview');
      const defaultSrc = iconElement.dataset.defaultSrc;
      if (defaultSrc) {
        iconElement.src = defaultSrc;
      } else {
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        iconElement.src = whitePixel;
      }
      if (phoneType === 'cphone') {
        if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) delete state.globalSettings.cphoneAppIcons[iconId];
      } else if (phoneType === 'myphone') {
        if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) delete state.globalSettings.myphoneAppIcons[iconId];
      } else {
        if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) delete state.globalSettings.appIcons[iconId];
      }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", defaultSrc ? "已重置为默认图标！" : "没有默认信息，已重置为纯白！");
      return;
    }

    let newUrl = null;
    let isBase64 = false;
    if (choice === 'local') {
      newUrl = await new Promise(resolve => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (re) => resolve(re.target.result); reader.readAsDataURL(file); } else { resolve(null); } };
        input.click();
      });
      if (newUrl) isBase64 = true;
    } else if (choice === 'url') {
      let currentUrl;
      if (phoneType === 'cphone') { currentUrl = state.globalSettings.cphoneAppIcons[iconId]; }
      else if (phoneType === 'myphone') { currentUrl = state.globalSettings.myphoneAppIcons[iconId]; }
      else { currentUrl = state.globalSettings.appIcons[iconId]; }
      const isCurrentUrlBase64 = currentUrl && currentUrl.startsWith('data:image');
      const initialValueForPrompt = isCurrentUrlBase64 ? '' : currentUrl;
      newUrl = await showCustomPrompt(`更换图标`, '请输入新的图片URL', initialValueForPrompt, 'url');
      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();
      itemElement.querySelector('.icon-preview').src = trimmedUrl;
      let dbPath;
      if (phoneType === 'cphone') { dbPath = `cphoneAppIcons.${iconId}`; state.globalSettings.cphoneAppIcons[iconId] = trimmedUrl; }
      else if (phoneType === 'myphone') { dbPath = `myphoneAppIcons.${iconId}`; state.globalSettings.myphoneAppIcons[iconId] = trimmedUrl; }
      else { dbPath = `appIcons.${iconId}`; state.globalSettings.appIcons[iconId] = trimmedUrl; }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "图标已更新！");
      if (isBase64) {
        (async () => { console.log(`[ImgBB] 启动 ${dbPath} 的静默上传...`); await silentlyUpdateDbUrl(db.globalSettings, 'main', dbPath, trimmedUrl); })();
      }
    } else if (newUrl !== null) { alert("请输入一个有效的URL或选择一个文件！"); }
  }

  window.handleIconChange = handleIconChange;

  // ========== 从 script.js 迁移：Reddit 相关函数 ==========

