  async function openDoubanCastSelector() {
    const modal = document.getElementById('douban-cast-modal');
    const listEl = document.getElementById('douban-cast-list');
    listEl.innerHTML = '';

    const allCharacters = Object.values(state.chats).filter(c => !c.isGroup);

    const activeIds = new Set(state.globalSettings.doubanActiveCharacterIds || []);

    if (allCharacters.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">还没有可以参与的角色。</p>';
    } else {
      allCharacters.forEach(char => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item' + (activeIds.has(char.id) ? ' selected' : '');
        item.innerHTML = `
                <div class="checkbox" style="margin-right: 15px;"></div>
                <input type="checkbox" class="douban-cast-checkbox" data-chat-id="${char.id}" ${activeIds.has(char.id) ? 'checked' : ''} style="display: none;">
                <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar" onerror="this.onerror=null; this.src=defaultAvatar;">
                <span class="name">${char.name}</span>
            `;
        listEl.appendChild(item);
      });
    }
    modal.classList.add('visible');
  }


  async function saveDoubanCastSelection() {
    const selectedCheckboxes = document.querySelectorAll('#douban-cast-list .douban-cast-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.chatId);


    state.globalSettings.doubanActiveCharacterIds = selectedIds;
    await db.globalSettings.put(state.globalSettings);

    document.getElementById('douban-cast-modal').classList.remove('visible');


    await handleGenerateDoubanPosts();
  }



  document.getElementById('douban-cast-select-btn').addEventListener('click', openDoubanCastSelector);
  document.getElementById('cancel-douban-cast-btn').addEventListener('click', () => {
    document.getElementById('douban-cast-modal').classList.remove('visible');
  });
  document.getElementById('save-douban-cast-btn').addEventListener('click', saveDoubanCastSelection);

  document.getElementById('douban-cast-list').addEventListener('click', (e) => {
    const item = e.target.closest('.contact-picker-item');
    if (item) {
      const checkbox = item.querySelector('.douban-cast-checkbox');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
      }
    }
  });

  async function openDoubanPersonaSelector() {
    const modal = document.getElementById('douban-persona-modal');
    const listEl = document.getElementById('douban-persona-list');
    listEl.innerHTML = '';

    const allPersonas = state.personaPresets || [];
    const activeIds = new Set(state.globalSettings.doubanActivePersonaIds || []);

    if (allPersonas.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">还没有可以参与的人设，请先去添加我的人设预设。</p>';
    } else {
      allPersonas.forEach(persona => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item' + (activeIds.has(persona.id) ? ' selected' : '');
        
        let personaDesc = persona.persona || '';
        if (personaDesc.length > 20) {
            personaDesc = personaDesc.substring(0, 20) + '...';
        }

        item.innerHTML = `
                <div class="checkbox" style="margin-right: 15px;"></div>
                <input type="radio" name="douban-persona-radio" class="douban-persona-radio" data-persona-id="${persona.id}" ${activeIds.has(persona.id) ? 'checked' : ''} style="display: none;">
                <img src="${persona.avatar || defaultAvatar}" class="avatar" onerror="this.onerror=null; this.src=defaultAvatar;">
                <span class="name">${personaDesc || '人设预设 ' + persona.id}</span>
            `;
        listEl.appendChild(item);
      });
    }
    modal.classList.add('visible');
  }

  async function saveDoubanPersonaSelection() {
    const selectedRadio = document.querySelector('#douban-persona-list .douban-persona-radio:checked');
    let selectedIds = [];
    if (selectedRadio) {
        const id = selectedRadio.dataset.personaId;
        selectedIds = [isNaN(parseInt(id)) ? id : parseInt(id)];
    }

    state.globalSettings.doubanActivePersonaIds = selectedIds;
    await db.globalSettings.put(state.globalSettings);

    document.getElementById('douban-persona-modal').classList.remove('visible');
    
    if (typeof showToast === 'function') {
        showToast('人设选择已保存', 'success');
    } else {
        await showCustomAlert('保存成功', '人设选择已更新！');
    }
  }

  const doubanPersonaSelectBtn = document.getElementById('douban-persona-select-btn');
  if (doubanPersonaSelectBtn) doubanPersonaSelectBtn.addEventListener('click', openDoubanPersonaSelector);
  
  const cancelDoubanPersonaBtn = document.getElementById('cancel-douban-persona-btn');
  if (cancelDoubanPersonaBtn) {
      cancelDoubanPersonaBtn.addEventListener('click', () => {
        document.getElementById('douban-persona-modal').classList.remove('visible');
      });
  }
  
  const saveDoubanPersonaBtn = document.getElementById('save-douban-persona-btn');
  if (saveDoubanPersonaBtn) saveDoubanPersonaBtn.addEventListener('click', saveDoubanPersonaSelection);

  const doubanPersonaList = document.getElementById('douban-persona-list');
  if (doubanPersonaList) {
      doubanPersonaList.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-picker-item');
        if (item) {
          const radio = item.querySelector('.douban-persona-radio');
          if (radio) {
            // 先清除同组其他的选中状态
            document.querySelectorAll('#douban-persona-list .contact-picker-item').forEach(el => el.classList.remove('selected'));
            radio.checked = true;
            item.classList.add('selected');
          }
        }
      });
  }

  async function openDoubanWorldBookSelector() {
    const modal = document.getElementById('douban-worldbook-modal');
    const listEl = document.getElementById('douban-worldbook-list');
    listEl.innerHTML = '';

    const allWorldBooks = state.worldBooks || [];
    const activeIds = new Set(state.globalSettings.doubanActiveWorldBookIds || []);

    if (allWorldBooks.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">还没有世界书，请先在设置中添加。</p>';
    } else {
      allWorldBooks.forEach(wb => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item' + (activeIds.has(wb.id) ? ' selected' : '');

        item.innerHTML = `
                <div class="checkbox" style="margin-right: 15px;"></div>
                <input type="checkbox" class="douban-worldbook-checkbox" data-worldbook-id="${wb.id}" ${activeIds.has(wb.id) ? 'checked' : ''} style="display: none;">
                <span class="name" style="margin-left: 10px;">${wb.name || '未命名世界书'}</span>
            `;
        listEl.appendChild(item);
      });
    }
    modal.classList.add('visible');
  }

  async function saveDoubanWorldBookSelection() {
    const selectedCheckboxes = document.querySelectorAll('#douban-worldbook-list .douban-worldbook-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => {
        const id = cb.dataset.worldbookId;
        return isNaN(parseInt(id)) ? id : parseInt(id);
    });

    state.globalSettings.doubanActiveWorldBookIds = selectedIds;
    await db.globalSettings.put(state.globalSettings);

    document.getElementById('douban-worldbook-modal').classList.remove('visible');
    
    if (typeof showToast === 'function') {
        showToast('世界书选择已保存', 'success');
    } else {
        await showCustomAlert('保存成功', '世界书选择已更新！');
    }
  }

  const doubanWorldBookSelectBtn = document.getElementById('douban-worldbook-select-btn');
  if (doubanWorldBookSelectBtn) doubanWorldBookSelectBtn.addEventListener('click', openDoubanWorldBookSelector);
  
  const cancelDoubanWorldBookBtn = document.getElementById('cancel-douban-worldbook-btn');
  if (cancelDoubanWorldBookBtn) {
      cancelDoubanWorldBookBtn.addEventListener('click', () => {
        document.getElementById('douban-worldbook-modal').classList.remove('visible');
      });
  }
  
  const saveDoubanWorldBookBtn = document.getElementById('save-douban-worldbook-btn');
  if (saveDoubanWorldBookBtn) saveDoubanWorldBookBtn.addEventListener('click', saveDoubanWorldBookSelection);

  const doubanWorldBookList = document.getElementById('douban-worldbook-list');
  if (doubanWorldBookList) {
      doubanWorldBookList.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-picker-item');
        if (item) {
          const checkbox = item.querySelector('.douban-worldbook-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
          }
        }
      });
  }


  function openDoubanSettingsModal() {
    const modal = document.getElementById('douban-settings-modal');


    document.getElementById('douban-min-posts-input').value = state.globalSettings.doubanMinPosts || 12;
    document.getElementById('douban-max-posts-input').value = state.globalSettings.doubanMaxPosts || 20;
    document.getElementById('douban-enable-ai-avatar-checkbox').checked = state.globalSettings.doubanEnableAiAvatar !== false;
    
    document.getElementById('douban-user-nickname-input').value = state.globalSettings.doubanUserNickname || '';
    const avatarPreview = document.getElementById('douban-user-avatar-preview');
    if (state.globalSettings.doubanUserAvatar) {
        avatarPreview.src = state.globalSettings.doubanUserAvatar;
    } else {
        avatarPreview.src = 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png';
    }

    modal.classList.add('visible');
  }


  async function saveDoubanSettings() {
    const minInput = document.getElementById('douban-min-posts-input');
    const maxInput = document.getElementById('douban-max-posts-input');
    const enableAiAvatarCheckbox = document.getElementById('douban-enable-ai-avatar-checkbox');
    const nicknameInput = document.getElementById('douban-user-nickname-input');
    const avatarPreview = document.getElementById('douban-user-avatar-preview');

    const min = parseInt(minInput.value);
    const max = parseInt(maxInput.value);


    if (isNaN(min) || isNaN(max) || min < 1 || max < 1) {
      alert("请输入有效的正整数！");
      return;
    }
    if (min > max) {
      alert("最小帖子数不能大于最大帖子数！");
      return;
    }


    state.globalSettings.doubanMinPosts = min;
    state.globalSettings.doubanMaxPosts = max;
    state.globalSettings.doubanEnableAiAvatar = enableAiAvatarCheckbox.checked;
    
    state.globalSettings.doubanUserNickname = nicknameInput.value.trim();
    if (avatarPreview.src.includes('D7CD735A73F5FD1D7B8407E0EB8BBAC0.png')) {
        state.globalSettings.doubanUserAvatar = '';
    } else {
        state.globalSettings.doubanUserAvatar = avatarPreview.src;
    }
    
    await db.globalSettings.put(state.globalSettings);


    document.getElementById('douban-settings-modal').classList.remove('visible');
    
    if (state.currentScreen === 'douban-screen') {
        await renderDoubanScreen();
    } else if (state.currentScreen === 'douban-post-detail-screen' && typeof activeDoubanPostId !== 'undefined' && activeDoubanPostId) {
        await openDoubanPostDetail(activeDoubanPostId);
    }
    
    await showCustomAlert('保存成功', '豆瓣设置已更新！');
  }

  // ========== 自定义小组管理功能 ==========
