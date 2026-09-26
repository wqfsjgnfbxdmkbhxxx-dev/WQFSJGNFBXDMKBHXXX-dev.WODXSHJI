  // ============================================================
  // NPC 管理功能（从 script.js 迁移）
  // ============================================================

  async function renderNpcListScreen() {
    const listEl = document.getElementById('npc-list');
    listEl.innerHTML = '';

    const npcs = await db.npcs.toArray();

    if (npcs.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有创建任何NPC，<br>点击右上角"+"添加第一个吧！</p>';
      return;
    }

    npcs.forEach(npc => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.npcId = npc.id;

      item.innerHTML = `
            <img src="${npc.avatar || defaultGroupMemberAvatar}" class="avatar" style="border-radius: 50%;">
            <div class="info">
                <div class="name-line">
                    <span class="name">${npc.name}</span>
                </div>
                <div class="last-msg">${npc.persona.substring(0, 30)}...</div>
            </div>
        `;

      item.addEventListener('click', () => openNpcEditor(npc.id));

      addLongPressListener(item, async () => {
        await deleteNpc(npc.id);
      });

      listEl.appendChild(item);
    });
  }

  async function openNpcEditor(npcId = null) {
    editingNpcId = npcId;
    const modal = document.getElementById('npc-editor-modal');
    const titleEl = document.getElementById('npc-editor-title');
    const nameInput = document.getElementById('npc-name-input');
    const personaInput = document.getElementById('npc-persona-input');
    const avatarPreview = document.getElementById('npc-avatar-preview');
    const associationListEl = document.getElementById('npc-association-list');

    const groupSelectEl = document.getElementById('npc-group-select');
    const activitySwitch = document.getElementById('npc-background-activity-switch');
    const cooldownInput = document.getElementById('npc-action-cooldown-input');

    associationListEl.innerHTML = '';
    groupSelectEl.innerHTML = '<option value="">-- 未分组 --</option>';

    const npcGroups = await db.npcGroups.toArray();
    npcGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      groupSelectEl.appendChild(option);
    });

    const userItemHtml = `
      <label class="npc-ios-checkbox-item" data-name="${(state.qzoneSettings.nickname || '我').toLowerCase()}">
        <span class="npc-ios-checkbox-name">${state.qzoneSettings.nickname || '我'} <span class="npc-ios-role-tag">用户</span></span>
        <input type="checkbox" value="user" class="npc-ios-checkbox-input">
        <span class="npc-ios-checkmark"></span>
      </label>
    `;
    let charItemsHtml = userItemHtml;

    Object.values(state.chats).filter(c => !c.isGroup).forEach(char => {
      charItemsHtml += `
        <label class="npc-ios-checkbox-item" data-name="${(char.name || '').toLowerCase()}">
          <span class="npc-ios-checkbox-name">${char.name} <span class="npc-ios-role-tag">角色</span></span>
          <input type="checkbox" value="${char.id}" class="npc-ios-checkbox-input">
          <span class="npc-ios-checkmark"></span>
        </label>
      `;
    });
    associationListEl.innerHTML = charItemsHtml;

    // 初始化/重置关联角色搜索框
    const searchInput = document.getElementById('npc-association-search-input');
    const searchClear = document.getElementById('npc-association-search-clear');
    const searchEmpty = document.getElementById('npc-association-empty');

    function filterAssociations() {
      const term = (searchInput ? searchInput.value.trim() : '').toLowerCase();
      if (searchClear) {
        searchClear.style.display = term ? 'flex' : 'none';
      }
      let visibleCount = 0;
      const items = associationListEl.querySelectorAll('.npc-ios-checkbox-item');
      items.forEach(item => {
        const name = item.dataset.name || '';
        const match = !term || name.includes(term);
        item.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
      });
      if (searchEmpty) {
        searchEmpty.style.display = visibleCount === 0 ? 'block' : 'none';
      }
    }

    if (searchInput) {
      searchInput.value = '';
      if (!searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', () => {
          const currentList = document.getElementById('npc-association-list');
          const currentClear = document.getElementById('npc-association-search-clear');
          const currentEmpty = document.getElementById('npc-association-empty');
          const term = searchInput.value.trim().toLowerCase();
          if (currentClear) currentClear.style.display = term ? 'flex' : 'none';
          let count = 0;
          if (currentList) {
            currentList.querySelectorAll('.npc-ios-checkbox-item').forEach(item => {
              const name = item.dataset.name || '';
              const match = !term || name.includes(term);
              item.style.display = match ? 'flex' : 'none';
              if (match) count++;
            });
          }
          if (currentEmpty) {
            currentEmpty.style.display = count === 0 ? 'block' : 'none';
          }
        });
      }
    }

    if (searchClear) {
      searchClear.style.display = 'none';
      if (!searchClear.dataset.bound) {
        searchClear.dataset.bound = 'true';
        searchClear.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
            searchInput.dispatchEvent(new Event('input'));
          }
        });
      }
    }

    if (searchEmpty) {
      searchEmpty.style.display = 'none';
    }

    if (npcId) {
      titleEl.textContent = '编辑 NPC';
      const npc = await db.npcs.get(npcId);
      if (npc) {
        nameInput.value = npc.name;
        personaInput.value = npc.persona;
        avatarPreview.src = npc.avatar || defaultGroupMemberAvatar;
        activitySwitch.checked = npc.enableBackgroundActivity !== false;
        cooldownInput.value = npc.actionCooldownMinutes || 15;
        groupSelectEl.value = npc.npcGroupId || '';

        if (npc.associatedWith && Array.isArray(npc.associatedWith)) {
          npc.associatedWith.forEach(id => {
            const checkbox = associationListEl.querySelector(`input[value="${id}"]`);
            if (checkbox) checkbox.checked = true;
          });
        }
      }
    } else {
      titleEl.textContent = '添加 NPC';
      nameInput.value = '';
      personaInput.value = '';
      avatarPreview.src = defaultGroupMemberAvatar;
      activitySwitch.checked = true;
      cooldownInput.value = 15;
      groupSelectEl.value = '';

      const userCheckbox = associationListEl.querySelector('input[value="user"]');
      if (userCheckbox) userCheckbox.checked = true;
    }

    modal.classList.add('visible');
  }

  async function saveNpc() {
    const name = document.getElementById('npc-name-input').value.trim();
    const persona = document.getElementById('npc-persona-input').value.trim();
    if (!name || !persona) {
      alert("NPC的昵称和人设都不能为空！");
      return;
    }

    const selectedAssociations = Array.from(document.querySelectorAll('#npc-association-list input:checked')).map(cb => cb.value);
    const enableBackgroundActivity = document.getElementById('npc-background-activity-switch').checked;
    const actionCooldownMinutes = parseInt(document.getElementById('npc-action-cooldown-input').value) || 15;
    const npcGroupId = parseInt(document.getElementById('npc-group-select').value) || null;

    const npcData = {
      name,
      persona,
      avatar: document.getElementById('npc-avatar-preview').src,
      associatedWith: selectedAssociations,
      enableBackgroundActivity: enableBackgroundActivity,
      actionCooldownMinutes: actionCooldownMinutes,
      npcGroupId: npcGroupId
    };

    if (editingNpcId) {
      await db.npcs.update(editingNpcId, npcData);
    } else {
      const newNpcId = await db.npcs.add(npcData);
      if (isAddingNpcToGroup && state.activeChatId) {
        const chat = state.chats[state.activeChatId];
        if (chat.isGroup) {
          chat.members.push({
            id: `npc_${newNpcId}`,
            originalName: name,
            groupNickname: name,
            persona: persona,
            avatar: npcData.avatar,
            isNpc: true
          });
          await db.chats.put(chat);
        }
      }
    }

    document.getElementById('npc-editor-modal').classList.remove('visible');

    if (isAddingNpcToGroup) {
      isAddingNpcToGroup = false;
      openMemberManagementScreen();
    } else {
      await renderNpcListScreen();
    }
  }

  async function openNpcGroupManager() {
    await renderNpcGroupsInManager();
    document.getElementById('npc-group-manager-modal').classList.add('visible');
  }

  async function renderNpcGroupsInManager() {
    const listEl = document.getElementById('existing-npc-groups-list');
    const categories = await db.npcGroups.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分组</p>';
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

  async function addNewNpcGroup() {
    const input = document.getElementById('new-npc-group-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分组名不能为空！');
      return;
    }
    const existing = await db.npcGroups.where('name').equals(name).first();
    if (existing) {
      alert(`分组 "${name}" 已经存在了！`);
      return;
    }
    await db.npcGroups.add({ name });
    input.value = '';
    await renderNpcGroupsInManager();
  }

  async function deleteNpcGroup(groupId) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '删除分组后，该组内的所有NPC将变为"未分组"。确定要删除吗？', {
        confirmButtonClass: 'btn-danger'
      }
    );
    if (confirmed) {
      await db.npcGroups.delete(groupId);
      await db.npcs.where('npcGroupId').equals(groupId).modify({ npcGroupId: null });
      await renderNpcGroupsInManager();
    }
  }

  async function deleteNpc(npcId) {
    const npc = await db.npcs.get(npcId);
    if (!npc) return;
    const confirmed = await showCustomConfirm('删除NPC', `确定要删除NPC "${npc.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.npcs.delete(npcId);
      await renderNpcListScreen();
    }
  }
