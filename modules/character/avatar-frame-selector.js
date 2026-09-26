// ============================================================
// 头像框选择器 (原 script.js 第 32625~32830 行)
// ============================================================

  let editingFrameForMember = false;
  let currentFrameSelection = {
    ai: null,
    my: null
  };

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
      if (member) {
        member.avatarFrame = currentFrameSelection.my;
      }
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
            console.log(`已同步角色 ${characterId} 的头像框到群聊 "${groupChat.name}"`);
          }
        }
      }
    }


    document.getElementById('avatar-frame-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    alert('头像框已保存并同步！');
    editingFrameForMember = false;
  }


  let isFrameManagementMode = false;
  let selectedFrames = new Set();

  function toggleFrameManagementMode() {
    isFrameManagementMode = !isFrameManagementMode;
    const manageBtn = document.getElementById('manage-frames-btn');
    const actionBar = document.getElementById('frame-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-frames-checkbox');


    document.querySelectorAll('.frame-grid').forEach(grid => {
      grid.classList.toggle('management-mode', isFrameManagementMode);
    });

    if (isFrameManagementMode) {
      manageBtn.textContent = '完成';
      actionBar.style.display = 'flex';
      selectedFrames.clear();
      selectAllCheckbox.checked = false;
      updateDeleteFrameButton();
    } else {
      manageBtn.textContent = '管理';
      actionBar.style.display = 'none';

      document.querySelectorAll('.frame-item.selected').forEach(item => {
        item.classList.remove('selected');
      });
    }
  }


  function updateDeleteFrameButton() {
    const btn = document.getElementById('delete-selected-frames-btn');
    btn.textContent = `删除 (${selectedFrames.size})`;
  }


  function handleSelectAllFrames() {
    const isChecked = document.getElementById('select-all-frames-checkbox').checked;
    const visibleGrid = document.querySelector('.frame-content[style*="display: block"] .frame-grid');
    if (!visibleGrid) return;


    visibleGrid.querySelectorAll('.frame-item:has(.delete-btn)').forEach(item => {
      const frameId = parseInt(item.querySelector('.delete-btn').dataset.id);
      if (isNaN(frameId)) return;

      item.classList.toggle('selected', isChecked);
      if (isChecked) {
        selectedFrames.add(frameId);
      } else {
        selectedFrames.delete(frameId);
      }
    });
    updateDeleteFrameButton();
  }


  async function executeBatchDeleteFrames() {
    if (selectedFrames.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要永久删除选中的 ${selectedFrames.size} 个自定义头像框吗？`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      const idsToDelete = [...selectedFrames];
      await db.customAvatarFrames.bulkDelete(idsToDelete);


      toggleFrameManagementMode();
      populateFrameGrids(editingFrameForMember);

      await showCustomAlert('删除成功', '选中的头像框已成功删除。');
    }
  }


