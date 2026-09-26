// ============================================================
// MY Phone 模块
// 来源：script.js 第 40153 ~ 41384 行
// 功能：MY Phone 我的手机全部功能
//       openMyphoneScreen、renderMyPhoneCharacterSelector、
//       switchToMyPhoneCharacter、enterMyPhone、锁屏、
//       联系人管理、消息管理、MyPhone 设置、删除模式
// ============================================================

  // MY Phone 相关变量
  let activeMyPhoneCharacterId = null;
  // 暴露到全局，供 CPhone 等其他模块访问
  Object.defineProperty(window, 'activeMyPhoneCharacterId', {
    get() { return activeMyPhoneCharacterId; },
    set(v) { activeMyPhoneCharacterId = v; }
  });

  // MY Phone 锁屏状态
  let myPhoneLockScreenState = {
    passwordBuffer: '',
    isLocked: false,
    pendingCharacterId: null
  };
  window.myPhoneLockScreenState = myPhoneLockScreenState;

  // MY Phone 删除模式相关状态
  let myPhoneDeleteMode = {
    active: false,
    appType: null, // 'qq', 'album', 'browser', 'taobao', 'memo', 'diary', 'usage', 'music', 'amap'
    selectedIndices: new Set()
  };
  window.myPhoneDeleteMode = myPhoneDeleteMode;
  let myPhoneDropdownMenusInitialized = false;

  // 初始化 MY Phone 下拉菜单
  function initMyPhoneDropdownMenus() {
    if (myPhoneDropdownMenusInitialized) return;
    myPhoneDropdownMenusInitialized = true;
    const screens = [
      'myphone-amap-screen',
      'myphone-qq-screen',
      'myphone-album-screen',
      'myphone-browser-screen',
      'myphone-taobao-screen',
      'myphone-memo-screen',
      'myphone-diary-screen',
      'myphone-usage-screen',
      'myphone-music-screen'
    ];

    screens.forEach(screenId => {
      const screen = document.getElementById(screenId);
      if (!screen) return;
      const headerActions = screen.querySelector('.header .header-actions');
      if (!headerActions) return;

      const actionBtns = Array.from(headerActions.querySelectorAll('.action-btn'));
      // 如果有多于2个按钮，合并为下拉菜单
      if (actionBtns.length >= 2) {
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'myphone-dropdown-container';

        const toggleBtn = document.createElement('span');
        toggleBtn.className = 'action-btn myphone-dropdown-toggle';
        toggleBtn.title = '更多操作';
        toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'myphone-dropdown-menu';
        
        actionBtns.forEach(btn => {
          const title = btn.getAttribute('title') || '';
          const originalContent = btn.innerHTML;
          
          btn.innerHTML = `<div class="dropdown-item-content">${originalContent}<span class="dropdown-item-text">${title}</span></div>`;
          btn.classList.add('myphone-dropdown-item');
          
          dropdownMenu.appendChild(btn);
        });

        dropdownContainer.appendChild(toggleBtn);
        dropdownContainer.appendChild(dropdownMenu);

        headerActions.innerHTML = '';
        headerActions.appendChild(dropdownContainer);

        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isVisible = dropdownMenu.classList.contains('show');
          
          document.querySelectorAll('.myphone-dropdown-menu.show').forEach(menu => {
             menu.classList.remove('show');
          });

          if (!isVisible) {
            dropdownMenu.classList.add('show');
          }
        });
      }
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.myphone-dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
      });
    });
  }

  // DOM 准备好后初始化下拉菜单
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMyPhoneDropdownMenus);
  } else {
    initMyPhoneDropdownMenus();
  }

  function openMyphoneScreen() {
    renderMyPhoneCharacterSelector();
    showScreen('myphone-selection-screen');
  }

  // openCharacterGeneratorScreen 由 character-generator.js 提供

  function renderMyPhoneCharacterSelector() {
    const gridEl = document.getElementById('myphone-character-grid');
    gridEl.innerHTML = '';

    const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (characters.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有可以查看手机的角色哦~</p>';
      return;
    }

    characters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.innerHTML = `
            <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${char.name}</span>
        `;
      item.addEventListener('click', () => switchToMyPhoneCharacter(char.id));
      gridEl.appendChild(item);
    });
  }

  async function switchToMyPhoneCharacter(characterId) {
    const char = state.chats[characterId];
    if (!char) return;

    // 检查是否启用了MyPhone锁屏
    if (char.settings.myPhoneLockScreenEnabled) {
      // 保存待进入的角色ID
      myPhoneLockScreenState.pendingCharacterId = characterId;

      // 显示锁屏界面
      showMyPhoneLockScreen(char);
      return;
    }

    // 如果没有启用锁屏，直接进入
    enterMyPhone(characterId);
  }

  function enterMyPhone(characterId) {
    activeMyPhoneCharacterId = characterId;
    console.log(`已切换到角色 ${characterId} 查看我的手机`);

    applyMyPhoneWallpaper();
    applyMyPhoneAppIcons();

    renderMyPhoneHomeScreen();
    showScreen('myphone-screen');
  }

  function renderMyPhoneHomeScreen() {
    switchToMyPhoneScreen('myphone-home-screen');
  }

  function switchToMyPhoneScreen(screenId) {
    const currentScreen = document.querySelector('#myphone-screen .char-screen.active');
    if (currentScreen?.id === 'myphone-qq-conversation-screen' && screenId !== 'myphone-qq-conversation-screen') {
      window.invalidateMyPhoneConversationRender?.();
    }
    document.querySelectorAll('#myphone-screen .char-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  function switchToMyPhoneHomeScreen() {
    switchToMyPhoneScreen('myphone-home-screen');
  }

  function switchToCPhone() {
    // 从 MY Phone 切换回 CP Phone 角色选择
    window.invalidateMyPhoneConversationRender?.();
    openCharacterSelector();
  }

  function openMyPhoneSettings() {
    // 回显设置
    const char = state.chats[activeMyPhoneCharacterId];
    if (char) {
      const toggle = document.getElementById('myphone-lock-screen-toggle');
      const detail = document.getElementById('myphone-lock-screen-settings-detail');
      const passwordInput = document.getElementById('myphone-lock-screen-password-input');

      if (toggle) {
        toggle.checked = char.settings.myPhoneLockScreenEnabled || false;
        if (detail) {
          detail.style.display = toggle.checked ? 'block' : 'none';
        }
      }

      if (passwordInput) {
        passwordInput.value = char.settings.myPhoneLockScreenPassword || '';
      }
    }

    switchToMyPhoneScreen('myphone-settings-screen');
  }

  function showMyPhoneLockScreen(char) {
    const lockScreen = document.getElementById('lock-screen');

    // 设置壁纸（使用主屏幕的锁屏壁纸）
    if (state.globalSettings.lockScreenWallpaper) {
      lockScreen.style.backgroundImage = `url(${state.globalSettings.lockScreenWallpaper})`;
    } else {
      lockScreen.style.backgroundImage = 'linear-gradient(135deg, #1c1c1e, #3a3a3c)';
    }

    // 标记为MyPhone锁屏模式
    myPhoneLockScreenState.isLocked = true;
    lockScreen.classList.add('active');
    lockScreen.classList.add('myphone-lock-mode');

    // 更新时钟
    updateMyPhoneLockScreenClock();
  }

  function updateMyPhoneLockScreenClock() {
    if (!myPhoneLockScreenState.isLocked) return;

    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateString = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

    document.getElementById('lock-time').textContent = timeString;
    document.getElementById('lock-date').textContent = dateString;
  }

  function showMyPhonePasswordInput() {
    const lockScreen = document.getElementById('lock-screen');
    const passwordArea = document.getElementById('lock-password-area');

    lockScreen.classList.add('input-mode');
    passwordArea.style.display = 'flex';
    myPhoneLockScreenState.passwordBuffer = '';
    updateMyPhoneLockDots();
  }

  function hideMyPhonePasswordInput() {
    const lockScreen = document.getElementById('lock-screen');
    const passwordArea = document.getElementById('lock-password-area');

    lockScreen.classList.remove('input-mode');
    passwordArea.style.display = 'none';
    myPhoneLockScreenState.passwordBuffer = '';
  }

  function updateMyPhoneLockDots() {
    const dots = document.querySelectorAll('.lock-dots .dot');
    const len = myPhoneLockScreenState.passwordBuffer.length;
    dots.forEach((dot, index) => {
      if (index < len) dot.classList.add('filled');
      else dot.classList.remove('filled');
    });
  }

  function checkMyPhoneLockPassword() {
    const characterId = myPhoneLockScreenState.pendingCharacterId;
    if (!characterId) return;

    const char = state.chats[characterId];
    if (!char) return;

    const correctPassword = char.settings.myPhoneLockScreenPassword;

    if (myPhoneLockScreenState.passwordBuffer === correctPassword) {
      // 解锁成功
      const lockScreen = document.getElementById('lock-screen');
      lockScreen.classList.add('unlocking');
      myPhoneLockScreenState.isLocked = false;

      setTimeout(() => {
        lockScreen.classList.remove('active');
        lockScreen.classList.remove('unlocking');
        lockScreen.classList.remove('myphone-lock-mode');
        hideMyPhonePasswordInput();

        // 进入MyPhone
        enterMyPhone(characterId);
        myPhoneLockScreenState.pendingCharacterId = null;
      }, 500);
    } else {
      // 解锁失败
      const dots = document.querySelector('.lock-dots');
      dots.classList.add('shake-animation');
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
        dots.classList.remove('shake-animation');
        myPhoneLockScreenState.passwordBuffer = '';
        updateMyPhoneLockDots();
      }, 400);
    }
  }

  function openMyPhoneViewRecords() {
    switchToMyPhoneScreen('myphone-view-records-screen');
  }

  // MY Phone 删除模式功能
  function toggleMyPhoneDeleteMode(appType) {
    if (myPhoneDeleteMode.active && myPhoneDeleteMode.appType === appType) {
      // 退出删除模式
      exitMyPhoneDeleteMode();
    } else {
      // 进入删除模式
      enterMyPhoneDeleteMode(appType);
    }
  }

  function enterMyPhoneDeleteMode(appType) {
    myPhoneDeleteMode.active = true;
    myPhoneDeleteMode.appType = appType;
    myPhoneDeleteMode.selectedIndices.clear();

    // 更新按钮UI - 添加删除模式工具栏
    const screen = document.getElementById(`myphone-${appType}-screen`);
    if (!screen) return;

    const header = screen.querySelector('.header');
    if (!header) return;

    // 隐藏其他按钮，只显示返回按钮
    const actionBtns = header.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => btn.style.display = 'none');
    
    // 也隐藏下拉菜单容器
    const dropdownContainer = header.querySelector('.myphone-dropdown-container');
    if (dropdownContainer) dropdownContainer.style.display = 'none';

    // 创建删除模式工具栏
    let deleteToolbar = header.querySelector('.delete-mode-toolbar');
    if (!deleteToolbar) {
      deleteToolbar = document.createElement('div');
      deleteToolbar.className = 'delete-mode-toolbar';
      deleteToolbar.style.cssText = 'display: flex; gap: 8px; align-items: center;';
      deleteToolbar.innerHTML = `
        <button class="delete-mode-btn" onclick="selectAllMyPhoneItems()" style="padding: 6px 12px; border: none; background: var(--accent-color); color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">全选</button>
        <button class="delete-mode-btn" onclick="confirmDeleteMyPhoneItems()" style="padding: 6px 12px; border: none; background: #ff4444; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">删除</button>
        <button class="delete-mode-btn" onclick="exitMyPhoneDeleteMode()" style="padding: 6px 12px; border: none; background: var(--secondary-bg); color: var(--text-color); border-radius: 6px; cursor: pointer; font-size: 14px;">取消</button>
      `;
      header.appendChild(deleteToolbar);
    }
    deleteToolbar.style.display = 'flex';

    // 重新渲染列表以显示复选框
    rerenderMyPhoneApp(appType);
  }

  function exitMyPhoneDeleteMode() {
    if (!myPhoneDeleteMode.active) return;

    const appType = myPhoneDeleteMode.appType;
    myPhoneDeleteMode.active = false;
    myPhoneDeleteMode.appType = null;
    myPhoneDeleteMode.selectedIndices.clear();

    // 恢复按钮UI
    const screen = document.getElementById(`myphone-${appType}-screen`);
    if (!screen) return;

    const header = screen.querySelector('.header');
    if (!header) return;

    // 恢复显示操作按钮
    const actionBtns = header.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => btn.style.display = '');

    // 恢复显示下拉菜单容器
    const dropdownContainer = header.querySelector('.myphone-dropdown-container');
    if (dropdownContainer) dropdownContainer.style.display = '';

    // 隐藏删除模式工具栏
    const deleteToolbar = header.querySelector('.delete-mode-toolbar');
    if (deleteToolbar) {
      deleteToolbar.style.display = 'none';
    }

    // 重新渲染列表以隐藏复选框
    rerenderMyPhoneApp(appType);
  }
  // 将函数暴露到全局作用域
  window.exitMyPhoneDeleteMode = exitMyPhoneDeleteMode;

  function selectAllMyPhoneItems() {
    if (!myPhoneDeleteMode.active) return;

    const appType = myPhoneDeleteMode.appType;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    let items = [];
    switch (appType) {
      case 'qq':
        items = char.myPhoneSimulatedQQConversations || [];
        break;
      case 'album':
        items = char.myPhoneAlbum || [];
        break;
      case 'browser':
        items = char.myPhoneBrowserHistory || [];
        break;
      case 'taobao':
        items = char.myPhoneTaobaoHistory || [];
        break;
      case 'memo':
        items = char.myPhoneMemos || [];
        break;
      case 'diary':
        items = char.myPhoneDiaries || [];
        break;
      case 'usage':
        items = char.myPhoneAppUsage || [];
        break;
      case 'music':
        items = char.myPhoneMusicPlaylist || [];
        break;
      case 'amap':
        items = char.myPhoneAmapHistory || [];
        break;
    }

    // 判断是全选还是取消全选
    const allSelected = myPhoneDeleteMode.selectedIndices.size === items.length;

    if (allSelected) {
      // 取消全选
      myPhoneDeleteMode.selectedIndices.clear();
    } else {
      // 全选
      myPhoneDeleteMode.selectedIndices.clear();
      items.forEach((_, idx) => myPhoneDeleteMode.selectedIndices.add(idx));
    }

    // 更新复选框状态
    updateMyPhoneCheckboxStates();
  }
  // 将函数暴露到全局作用域
  window.selectAllMyPhoneItems = selectAllMyPhoneItems;

  function toggleMyPhoneItemSelection(index) {
    if (!myPhoneDeleteMode.active) return;

    if (myPhoneDeleteMode.selectedIndices.has(index)) {
      myPhoneDeleteMode.selectedIndices.delete(index);
    } else {
      myPhoneDeleteMode.selectedIndices.add(index);
    }

    // 更新复选框状态
    updateMyPhoneCheckboxStates();
  }
  // 将函数暴露到全局作用域
  window.toggleMyPhoneItemSelection = toggleMyPhoneItemSelection;

  function updateMyPhoneCheckboxStates() {
    const checkboxes = document.querySelectorAll('.myphone-delete-checkbox');
    checkboxes.forEach(checkbox => {
      const index = parseInt(checkbox.dataset.index);
      checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
    });
  }

  async function confirmDeleteMyPhoneItems() {
    if (!myPhoneDeleteMode.active || myPhoneDeleteMode.selectedIndices.size === 0) {
      showCustomAlert('提示', '请至少选择一项要删除的内容');
      return;
    }

    const count = myPhoneDeleteMode.selectedIndices.size;
    const confirmed = await showCustomConfirm('确认删除', `确定要删除选中的 ${count} 项内容吗？`);

    if (!confirmed) return;

    const appType = myPhoneDeleteMode.appType;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    // 获取要删除的索引数组，从大到小排序（避免删除时索引变化）
    const indicesToDelete = Array.from(myPhoneDeleteMode.selectedIndices).sort((a, b) => b - a);

    // 根据appType删除对应的数据
    switch (appType) {
      case 'qq':
        if (!char.myPhoneSimulatedQQConversations) char.myPhoneSimulatedQQConversations = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneSimulatedQQConversations.splice(idx, 1);
        });
        break;
      case 'album':
        if (!char.myPhoneAlbum) char.myPhoneAlbum = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAlbum.splice(idx, 1);
        });
        break;
      case 'browser':
        if (!char.myPhoneBrowserHistory) char.myPhoneBrowserHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneBrowserHistory.splice(idx, 1);
        });
        break;
      case 'taobao':
        if (!char.myPhoneTaobaoHistory) char.myPhoneTaobaoHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneTaobaoHistory.splice(idx, 1);
        });
        break;
      case 'memo':
        if (!char.myPhoneMemos) char.myPhoneMemos = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneMemos.splice(idx, 1);
        });
        break;
      case 'diary':
        if (!char.myPhoneDiaries) char.myPhoneDiaries = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneDiaries.splice(idx, 1);
        });
        break;
      case 'usage':
        if (!char.myPhoneAppUsage) char.myPhoneAppUsage = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAppUsage.splice(idx, 1);
        });
        break;
      case 'music':
        if (!char.myPhoneMusicPlaylist) char.myPhoneMusicPlaylist = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneMusicPlaylist.splice(idx, 1);
        });
        break;
      case 'amap':
        if (!char.myPhoneAmapHistory) char.myPhoneAmapHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAmapHistory.splice(idx, 1);
        });
        break;
    }

    // 保存数据到数据库
    await db.chats.put(char);

    // 退出删除模式并刷新列表
    exitMyPhoneDeleteMode();

    showCustomAlert('成功', `已删除 ${count} 项内容`);
  }
  // 将函数暴露到全局作用域
  window.confirmDeleteMyPhoneItems = confirmDeleteMyPhoneItems;

  function rerenderMyPhoneApp(appType) {
    switch (appType) {
      case 'qq':
        renderMyPhoneSimulatedQQ();
        break;
      case 'album':
        renderMyPhoneAlbum();
        break;
      case 'browser':
        renderMyPhoneBrowserHistory();
        break;
      case 'taobao':
        renderMyPhoneTaobao();
        break;
      case 'memo':
        renderMyPhoneMemoList();
        break;
      case 'diary':
        renderMyPhoneDiaryList();
        break;
      case 'usage':
        renderMyPhoneAppUsage();
        break;
      case 'music':
        renderMyPhoneMusicScreen();
        break;
      case 'amap':
        renderMyPhoneAmap();
        break;
    }
  }

  // MY Phone 添加联系人选择弹窗
