  // ========== 从 script.js 迁移：NAI Gallery 核心函数 ==========
  async function openNaiGallery() {
    naiGalleryCache = { local: [], cloud: [] };
    naiGalleryRenderCount = { local: 0, cloud: 0 };
    isLoadingMoreNaiImages = { local: false, cloud: false };
    const allNaiImages = [];
    try {
      const allChats = await db.chats.toArray();
      for (const chat of allChats) {
        if (chat.history && chat.history.length > 0) {
          chat.history.forEach(msg => {
            if ((msg.type === 'naiimag' || msg.type === 'googleimag' || msg.type === 'openaiimag') && msg.imageUrl) {
              allNaiImages.push({ sourceType: 'chat', imageUrl: msg.imageUrl, prompt: msg.prompt || msg.fullPrompt || 'NAI Image', chatId: chat.id, msgTimestamp: msg.timestamp });
            }
          });
        }
      }
    } catch (e) { console.error("扫描聊天记录失败:", e); }
    try {
      const allPosts = await db.qzonePosts.toArray();
      allPosts.forEach(post => {
        if (post.type === 'naiimag' || post.type === 'googleimag' || post.type === 'openaiimag') {
          const urls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
          const prompts = Array.isArray(post.prompt) ? post.prompt : [post.prompt || 'NAI Image'];
          urls.forEach((url, index) => {
            allNaiImages.push({ sourceType: 'qzone', imageUrl: url, prompt: prompts[index] || prompts[0], postId: post.id, imageIndex: index });
          });
        }
      });
    } catch (e) { console.error("扫描动态失败:", e); }
    allNaiImages.sort((a, b) => (b.msgTimestamp || b.postId || 0) - (a.msgTimestamp || a.postId || 0));
    allNaiImages.forEach(img => {
      if (img.imageUrl.startsWith('data:image')) naiGalleryCache.local.push(img);
      else naiGalleryCache.cloud.push(img);
    });
    document.getElementById('nai-gallery-grid-local').innerHTML = '';
    document.getElementById('nai-gallery-grid-cloud').innerHTML = '';
    switchNaiGalleryTab('local');
    document.getElementById('nai-gallery-panel').classList.add('visible');
  }

  function switchNaiGalleryTab(tabId) {
    if (isNaiGalleryManagementMode) toggleNaiGalleryManagementMode();
    activeNaiGalleryTab = tabId;
    document.querySelectorAll('.nai-gallery-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tabId === tabId));
    document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.toggle('active', page.id === `nai-gallery-grid-${tabId}`));
    const cache = naiGalleryCache[tabId];
    const renderCount = naiGalleryRenderCount[tabId];
    const gridEl = document.getElementById(`nai-gallery-grid-${tabId}`);
    if (renderCount === 0) {
      gridEl.innerHTML = '';
      if (cache.length === 0) {
        const message = (tabId === 'local') ? '本地画廊是空的，快去生成一些图片吧！' : '图床画廊是空的，请从"本地"上传图片。';
        gridEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">${message}</p>`;
      } else {
        loadMoreNaiGalleryImages();
      }
    }
    updateNaiGalleryActionButtons();
  }

  function renderNaiGalleryGrid(images, gridEl) {
    if (images.length === 0 && naiGalleryRenderCount[activeNaiGalleryTab] === 0) {
      const message = (activeNaiGalleryTab === 'local') ? '本地画廊是空的，快去生成一些图片吧！' : '图床画廊是空的。';
      gridEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">${message}</p>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'nai-gallery-item';
      item.title = img.prompt;
      const itemKey = `${img.sourceType}_${img.chatId || img.postId}_${img.msgTimestamp || img.imageIndex}`;
      item.dataset.key = itemKey;
      item.dataset.imageUrl = img.imageUrl;
      item.dataset.prompt = img.prompt;
      const imageContainer = document.createElement('div');
      imageContainer.className = 'nai-image-container';
      imageContainer.style.backgroundImage = `url("${String(img.imageUrl).replace(/["\\\n\r]/g, '\\$&')}")`;

      const controls = document.createElement('div');
      controls.className = 'nai-gallery-controls';
      controls.innerHTML = `
          <button class="nai-gallery-download-btn" title="下载"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></button>
          <button class="nai-gallery-delete-btn" title="删除"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg></button>`;
      imageContainer.appendChild(controls);

      const name = document.createElement('span');
      name.className = 'nai-gallery-name';
      name.textContent = img.prompt;
      item.append(imageContainer, name);
      fragment.appendChild(item);
    });
    gridEl.appendChild(fragment);
  }

  async function loadMoreNaiGalleryImages() {
    const activeTab = activeNaiGalleryTab;
    if (isLoadingMoreNaiImages[activeTab] || naiGalleryRenderCount[activeTab] >= naiGalleryCache[activeTab].length) return;
    isLoadingMoreNaiImages[activeTab] = true;
    const gridEl = document.getElementById(`nai-gallery-grid-${activeTab}`);
    if (typeof showLoader === 'function') showLoader(gridEl, 'bottom');
    setTimeout(() => {
      if (activeNaiGalleryTab !== activeTab) { isLoadingMoreNaiImages[activeTab] = false; if (typeof hideLoader === 'function') hideLoader(gridEl); return; }
      const imagesToAppend = naiGalleryCache[activeTab].slice(naiGalleryRenderCount[activeTab], naiGalleryRenderCount[activeTab] + NAI_GALLERY_RENDER_WINDOW);
      if (typeof hideLoader === 'function') hideLoader(gridEl);
      if (imagesToAppend.length > 0) { renderNaiGalleryGrid(imagesToAppend, gridEl); naiGalleryRenderCount[activeTab] += imagesToAppend.length; }
      isLoadingMoreNaiImages[activeTab] = false;
    }, 500);
  }

  function toggleNaiGalleryManagementMode() {
    isNaiGalleryManagementMode = !isNaiGalleryManagementMode;
    const grid = document.getElementById(`nai-gallery-grid-${activeNaiGalleryTab}`);
    const manageBtn = document.getElementById('manage-nai-gallery-btn');
    const actionBar = document.getElementById('nai-gallery-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-nai-gallery-checkbox');
    grid.classList.toggle('management-mode', isNaiGalleryManagementMode);
    if (isNaiGalleryManagementMode) {
      manageBtn.textContent = '完成'; actionBar.style.display = 'flex'; selectedNaiImages.clear();
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateNaiGalleryActionButtons();
      document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.add('management-mode'));
    } else {
      manageBtn.textContent = '管理'; actionBar.style.display = 'none';
      document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.remove('management-mode'));
      grid.querySelectorAll('.nai-gallery-item.selected').forEach(item => item.classList.remove('selected'));
    }
  }

  function updateNaiGalleryActionButtons() {
    const deleteBtn = document.getElementById('delete-selected-nai-gallery-btn');
    const downloadBtn = document.getElementById('download-selected-nai-gallery-btn');
    const uploadBtn = document.getElementById('upload-selected-nai-gallery-btn');
    const exportBtn = document.getElementById('export-selected-nai-gallery-btn');
    const count = selectedNaiImages.size;
    if (deleteBtn) deleteBtn.textContent = `删除 (${count})`;
    if (downloadBtn) downloadBtn.textContent = `下载 (${count})`;
    if (exportBtn) { exportBtn.textContent = `导出 (${count})`; exportBtn.style.display = (activeNaiGalleryTab === 'cloud') ? 'block' : 'none'; }
    if (uploadBtn) { uploadBtn.textContent = `上传 (${count})`; const shouldShowUpload = (activeNaiGalleryTab === 'local' && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey); uploadBtn.style.display = shouldShowUpload ? 'block' : 'none'; }
  }

  function handleNaiGalleryGridClick(e) {
    const item = e.target.closest('.nai-gallery-item');
    if (!item) return;
    const key = item.dataset.key;
    const imageUrl = item.dataset.imageUrl;
    const prompt = item.dataset.prompt;
    if (e.target.closest('.nai-gallery-download-btn')) { e.stopPropagation(); if (typeof downloadNaiImage === 'function') downloadNaiImage(imageUrl, prompt); return; }
    if (e.target.closest('.nai-gallery-delete-btn')) { e.stopPropagation(); if (typeof executeBatchDeleteNaiImages === 'function') executeBatchDeleteNaiImages(new Set([key])); return; }
    if (isNaiGalleryManagementMode) {
      item.classList.toggle('selected');
      if (selectedNaiImages.has(key)) selectedNaiImages.delete(key); else selectedNaiImages.add(key);
      updateNaiGalleryActionButtons();
    } else {
      showCustomAlert("图片详情", `<div style="text-align: center;"><img src="${imageUrl}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"></div>`);
    }
  }

  window.openNaiGallery = openNaiGallery;
  window.switchNaiGalleryTab = switchNaiGalleryTab;
  window.toggleNaiGalleryManagementMode = toggleNaiGalleryManagementMode;
  window.updateNaiGalleryActionButtons = updateNaiGalleryActionButtons;
  window.handleNaiGalleryGridClick = handleNaiGalleryGridClick;
  window.loadMoreNaiGalleryImages = loadMoreNaiGalleryImages;
  window.renderNaiGalleryGrid = renderNaiGalleryGrid;

