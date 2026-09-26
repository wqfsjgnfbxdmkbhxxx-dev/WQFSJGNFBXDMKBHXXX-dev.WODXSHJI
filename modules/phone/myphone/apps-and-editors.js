  // ========== 从 script.js 迁移的 MyPhone 渲染和保存函数 ==========

  async function renderMyPhoneAlbum() {
    const gridEl = document.getElementById('myphone-album-grid');
    gridEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const photos = char.myPhoneAlbum || [];

    if (photos.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的相册还是空的，<br>点击右上角刷新按钮生成一些照片吧！</p>';
      return;
    }

    const fallbackImageUrl = `https://i.postimg.cc/KYr2qRCK/1.jpg`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'album';

    photos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'char-photo-item';
      item.dataset.description = photo.description;
      item.style.position = 'relative';
      gridEl.appendChild(item);

      if (isDeleteMode) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'myphone-delete-checkbox';
        checkbox.dataset.index = idx;
        checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        checkbox.style.cssText = 'position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;';
        checkbox.onchange = () => toggleMyPhoneItemSelection(idx);
        item.appendChild(checkbox);
      }

      if (state.globalSettings.enableAiDrawing) {
        item.style.backgroundColor = '#e9ecef';
        const containsNonEnglish = /[^\x00-\x7F]/.test(photo.image_prompt);
        const isValidPrompt = photo.image_prompt && photo.image_prompt.trim() && !containsNonEnglish;
        const finalPrompt = isValidPrompt ? photo.image_prompt : 'a beautiful scenery, anime style, cinematic lighting';
        const imageUrl = getPollinationsImageUrl(finalPrompt);
        const img = new Image();
        img.onload = function () { item.style.backgroundImage = `url(${this.src})`; };
        img.onerror = function () { item.style.backgroundImage = `url(${fallbackImageUrl})`; };
        img.src = imageUrl;
      } else {
        item.style.backgroundColor = '#f0f2f5';
        item.style.border = '1px solid #e0e0e0';
        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'char-photo-description';
        descriptionEl.textContent = photo.description || '(这张照片没有描述)';
        item.appendChild(descriptionEl);
      }

      if (isDeleteMode) {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        item.addEventListener('click', () => { showCustomAlert('照片描述', photo.description || '无描述'); });
      }
    });
  }

  function renderMyPhoneBrowserHistory() {
    const listEl = document.getElementById('myphone-browser-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const history = char.myPhoneBrowserHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的浏览器空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    const globeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'browser';

    history.forEach((item, index) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'char-browser-item';
      let cleanUrl = item.url.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (cleanUrl.length > 25) cleanUrl = cleanUrl.substring(0, 25) + '...';

      if (isDeleteMode) {
        entryEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${index}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${index})">
        <div class="char-browser-icon-box">${globeIcon}</div>
        <div class="char-browser-content"><div class="char-browser-title">${item.title}</div><div class="char-browser-url">${cleanUrl}</div></div>
        <div class="char-browser-arrow">${arrowIcon}</div>`;
        entryEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(index);
          const checkbox = entryEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
        });
      } else {
        entryEl.innerHTML = `
        <div class="char-browser-icon-box">${globeIcon}</div>
        <div class="char-browser-content"><div class="char-browser-title">${item.title}</div><div class="char-browser-url">${cleanUrl}</div></div>
        <div class="char-browser-arrow">${arrowIcon}</div>`;
        entryEl.addEventListener('click', () => openMyPhoneArticle(index));
      }
      listEl.appendChild(entryEl);
    });
    document.getElementById('back-to-myphone-browser-list-btn').onclick = () => switchToMyPhoneScreen('myphone-browser-screen');
  }

  async function openMyPhoneArticle(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const articleData = char.myPhoneBrowserHistory[index];
    if (!articleData) return;
    renderMyPhoneArticle(articleData);
    switchToMyPhoneScreen('myphone-browser-article-screen');
  }

  function renderMyPhoneArticle(articleData) {
    document.getElementById('myphone-article-title-header').textContent = articleData.title.substring(0, 10) + '...';
    document.getElementById('myphone-article-title').textContent = articleData.title;
    document.getElementById('myphone-article-meta').textContent = articleData.url;
    document.getElementById('myphone-article-content').textContent = articleData.content || '内容加载中...';
  }

  function renderMyPhoneTaobao() {
    const gridEl = document.getElementById('myphone-taobao-grid');
    gridEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const items = char.myPhoneTaobaoHistory || [];

    if (items.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的淘宝空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'taobao';

    items.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-product-item';
      itemEl.dataset.reason = item.reason || item.thought;
      itemEl.style.position = 'relative';

      let imageOrTextHtml;
      if (item.image_prompt && !item.useDefaultImage && state.globalSettings.enableAiDrawing) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        imageOrTextHtml = `<img src="${imageUrl}" class="product-image">`;
      } else {
        imageOrTextHtml = `<div class="char-product-description-overlay"><p class="char-photo-description">${item.thought || item.reason || '(无购买理由)'}</p></div>`;
      }

      let checkboxHtml = '';
      if (isDeleteMode) {
        checkboxHtml = `<input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;" onchange="toggleMyPhoneItemSelection(${idx})">`;
      }

      itemEl.innerHTML = `${checkboxHtml}${imageOrTextHtml}
      <div class="product-info">
        <div class="product-name">${item.name}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <div class="product-price">¥${(parseFloat(item.price) || 0).toFixed(2)}</div>
          <div class="char-product-status">${item.status || '已签收'}</div>
        </div>
      </div>`;

      if (isDeleteMode) {
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        itemEl.addEventListener('click', () => { showCustomAlert('购买想法', item.thought || item.reason || '无想法记录'); });
      }
      gridEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneMemoList() {
    const listEl = document.getElementById('myphone-memo-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    const memos = (char.myPhoneMemos || []).slice().reverse();

    if (memos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的备忘录空空如也，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    const memoIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'memo';

    memos.forEach((memo, index) => {
      const item = document.createElement('div');
      item.className = 'memo-item';
      const previewText = (memo.content || '').split('\n')[0].substring(0, 50) || '无内容';
      const actualIndex = memos.length - 1 - index;

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        <div class="cphone-item-icon-box memo-icon-style">${memoIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${memo.title}</div><div class="cphone-item-preview">${previewText}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        item.innerHTML = `
        <div class="cphone-item-icon-box memo-icon-style">${memoIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${memo.title}</div><div class="cphone-item-preview">${previewText}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', () => openMyPhoneMemo(actualIndex));
      }
      listEl.appendChild(item);
    });
    document.getElementById('back-to-myphone-memo-list-btn').onclick = () => switchToMyPhoneScreen('myphone-memo-screen');
  }

  function openMyPhoneMemo(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const memo = char.myPhoneMemos[index];
    if (!memo) return;
    document.getElementById('myphone-memo-title-header').textContent = memo.title.substring(0, 10) + '...';
    document.getElementById('myphone-memo-detail-title').textContent = memo.title;
    document.getElementById('myphone-memo-detail-date').textContent = memo.date;
    document.getElementById('myphone-memo-detail-content').textContent = memo.content;
    switchToMyPhoneScreen('myphone-memo-detail-screen');
  }

  function renderMyPhoneDiaryList() {
    const listEl = document.getElementById('myphone-diary-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    const diaries = (char.myPhoneDiaries || []).slice().reverse();

    if (diaries.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的日记空空如也，<br>点击右上角刷新按钮生成一些内容吧！</p>';
      return;
    }

    const diaryIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'diary';

    diaries.forEach((diary, index) => {
      const item = document.createElement('div');
      item.className = 'diary-item';
      const dateStr = diary.date || new Date().toLocaleDateString('zh-CN');
      const actualIndex = diaries.length - 1 - index;

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        <div class="cphone-item-icon-box diary-icon-style">${diaryIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${diary.title}</div><div class="cphone-item-preview">${dateStr}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        item.innerHTML = `
        <div class="cphone-item-icon-box diary-icon-style">${diaryIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${diary.title}</div><div class="cphone-item-preview">${dateStr}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', () => openMyPhoneDiary(actualIndex));
      }
      listEl.appendChild(item);
    });
    document.getElementById('back-to-myphone-diary-list-btn').onclick = () => switchToMyPhoneScreen('myphone-diary-screen');
  }

  function openMyPhoneDiary(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const diary = char.myPhoneDiaries[index];
    if (!diary) return;
    document.getElementById('myphone-diary-title-header').textContent = diary.title.substring(0, 10) + '...';
    document.getElementById('myphone-diary-detail-title').textContent = diary.title;
    document.getElementById('myphone-diary-detail-date').textContent = diary.date;
    const weatherEl = document.getElementById('myphone-diary-detail-weather');
    if (weatherEl) { weatherEl.textContent = diary.weather ? `天气：${diary.weather}` : ''; weatherEl.style.display = diary.weather ? 'block' : 'none'; }
    const prefaceEl = document.getElementById('myphone-diary-detail-preface');
    if (prefaceEl) { prefaceEl.textContent = diary.preface || ''; prefaceEl.style.display = diary.preface ? 'block' : 'none'; }
    document.getElementById('myphone-diary-detail-content').textContent = diary.content;
    switchToMyPhoneScreen('myphone-diary-detail-screen');
  }

  function renderMyPhoneAmap() {
    const listEl = document.getElementById('myphone-amap-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const locations = char.myPhoneAmapHistory || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'amap';

    if (locations.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的足迹空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    locations.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-amap-item';
      itemEl.style.position = 'relative';
      const locationName = item.locationName || item.name || '未知地点';
      const address = item.address || '';
      const comment = item.comment || item.thought || '';
      const timeAgo = item.timeAgo || item.time || '某个时间';

      let photoHtml = '';
      if (item.image_prompt) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        photoHtml = `<div class="amap-item-photo" style="background-image: url('${imageUrl}')" data-comment="${comment}"></div>`;
      }

      let checkboxHtml = '';
      if (isDeleteMode) {
        checkboxHtml = `<input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;" onchange="toggleMyPhoneItemSelection(${idx})">`;
      }

      itemEl.innerHTML = `${checkboxHtml}
      <div class="amap-item-header"><div class="amap-item-icon">📍</div><div class="amap-item-info"><div class="amap-item-title">${locationName}</div><div class="amap-item-address">${address}</div></div></div>
      <div class="amap-item-body"><div class="amap-item-comment">${comment.replace(/\n/g, '<br>')}</div>${photoHtml}</div>
      <div class="amap-item-footer">${timeAgo}</div>`;

      if (isDeleteMode) {
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      }
      listEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneAppUsage() {
    const listEl = document.getElementById('myphone-usage-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const originalUsage = char.myPhoneAppUsage || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'usage';

    if (originalUsage.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">暂无使用记录，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    let listToRender;
    if (isDeleteMode) {
      listToRender = originalUsage.map((item, idx) => ({ ...item, _originalIndex: idx }))
        .sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);
    } else {
      const merged = new Map();
      originalUsage.forEach(item => {
        const key = `${item.appName}\t${item.category || ''}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { appName: item.appName, category: item.category || '其他', usageTimeMinutes: item.usageTimeMinutes || 0, iconUrl: item.iconUrl || '' });
        } else {
          existing.usageTimeMinutes += item.usageTimeMinutes || 0;
        }
      });
      listToRender = Array.from(merged.values()).sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);
    }

    listToRender.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-usage-item';
      const totalMinutes = item.usageTimeMinutes || 0;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      let timeString = '';
      if (hours > 0) timeString += `${hours}小时`;
      if (minutes > 0) timeString += `${minutes}分钟`;
      if (!timeString) timeString = '小于1分钟';

      let iconHtml = item.iconUrl
        ? `<img src="${item.iconUrl}" class="usage-item-icon">`
        : `<div class="usage-item-icon" style="background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 20px;">📱</div>`;

      if (isDeleteMode) {
        const actualIndex = item._originalIndex;
        itemEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        ${iconHtml}<div class="usage-item-info"><div class="usage-item-name">${item.appName}</div><div class="usage-item-category">${item.category}</div></div><div class="usage-item-time">${timeString}</div>`;
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        itemEl.innerHTML = `${iconHtml}<div class="usage-item-info"><div class="usage-item-name">${item.appName}</div><div class="usage-item-category">${item.category}</div></div><div class="usage-item-time">${timeString}</div>`;
      }
      listEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneMusicScreen() {
    const listEl = document.getElementById('myphone-music-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const playlist = char.myPhoneMusicPlaylist || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'music';

    if (playlist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的歌单空空如也，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    playlist.forEach((track, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-music-item';
      const coverUrl = track.cover || 'https://via.placeholder.com/60x60/cccccc/666666?text=Music';

      if (isDeleteMode) {
        itemEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${index}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${index})">
        <img src="${coverUrl}" class="music-item-cover">
        <div class="music-item-info"><div class="music-item-name">${track.name || track.title || '未知歌曲'}</div><div class="music-item-artist">${track.artist || '未知歌手'}</div></div>`;
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(index);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
        });
      } else {
        itemEl.innerHTML = `
        <img src="${coverUrl}" class="music-item-cover">
        <div class="music-item-info"><div class="music-item-name">${track.name || track.title || '未知歌曲'}</div><div class="music-item-artist">${track.artist || '未知歌手'}</div></div>`;
        itemEl.addEventListener('click', () => playMyPhoneSong(index, playlist));
      }
      listEl.appendChild(itemEl);
    });
  }

  function playMyPhoneSong(songIndex, playlist) {
    const player = document.getElementById('char-audio-player');
    const modal = document.getElementById('char-music-player-modal');
    if (charPlayerState.lrcUpdateInterval) {
      clearInterval(charPlayerState.lrcUpdateInterval);
      charPlayerState.lrcUpdateInterval = null;
    }
    player.pause();
    // 与 cphone.js 共用的 Blob URL 回收逻辑参考并改写自：
    // https://github.com/yxlforever/YYY/commit/ece2d6bec633ced55c89af3871f96c97ebf3aa7e
    if (typeof window.releaseCharMusicObjectUrl === 'function') {
      window.releaseCharMusicObjectUrl(player);
    }

    charPlayerState.currentPlaylist = playlist;
    charPlayerState.currentIndex = songIndex;
    const songObject = playlist[songIndex];
    if (!songObject) { console.error("playMyPhoneSong: 歌曲索引无效或歌单为空。"); return; }

    const songName = songObject.name || songObject.title || '未知歌曲';
    const songArtist = songObject.artist || '未知歌手';
    const songCover = songObject.cover || 'https://via.placeholder.com/300x300/cccccc/666666?text=Music';

    document.getElementById('char-music-player-title').textContent = songName;
    document.getElementById('char-music-artist').textContent = songArtist;
    document.getElementById('char-music-cover').src = songCover;

    charPlayerState.parsedLyrics = parseLRC(songObject.lrcContent || "");
    renderCharLyrics();

    if (songObject.isLocal) {
      const blob = new Blob([songObject.src], { type: songObject.fileType || 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);
      player.src = objectUrl;
      player.dataset.objectUrl = objectUrl;
    } else if (songObject.src || songObject.url) {
      player.src = songObject.src || songObject.url;
    } else {
      showCustomAlert('错误', '该歌曲没有可播放的音源');
      return;
    }

    player.play().catch(e => { console.error("音频播放失败:", e); showCustomAlert('播放失败', '无法播放此音频文件'); });
    player.onloadedmetadata = () => {
      const duration = player.duration;
      if (isFinite(duration)) {
        document.getElementById('char-music-total-time').textContent = formatTime(duration);
        document.getElementById('char-music-progress-bar').max = duration;
      }
    };

    modal.classList.add('visible');
    charPlayerState.isPlaying = true;
    updateCharPlayButton();
    charPlayerState.lrcUpdateInterval = setInterval(() => {
      const currentTime = player.currentTime;
      updateCharLyricHighlight(currentTime);
      document.getElementById('char-music-current-time').textContent = formatTime(currentTime);
      document.getElementById('char-music-progress-bar').value = currentTime;
    }, 100);
  }

  function renderMyPhoneYiqitingSongList() {
    const listEl = document.getElementById('myphone-yiqiting-song-list');
    listEl.innerHTML = '';
    const yiqitingPlaylist = musicState.playlist || [];

    if (yiqitingPlaylist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">一起听播放列表为空<br>请先在主屏幕QQ一起听中添加歌曲</p>';
      return;
    }

    yiqitingPlaylist.forEach((song, index) => {
      const item = document.createElement('div');
      item.className = 'yiqiting-song-item';
      item.style.cssText = 'display: flex; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;';
      item.innerHTML = `
      <input type="checkbox" class="yiqiting-song-checkbox" data-index="${index}" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-weight: 500; color: var(--text-color);">${song.name || '未知歌曲'}</div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${song.artist || '未知歌手'}</div>
      </div>`;
      item.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') { const checkbox = item.querySelector('.yiqiting-song-checkbox'); checkbox.checked = !checkbox.checked; } });
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--hover-bg)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      listEl.appendChild(item);
    });
  }

  function toggleMyPhoneMusicInputs() {
    const source = document.getElementById('myphone-music-source-select')?.value;
    const fileGroup = document.getElementById('myphone-music-file-group');
    const urlGroup = document.getElementById('myphone-music-url-group');
    const yiqitingListGroup = document.getElementById('myphone-yiqiting-list-group');
    const manualInputs = document.getElementById('myphone-music-manual-inputs');

    if (source === 'yiqiting') {
      fileGroup.style.display = 'none';
      yiqitingListGroup.style.display = 'block';
      manualInputs.style.display = 'none';
      renderMyPhoneYiqitingSongList();
    } else if (source === 'local') {
      fileGroup.style.display = 'block';
      urlGroup.style.display = 'none';
      yiqitingListGroup.style.display = 'none';
      manualInputs.style.display = 'block';
    } else {
      fileGroup.style.display = 'none';
      urlGroup.style.display = 'block';
      yiqitingListGroup.style.display = 'none';
      manualInputs.style.display = 'block';
    }
  }

  async function saveMyPhoneMusic() {
    const source = document.getElementById('myphone-music-source-select')?.value;
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneMusicPlaylist) char.myPhoneMusicPlaylist = [];

    if (source === 'yiqiting') {
      const checkboxes = document.querySelectorAll('.yiqiting-song-checkbox:checked');
      if (checkboxes.length === 0) { showCustomAlert('错误', '请至少选择一首歌曲'); return; }
      let importedCount = 0;
      checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const originalSong = musicState.playlist[index];
        if (originalSong) {
          char.myPhoneMusicPlaylist.unshift({
            name: originalSong.name, artist: originalSong.artist, src: originalSong.src,
            fileType: originalSong.fileType, isLocal: originalSong.isLocal,
            lrcContent: originalSong.lrcContent || "",
            cover: originalSong.cover || 'https://via.placeholder.com/300x300/cccccc/666666?text=Music'
          });
          importedCount++;
        }
      });
      await db.chats.put(char);
      renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-yiqiting-select-all').checked = false;
      showCustomAlert('成功', `已导入 ${importedCount} 首歌曲`);
    } else if (source === 'local') {
      const fileInput = document.getElementById('myphone-music-file-input');
      const file = fileInput?.files[0];
      const title = document.getElementById('myphone-music-title-input')?.value?.trim();
      const artist = document.getElementById('myphone-music-artist-input')?.value?.trim();
      if (!file) { showCustomAlert('错误', '请选择音频文件'); return; }
      if (!title) { showCustomAlert('错误', '请填写歌曲标题'); return; }
      let songSrc = null; let isLocal = true;
      try {
        const catboxUrl = await uploadFileToCatbox(file);
        if (catboxUrl) { songSrc = catboxUrl; isLocal = false; await showCustomAlert("上传成功", `歌曲 "${file.name}" 已成功上传到 Catbox！`); }
        else { songSrc = await file.arrayBuffer(); isLocal = true; }
      } catch (uploadError) {
        console.error("Catbox 上传失败:", uploadError);
        await showCustomAlert("上传失败", `上传到 Catbox 失败: ${uploadError.message}\n\n将改为本地保存。`);
        songSrc = await file.arrayBuffer(); isLocal = true;
      }
      char.myPhoneMusicPlaylist.unshift({ name: title, artist: artist || '未知歌手', src: songSrc, fileType: file.type, isLocal: isLocal, lrcContent: "", cover: 'https://via.placeholder.com/300x300/cccccc/666666?text=Music' });
      await db.chats.put(char); renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-music-title-input').value = ''; document.getElementById('myphone-music-artist-input').value = ''; document.getElementById('myphone-music-file-input').value = '';
      showCustomAlert('成功', '歌曲已添加');
    } else {
      const url = document.getElementById('myphone-music-url-input')?.value?.trim();
      const title = document.getElementById('myphone-music-title-input')?.value?.trim();
      const artist = document.getElementById('myphone-music-artist-input')?.value?.trim();
      if (!title || !url) { showCustomAlert('错误', '请填写歌曲标题和链接'); return; }
      char.myPhoneMusicPlaylist.unshift({ name: title, artist: artist || '未知歌手', src: url, isLocal: false, lrcContent: "", cover: 'https://via.placeholder.com/300x300/cccccc/666666?text=Music' });
      await db.chats.put(char); renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-music-title-input').value = ''; document.getElementById('myphone-music-artist-input').value = ''; document.getElementById('myphone-music-url-input').value = '';
      showCustomAlert('成功', '歌曲已添加');
    }
  }

  async function saveMyPhoneAlbum() {
    const description = document.getElementById('myphone-album-description-input')?.value?.trim();
    if (!description) { showCustomAlert('错误', '请输入图片描述'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAlbum) char.myPhoneAlbum = [];
    char.myPhoneAlbum.unshift({ description: description, image_prompt: description, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneAlbum();
    document.getElementById('myphone-add-album-modal')?.classList.remove('visible');
    document.getElementById('myphone-album-description-input').value = '';
    showCustomAlert('成功', '照片已添加');
  }

  async function saveMyPhoneBrowser() {
    const title = document.getElementById('myphone-browser-title-input')?.value?.trim();
    const content = document.getElementById('myphone-browser-content-input')?.value?.trim();
    if (!title || !content) { showCustomAlert('错误', '请填写标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneBrowserHistory) char.myPhoneBrowserHistory = [];
    char.myPhoneBrowserHistory.unshift({ title: title, url: 'www.example.com', content: content, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneBrowserHistory();
    document.getElementById('myphone-add-browser-modal')?.classList.remove('visible');
    document.getElementById('myphone-browser-title-input').value = ''; document.getElementById('myphone-browser-content-input').value = '';
    showCustomAlert('成功', '浏览记录已添加');
  }

  async function saveMyPhoneTaobao() {
    const name = document.getElementById('myphone-taobao-name-input')?.value?.trim();
    const description = document.getElementById('myphone-taobao-description-input')?.value?.trim();
    const thought = document.getElementById('myphone-taobao-thought-input')?.value?.trim();
    const price = document.getElementById('myphone-taobao-price-input')?.value || '99';
    const status = document.getElementById('myphone-taobao-status-input')?.value?.trim() || '已签收';
    const useAI = document.getElementById('myphone-taobao-ai-image-checkbox')?.checked;
    if (!name || !description) { showCustomAlert('错误', '请填写商品名称和描述'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneTaobaoHistory) char.myPhoneTaobaoHistory = [];
    char.myPhoneTaobaoHistory.unshift({ name, price, status, date: new Date().toLocaleDateString('zh-CN'), reason: thought || description, thought: thought || '', image_prompt: useAI ? description : null, useDefaultImage: !useAI });
    await db.chats.put(char); renderMyPhoneTaobao();
    document.getElementById('myphone-add-taobao-modal')?.classList.remove('visible');
    document.getElementById('myphone-taobao-name-input').value = ''; document.getElementById('myphone-taobao-description-input').value = '';
    document.getElementById('myphone-taobao-thought-input').value = ''; document.getElementById('myphone-taobao-price-input').value = '99';
    document.getElementById('myphone-taobao-status-input').value = '已签收'; document.getElementById('myphone-taobao-ai-image-checkbox').checked = false;
    showCustomAlert('成功', '购物记录已添加');
  }

  async function saveMyPhoneDiary() {
    const date = document.getElementById('myphone-diary-date-input')?.value;
    const weather = document.getElementById('myphone-diary-weather-input')?.value?.trim();
    const title = document.getElementById('myphone-diary-title-input')?.value?.trim();
    const preface = document.getElementById('myphone-diary-preface-input')?.value?.trim();
    const content = document.getElementById('myphone-diary-content-input')?.value?.trim();
    if (!date || !title || !content) { showCustomAlert('错误', '请填写日期、标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneDiaries) char.myPhoneDiaries = [];
    const formattedDate = new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    char.myPhoneDiaries.unshift({ date: formattedDate, weather: weather || '晴', title, preface: preface || '', content });
    await db.chats.put(char); renderMyPhoneDiaryList();
    document.getElementById('myphone-add-diary-modal')?.classList.remove('visible');
    document.getElementById('myphone-diary-date-input').value = ''; document.getElementById('myphone-diary-weather-input').value = '';
    document.getElementById('myphone-diary-title-input').value = ''; document.getElementById('myphone-diary-preface-input').value = '';
    document.getElementById('myphone-diary-content-input').value = '';
    showCustomAlert('成功', '日记已添加');
  }

  async function saveMyPhoneMemo() {
    const title = document.getElementById('myphone-memo-title-input')?.value?.trim();
    const content = document.getElementById('myphone-memo-content-input')?.value?.trim();
    if (!title || !content) { showCustomAlert('错误', '请填写标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneMemos) char.myPhoneMemos = [];
    char.myPhoneMemos.unshift({ title, content, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneMemoList();
    document.getElementById('myphone-add-memo-modal')?.classList.remove('visible');
    document.getElementById('myphone-memo-title-input').value = ''; document.getElementById('myphone-memo-content-input').value = '';
    showCustomAlert('成功', '备忘录已添加');
  }

  async function saveMyPhoneAmap() {
    const location = document.getElementById('myphone-amap-location-input')?.value?.trim();
    const address = document.getElementById('myphone-amap-address-input')?.value?.trim();
    const thought = document.getElementById('myphone-amap-thought-input')?.value?.trim();
    const timeInput = document.getElementById('myphone-amap-time-input')?.value?.trim();
    if (!location) { showCustomAlert('错误', '请填写地点'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAmapHistory) char.myPhoneAmapHistory = [];
    char.myPhoneAmapHistory.unshift({ locationName: location, address: address || '', comment: thought || '', timeAgo: timeInput || '刚刚', timestamp: Date.now() });
    await db.chats.put(char); renderMyPhoneAmap();
    document.getElementById('myphone-add-amap-modal')?.classList.remove('visible');
    document.getElementById('myphone-amap-location-input').value = ''; document.getElementById('myphone-amap-address-input').value = '';
    document.getElementById('myphone-amap-thought-input').value = ''; document.getElementById('myphone-amap-time-input').value = '';
    showCustomAlert('成功', '足迹已添加');
  }

  async function saveMyPhoneUsage() {
    const appName = document.getElementById('myphone-usage-app-input')?.value?.trim();
    const category = document.getElementById('myphone-usage-category-input')?.value?.trim();
    const iconUrl = document.getElementById('myphone-usage-icon-input')?.value?.trim();
    const duration = document.getElementById('myphone-usage-duration-input')?.value || '30';
    if (!appName) { showCustomAlert('错误', '请填写应用名称'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAppUsage) char.myPhoneAppUsage = [];
    char.myPhoneAppUsage.unshift({ appName, category: category || '其他', usageTimeMinutes: parseInt(duration), iconUrl: iconUrl || '', timestamp: Date.now() });
    await db.chats.put(char); renderMyPhoneAppUsage();
    document.getElementById('myphone-add-usage-modal')?.classList.remove('visible');
    document.getElementById('myphone-usage-app-input').value = ''; document.getElementById('myphone-usage-category-input').value = '';
    document.getElementById('myphone-usage-icon-input').value = ''; document.getElementById('myphone-usage-duration-input').value = '30';
    showCustomAlert('成功', '使用记录已添加');
  }

  // ========== window 暴露 ==========
  window.renderMyPhoneAlbum = renderMyPhoneAlbum;
  window.renderMyPhoneBrowserHistory = renderMyPhoneBrowserHistory;
  window.renderMyPhoneTaobao = renderMyPhoneTaobao;
  window.renderMyPhoneMemoList = renderMyPhoneMemoList;
  window.renderMyPhoneDiaryList = renderMyPhoneDiaryList;
  window.renderMyPhoneAmap = renderMyPhoneAmap;
  window.renderMyPhoneAppUsage = renderMyPhoneAppUsage;
  window.renderMyPhoneMusicScreen = renderMyPhoneMusicScreen;
  window.playMyPhoneSong = playMyPhoneSong;
  window.renderMyPhoneYiqitingSongList = renderMyPhoneYiqitingSongList;
  window.toggleMyPhoneMusicInputs = toggleMyPhoneMusicInputs;
  window.saveMyPhoneMusic = saveMyPhoneMusic;
  window.saveMyPhoneAlbum = saveMyPhoneAlbum;
  window.saveMyPhoneBrowser = saveMyPhoneBrowser;
  window.saveMyPhoneTaobao = saveMyPhoneTaobao;
  window.saveMyPhoneDiary = saveMyPhoneDiary;
  window.saveMyPhoneMemo = saveMyPhoneMemo;
  window.saveMyPhoneAmap = saveMyPhoneAmap;
  window.saveMyPhoneUsage = saveMyPhoneUsage;
  window.openMyPhoneArticle = openMyPhoneArticle;
  window.renderMyPhoneArticle = renderMyPhoneArticle;
  window.openMyPhoneMemo = openMyPhoneMemo;
  window.openMyPhoneDiary = openMyPhoneDiary;
