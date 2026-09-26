// ========== 分组管理（从 script.js 补充拆分，原第 23369~23435 行） ==========

  async function openGroupManager() {
    await renderGroupList();
    document.getElementById('group-management-modal').classList.add('visible');
  }

  async function renderGroupList() {
    const listEl = document.getElementById('existing-groups-list');
    const groups = await db.qzoneGroups.toArray();
    listEl.innerHTML = '';
    if (groups.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分组</p>';
    }
    groups.forEach(group => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
                    <span class="group-name">${group.name}</span>
                    <span class="delete-group-btn" data-id="${group.id}">×</span>
                `;
      listEl.appendChild(item);
    });
  }

  async function addNewGroup() {
    const input = document.getElementById('new-group-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分组名不能为空！');
      return;
    }

    const existingGroup = await db.qzoneGroups.where('name').equals(name).first();
    if (existingGroup) {
      alert(`分组 "${name}" 已经存在了，换个名字吧！`);
      return;
    }

    await db.qzoneGroups.add({ name });
    input.value = '';
    await renderGroupList();
  }

  async function deleteGroup(groupId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分组后，该组内的好友将变为"未分组"。确定要删除吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.qzoneGroups.delete(groupId);
      const chatsToUpdate = await db.chats.where('groupId').equals(groupId).toArray();
      for (const chat of chatsToUpdate) {
        chat.groupId = null;
        await db.chats.put(chat);
        if (state.chats[chat.id]) state.chats[chat.id].groupId = null;
      }
      await renderGroupList();
    }
  }

  // ========== 全局暴露 ==========
  window.openPostEditor = openPostEditor;
  window.openShareLinkModal = openShareLinkModal;
  window.openCategoryManager = openCategoryManager;
  window.openThoughtEditor = openThoughtEditor;
  window.openSearchHistoryScreen = openSearchHistoryScreen;
  window.openNpcGroupManager = openNpcGroupManager;
  window.openGroupManager = openGroupManager;
  window.addNewCategory = addNewCategory;
  window.deleteCategory = deleteCategory;
  window.openNpcEditor = openNpcEditor;
  window.saveNpc = saveNpc;
  window.addNewNpcGroup = addNewNpcGroup;
  window.deleteNpcGroup = deleteNpcGroup;
  window.addNewGroup = addNewGroup;
  window.deleteGroup = deleteGroup;
  window.renderCallHistoryScreen = renderCallHistoryScreen;
  window.loadMoreThoughts = loadMoreThoughts;
  window.showThoughtsHistory = showThoughtsHistory;
  window.hideThoughtsHistory = hideThoughtsHistory;
  window.copyPostContent = copyPostContent;
  window.handleSelectAllFrames = handleSelectAllFrames;
  window.handleEditStatusClick = handleEditStatusClick;
  window.handleLongScreenshot = handleLongScreenshot;
  window.setupHomeScreenPagination = setupHomeScreenPagination;
  window.createNewMemberInGroup = createNewMemberInGroup;
  window.openMemberManagementScreen = openMemberManagementScreen;
  window.openContactPickerForAddMember = openContactPickerForAddMember;
  window.handleAddMembersToGroup = handleAddMembersToGroup;
  window.removeMemberFromGroup = removeMemberFromGroup;
  window.openContactPickerForGroupCreate = openContactPickerForGroupCreate;
  window.selectedContacts = selectedContacts;
  window.updateContactPickerConfirmButton = updateContactPickerConfirmButton;
  window.handleSearchHistory = handleSearchHistory;
  window.hidePostActions = hidePostActions;
  window.renderAlbumList = renderAlbumList;
  window.renderAlbumPhotosScreen = renderAlbumPhotosScreen;
  window.openPhotoViewer = openPhotoViewer;
  window.closePhotoViewer = closePhotoViewer;
  window.showNextPhoto = showNextPhoto;
  window.showPrevPhoto = showPrevPhoto;
  window.openForwardTargetPicker = openForwardTargetPicker;
  window.openBrowser = openBrowser;

  // ========== B类缺失导出补充 ==========
  window.showPostActions = showPostActions;
  window.showWaimaiDetails = showWaimaiDetails;
  window.handleWaimaiResponse = handleWaimaiResponse;
  window.startWaimaiCountdown = startWaimaiCountdown;
  window.cleanupWaimaiTimers = cleanupWaimaiTimers;
  window.sendUserLinkShare = sendUserLinkShare;
  window.showCallTranscript = showCallTranscript;
  window.openShareTargetPicker = openShareTargetPicker;
  window.publishToAnnouncementBoard = publishToAnnouncementBoard;
  window.showAnnouncementBoard = showAnnouncementBoard;
  window.triggerAiFriendApplication = triggerAiFriendApplication;
  window.showUserStatusModal = showUserStatusModal;
  window.showCharacterProfileModal = showCharacterProfileModal;
  window.renderNpcListScreen = renderNpcListScreen;
  window.clearSearchFilters = clearSearchFilters;
  window.renderButtonOrderEditor = renderButtonOrderEditor;
  window.initializeButtonOrderEditor = initializeButtonOrderEditor;
  window.applyButtonOrder = applyButtonOrder;
  window.resetButtonOrder = resetButtonOrder;
  window.populateFrameGrids = populateFrameGrids;

  // ========== 从 script.js 迁移：B类函数 ==========

  function enterSelectionMode(initialMsgTimestamp) {
    if (isSelectionMode) return;
    isSelectionMode = true;
    document.getElementById('chat-interface-screen').classList.add('selection-mode');
    toggleMessageSelection(initialMsgTimestamp);
  }

  function exitSelectionMode() {
    if (typeof cleanupWaimaiTimers === 'function') cleanupWaimaiTimers();
    if (!isSelectionMode) return;
    isSelectionMode = false;
    document.getElementById('chat-interface-screen').classList.remove('selection-mode');
    selectedMessages.forEach(ts => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove('selected');
    });
    selectedMessages.clear();
  }

  window.enterSelectionMode = enterSelectionMode;
  window.exitSelectionMode = exitSelectionMode;

