// ============================================================
// CPhone 角色手机模块
// 来源：script.js 第 41385 ~ 46303 行
// 功能：CPhone 角色手机全部功能
//       renderCharacterSelector、switchToCharacterPhone、
//       renderCharHomeScreen、openCharApp、各 App 渲染、
//       所有 handleGenerate* 函数、角色音乐播放器、
//       setupCPhonePagination、窥屏记录等
// ============================================================

  // openCharacterSelector 来源：script.js 第 40148~40151 行
  function openCharacterSelector() {
    renderCharacterSelector();
    showScreen('character-selection-screen');
  }

  function renderCharacterSelector() {
    const gridEl = document.getElementById('character-grid');
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
      item.addEventListener('click', () => switchToCharacterPhone(char.id));
      gridEl.appendChild(item);
    });
  }



  async function switchToCharacterPhone(characterId) {
    activeCharacterId = characterId;
    console.log(`已切换到角色 ${characterId} 的手机`);


    applyCPhoneWallpaper();
    applyCPhoneAppIcons();
    applyMyPhoneWallpaper();
    applyMyPhoneAppIconsGlobal();


    renderCharHomeScreen();
    showScreen('character-phone-screen');

    // 初始化 CPhone 翻页功能
    setTimeout(() => {
      setupCPhonePagination();
    }, 100);
  }



  function switchToMyPhone() {
    window.invalidateCPhoneConversationRender?.();
    activeCharacterId = null;
    console.log("已返回我的手机");
    showScreen('home-screen');
  }


  function renderCharHomeScreen() {
    // 新布局不需要在这里更新大时钟了
    switchToCharScreen('char-home-screen');
    // 纪念日天数按日期实时更新
    if (typeof window.updateAnniversaryDayCount === 'function') {
      window.updateAnniversaryDayCount();
    }
  }

  // ==========================================
  // 纪念日天数：根据 p3-circle-date 实时计算并更新 p3-day-count
  // ==========================================
  window.updateAnniversaryDayCount = function () {
    const dateEl = document.getElementById('p3-circle-date');
    const countEl = document.getElementById('p3-day-count');
    if (!dateEl || !countEl) return;
    const raw = (dateEl.textContent || dateEl.innerText || '').trim().replace(/\s/g, '');
    if (!raw) return;
    // 支持 2025.3.14 / 2025.03.14 / 2025-03-14
    const parts = raw.split(/[.\-/]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
    if (parts.length < 3) return;
    const [y, m, d] = parts;
    const start = new Date(y, m - 1, d);
    if (isNaN(start.getTime())) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const diff = today - start;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    countEl.textContent = days >= 0 ? String(days) : '0';
  };

  // ==========================================
  // CPhone 气泡文字专用编辑函数 (弹窗编辑模式)
  // ==========================================
  window.editBubbleText = async function (elementId) {
    const textElement = document.getElementById(elementId);
    if (!textElement) return;

    // 获取当前文本，将<br>转换为\n以便在textarea中正确显示
    const currentText = textElement.innerHTML.replace(/<br\s*\/?>/gi, '\n');

    // 创建弹窗遮罩
    const overlay = document.createElement('div');
    overlay.id = 'text-edit-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    // 创建弹窗内容
    const modal = document.createElement('div');
    modal.style.cssText = `
      background-color: var(--secondary-bg, #ffffff);
      width: 85%;
      max-width: 320px;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      animation: modalSlideUp 0.3s ease;
    `;

    // 弹窗标题
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px;
      font-size: 17px;
      font-weight: 600;
      text-align: center;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      color: var(--text-primary, #1f1f1f);
    `;
    header.textContent = '编辑文字';

    // 弹窗主体
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 16px;
    `;

    const input = document.createElement('textarea');
    input.value = currentText;
    input.style.cssText = `
      width: 100%;
      min-height: 80px;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      font-size: 15px;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
      color: var(--text-primary, #1f1f1f);
      background-color: var(--secondary-bg, #ffffff);
      resize: vertical;
      line-height: 1.5;
    `;
    input.placeholder = '请输入文字...';

    // 添加提示文本
    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-secondary, #8a8a8a);
      text-align: center;
    `;
    hint.textContent = '支持换行输入 • Ctrl+Enter 保存';

    body.appendChild(input);
    body.appendChild(hint);

    // 弹窗底部按钮
    const footer = document.createElement('div');
    footer.style.cssText = `
      border-top: 1px solid var(--border-color, #e0e0e0);
      display: flex;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
      flex: 1;
      background: none;
      border: none;
      padding: 14px;
      font-size: 16px;
      color: var(--text-secondary, #8a8a8a);
      cursor: pointer;
      border-right: 1px solid var(--border-color, #e0e0e0);
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.cssText = `
      flex: 1;
      background: none;
      border: none;
      padding: 14px;
      font-size: 16px;
      color: var(--accent-color, #007bff);
      font-weight: 600;
      cursor: pointer;
    `;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    // 组装弹窗
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // 保存函数
    async function saveEdit() {
      const newText = input.value.trim();
      if (newText) {
        // 使用innerHTML来保留换行，将\n转换为<br>
        textElement.innerHTML = newText.replace(/\n/g, '<br>');
        // 保存到数据库
        if (!state.globalSettings.widgetData) {
          state.globalSettings.widgetData = {};
        }
        state.globalSettings.widgetData[elementId] = newText;
        await db.globalSettings.put(state.globalSettings);
        // 若修改的是纪念日日期，则重新计算并更新天数
        if (elementId === 'p3-circle-date' && typeof window.updateAnniversaryDayCount === 'function') {
          window.updateAnniversaryDayCount();
        }
      }
      closeModal();
    }

    // 关闭弹窗
    function closeModal() {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        overlay.remove();
      }, 200);
    }

    // 事件绑定
    confirmBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    input.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter 保存，Escape 取消
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });

    // 添加到页面并聚焦
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 100);

    // 阻止事件冒泡
    if (window.event) window.event.stopPropagation();
  }
  function switchToCharScreen(screenId) {
    const currentScreen = document.querySelector('.char-screen.active');
    if (currentScreen?.id === 'char-qq-conversation-screen' && screenId !== 'char-qq-conversation-screen') {
      window.invalidateCPhoneConversationRender?.();
    }
    document.querySelectorAll('.char-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  window.switchToCharScreen = switchToCharScreen;




  // 记录角色手机查看行为 - 单个项目版本
  async function logSingleItemViewing(characterId, appName, itemData, itemType = '') {
    const char = state.chats[characterId];
    if (!char || char.isGroup) return;

    // 检查角色是否开启了"知晓窥屏"功能
    if (!char.settings.phoneViewingAwareness) return;

    // 如果没有数据，不记录
    if (!itemData) {
      console.log(`[窥屏记录] ${char.name}: ${appName} 没有数据，不发送通知`);
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const appNameMap = {
      'qq': 'QQ',
      'album': '相册',
      'browser': '浏览器',
      'taobao': '淘宝',
      'memo': '备忘录',
      'diary': '日记',
      'amap': '高德地图',
      'usage': 'APP使用记录',
      'music': '网易云音乐'
    };

    let systemMessage = `[系统通知] ${timeStr}\n用户打开了你的手机，并且点开了${appNameMap[appName] || appName} APP`;

    // 根据不同类型构建详细内容
    let detailContent = '';

    if (appName === 'diary') {
      const dateStr = itemData.timestamp ? new Date(itemData.timestamp).toLocaleDateString('zh-CN') : '';
      systemMessage += `查看了你的日记`;
      detailContent = `\n\n【日记标题】${itemData.title || '无标题'}\n【日期】${dateStr}\n【内容】\n${itemData.content || '(空白)'}`;
    } else if (appName === 'memo') {
      systemMessage += `查看了你的备忘录`;
      detailContent = `\n\n【备忘录标题】${itemData.title || '无标题'}\n【内容】\n${itemData.content || '(空白)'}`;
    } else if (appName === 'album') {
      systemMessage += `查看了你的照片`;
      detailContent = `\n\n【照片描述】\n${itemData.description || itemData.caption || '(这张照片没有描述)'}`;
    } else if (appName === 'browser') {
      systemMessage += `查看了你的浏览历史`;
      detailContent = `\n\n【标题】${itemData.title || '无标题'}\n【网址】${itemData.url || ''}\n【内容】${itemData.content || '(无内容)'}`;
    } else if (appName === 'taobao') {
      systemMessage += `查看了你的购物记录`;
      detailContent = `\n\n【商品】${itemData.name || ''}\n【价格】${itemData.price ? '¥' + itemData.price : '未知'}\n【描述】${itemData.description || ''}`;
    } else if (appName === 'amap') {
      systemMessage += `查看了你的地图足迹`;
      detailContent = `\n\n【位置】${itemData.location || ''}\n【时间】${itemData.time || ''}\n【详情】${itemData.details || ''}`;
    } else if (appName === 'music') {
      systemMessage += `查看了你的音乐`;
      detailContent = `\n\n【歌曲】${itemData.title || ''}\n【艺术家】${itemData.artist || ''}\n【专辑】${itemData.album || ''}`;
    }

    systemMessage += detailContent;

    // 添加为灰色系统消息和隐藏调试层
    const viewingLog = {
      role: 'system',
      content: systemMessage,
      timestamp: now.getTime(),
      isHidden: true,
      isGrayNotice: true
    };

    char.history.push(viewingLog);
    await db.chats.put(char);

    console.log(`[窥屏记录] ${char.name}: 查看了 ${appNameMap[appName]} - ${itemData.title || itemData.name || '某项内容'}`);
  }

  async function openCharApp(appName) {
    if (!activeCharacterId) return;
    const char = state.chats[activeCharacterId];


    await logAppUsage(activeCharacterId, appName);


    switch (appName) {
      case 'qq':
        renderCharSimulatedQQ();
        switchToCharScreen('char-qq-screen');
        break;
      case 'album':
        renderCharAlbum();
        switchToCharScreen('char-album-screen');
        break;
      case 'browser':
        renderCharBrowserHistory();
        switchToCharScreen('char-browser-screen');
        break;
      case 'taobao':
        renderCharTaobao();
        switchToCharScreen('char-taobao-screen');
        break;
      case 'memo':
        await renderCharMemoList();
        switchToCharScreen('char-memo-screen');
        break;
      case 'diary':
        renderCharDiaryList();
        switchToCharScreen('char-diary-screen');
        break;
      case 'amap':
        renderCharAmap();
        switchToCharScreen('char-amap-screen');
        break;



      case 'music':
        renderCharMusicScreen();
        switchToCharScreen('char-music-screen');
        break;
      case 'bilibili':
        document.getElementById('char-bilibili-search-input').value = '';

        renderCharBilibiliScreen();
        switchToCharScreen('char-bilibili-screen');
        break;
      case 'reddit':
        // 默认加载热门内容
        if (char.simulatedRedditFeed && char.simulatedRedditFeed.length > 0) {
          console.log("加载已保存的 Reddit 推荐流");
          renderRedditList(char.simulatedRedditFeed);
        } else {
          // 只有当没有缓存时，才去加载热门内容
          console.log("无缓存，加载默认热门内容");
          handleRedditSearch('popular');
        }
        switchToCharScreen('char-reddit-screen');
        break;
      case 'usage':
        renderCharAppUsage();
        switchToCharScreen('char-usage-screen');
        break;
      case 'settings':
        // 设置 APP 占位，暂未实现
        await showCustomAlert("提示", "设置功能即将推出，敬请期待！");
        break;
    }
  }


  async function renderCharAlbum() {
    const gridEl = document.getElementById('char-album-grid');
    gridEl.innerHTML = '';
    if (!activeCharacterId) return;
    const char = state.chats[activeCharacterId];

    const photos = char.simulatedAlbum || [];

    if (photos.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的相册还是空的，<br>点击右上角刷新按钮生成一些照片吧！</p>';
      return;
    }

    const fallbackImageUrl = `https://i.postimg.cc/KYr2qRCK/1.jpg`;

    photos.forEach(photo => {
      const item = document.createElement('div');
      item.className = 'char-photo-item';
      item.dataset.description = photo.description;
      gridEl.appendChild(item);

      // 添加点击事件，查看照片详情
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => viewPhotoDetail(photo));



      if (state.globalSettings.enableAiDrawing) {

        item.style.backgroundColor = '#e9ecef';
        const containsNonEnglish = /[^\x00-\x7F]/.test(photo.image_prompt);
        const isValidPrompt = photo.image_prompt && photo.image_prompt.trim() && !containsNonEnglish;
        const finalPrompt = isValidPrompt ? photo.image_prompt : 'a beautiful scenery, anime style, cinematic lighting';
        const imageUrl = getPollinationsImageUrl(finalPrompt);

        const img = new Image();
        img.onload = function () {
          item.style.backgroundImage = `url(${this.src})`;
        };
        img.onerror = function () {
          item.style.backgroundImage = `url(${fallbackImageUrl})`;
        };
        img.src = imageUrl;

      } else {

        item.style.backgroundColor = '#f0f2f5';
        item.style.border = '1px solid #e0e0e0';


        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'char-photo-description';
        descriptionEl.textContent = photo.description || '(这张照片没有描述)';


        item.appendChild(descriptionEl);
      }

    });
  }

  // 查看照片详情（记录窥屏）
  async function viewPhotoDetail(photo) {
    if (!activeCharacterId) return;

    // 记录窥屏行为
    await logSingleItemViewing(activeCharacterId, 'album', photo);

    // 显示照片详情
    const description = photo.description || photo.caption || '这张照片没有描述';
    await showCustomAlert('照片详情', description);
  }


  function renderCharBrowserHistory() {
    const listEl = document.getElementById('char-browser-history');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    // 如果没有历史记录，尝试生成默认的假数据
    if (!char.simulatedBrowserHistory || char.simulatedBrowserHistory.length === 0) {
      // 这里保留你原有的生成逻辑，或者显示空状态
      // 为了保持视觉统一，即使是随机生成的假数据也应用新结构
      const historyKeywords = [char.name, "爱好", "旅游", "美食", "新闻", ...char.settings.aiPersona.split(/，|。|\s/).slice(0, 5)];
      const historySites = ["知乎", "Bilibili", "小红书", "微博", "维基百科"];

      // 临时生成演示数据
      const demoHistory = [];
      for (let i = 0; i < 10; i++) {
        const keyword = historyKeywords[Math.floor(Math.random() * historyKeywords.length)];
        const site = historySites[Math.floor(Math.random() * historySites.length)];
        demoHistory.push({
          title: `${keyword} - ${site}`,
          url: `www.${site.toLowerCase()}.com`,
          content: "内容加载中..."
        });
      }
      char.simulatedBrowserHistory = demoHistory;
    }

    const history = char.simulatedBrowserHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的浏览器空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    // 定义地球图标的 SVG
    const globeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

    // 定义右箭头 SVG
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    history.forEach((item, index) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'char-browser-item';

      // 简化 URL 显示，去掉 https://
      let cleanUrl = item.url.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (cleanUrl.length > 25) cleanUrl = cleanUrl.substring(0, 25) + '...';

      entryEl.innerHTML = `
            <div class="char-browser-icon-box">
                ${globeIcon}
            </div>
            <div class="char-browser-info">
                <div class="title">${item.title}</div>
                <div class="url">${cleanUrl}</div>
            </div>
            <div class="char-browser-arrow">
                ${arrowIcon}
            </div>
        `;

      entryEl.addEventListener('click', () => openCharArticle(index));
      listEl.appendChild(entryEl);
    });
  }



  function renderCharTaobao() {
    const gridEl = document.getElementById('char-product-grid');
    gridEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const purchases = char.simulatedTaobaoHistory?.purchases || [];

    if (purchases.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA最近好像什么都没买呢，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    purchases.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-product-item';
      itemEl.dataset.reason = item.reason;

      let imageOrTextHtml;
      if (state.globalSettings.enableAiDrawing) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt || 'a random product');
        imageOrTextHtml = `<img src="${imageUrl}" class="product-image">`;
      } else {
        imageOrTextHtml = `
                        <div class="char-product-description-overlay">
                            <p class="char-photo-description">${item.reason || '(无购买理由)'}</p>
                        </div>
                    `;
      }


      itemEl.innerHTML = `
                    ${imageOrTextHtml}
                    <div class="product-info">
                        <div class="product-name">${item.itemName}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <div class="product-price">${(item.price || 0).toFixed(2)}</div>
                            <div class="char-product-status">${item.status}</div>
                        </div>
                    </div>
                `;

      gridEl.appendChild(itemEl);
    });
  }

  function switchToCharHomeScreen() {
    switchToCharScreen('char-home-screen');
  }

  // CPhone 翻页功能
  let cphoneCurrentPage = 0;
  const cphoneTotalPages = 2;

  function setupCPhonePagination() {
    const pagesContainer = document.getElementById('cphone-pages-container');
    const pages = document.getElementById('cphone-pages');
    const dots = document.querySelectorAll('.cphone-pagination-dot');

    if (!pagesContainer || !pages) return;

    let startX = 0, startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isClick = true;

    const updatePagination = () => {
      pages.style.transform = `translateX(-${cphoneCurrentPage * (100 / cphoneTotalPages)}%)`;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === cphoneCurrentPage);
      });
    };

    const onDragStart = (e) => {
      isDragging = true;
      isClick = true;
      startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      pages.style.transition = 'none';
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      let diffX = currentX - startX;
      const diffY = currentY - startY;

      if (isClick && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        isClick = false;
      }

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) e.preventDefault();

        const maxSwipeDistance = pagesContainer.offsetWidth * 0.8;

        if (diffX < 0 && cphoneCurrentPage >= cphoneTotalPages - 1) {
          diffX = Math.max(diffX, -maxSwipeDistance * 0.3);
        } else if (diffX < 0) {
          diffX = Math.max(diffX, -maxSwipeDistance);
        }

        if (diffX > 0 && cphoneCurrentPage <= 0) {
          diffX = Math.min(diffX, maxSwipeDistance * 0.3);
        } else if (diffX > 0) {
          diffX = Math.min(diffX, maxSwipeDistance);
        }

        pages.style.transform = `translateX(calc(-${cphoneCurrentPage * (100 / cphoneTotalPages)}% + ${diffX}px))`;
      }
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pages.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

      if (isClick) {
        updatePagination();
        return;
      }

      const diffX = currentX - startX;
      const swipeThreshold = pagesContainer.offsetWidth / 3;

      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && cphoneCurrentPage > 0) {
          cphoneCurrentPage--;
        } else if (diffX < 0 && cphoneCurrentPage < cphoneTotalPages - 1) {
          cphoneCurrentPage++;
        }
      }
      updatePagination();
    };

    pagesContainer.addEventListener('mousedown', onDragStart);
    pagesContainer.addEventListener('mousemove', onDragMove);
    pagesContainer.addEventListener('mouseup', onDragEnd);
    pagesContainer.addEventListener('mouseleave', onDragEnd);

    pagesContainer.addEventListener('touchstart', onDragStart, { passive: false });
    pagesContainer.addEventListener('touchmove', onDragMove, { passive: false });
    pagesContainer.addEventListener('touchend', onDragEnd);

    // 点击指示器切换页面
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        cphoneCurrentPage = index;
        updatePagination();
      });
    });

    updatePagination();
  }


