  // ========== 从 script.js 迁移：快捷回复相关函数 ==========
  // activeQuickReplyCategoryId 已在 utils.js 中声明为全局变量，此处不再重复声明
  let isQuickReplyManagementMode = false;
  let selectedQuickReplies = new Set();

  function openQuickReplyModal() {
    const tabsContainer = document.getElementById('quick-reply-tabs');
    if (tabsContainer) tabsContainer.dataset.needsRefresh = 'true';
    renderQuickReplyList(true);
    document.getElementById('quick-reply-modal').classList.add('visible');
  }

  async function renderQuickReplyList(rerenderTabs = true) {
    const listEl = document.getElementById('quick-reply-list');
    const tabsContainer = document.getElementById('quick-reply-tabs');
    listEl.innerHTML = '';
    if (rerenderTabs) {
      const categories = await db.quickReplyCategories.toArray();
      if (tabsContainer.children.length === 0 || tabsContainer.dataset.needsRefresh === 'true') {
        tabsContainer.innerHTML = '';
        tabsContainer.dataset.needsRefresh = 'false';
        const createTab = (id, name) => {
          const btn = document.createElement('button');
          btn.className = 'sticker-category-tab';
          if (activeQuickReplyCategoryId === id) btn.classList.add('active');
          btn.textContent = name;
          btn.dataset.categoryId = id;
          btn.onclick = () => switchQuickReplyCategory(id);
          return btn;
        };
        tabsContainer.appendChild(createTab('all', '全部'));
        categories.forEach(cat => tabsContainer.appendChild(createTab(cat.id, cat.name)));
        tabsContainer.appendChild(createTab('uncategorized', '未分类'));
      } else {
        const tabs = tabsContainer.querySelectorAll('.sticker-category-tab');
        tabs.forEach(tab => {
          if (String(tab.dataset.categoryId) === String(activeQuickReplyCategoryId)) {
            tab.classList.add('active');
            tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } else {
            tab.classList.remove('active');
          }
        });
      }
    }
    let repliesToShow;
    if (activeQuickReplyCategoryId === 'all') {
      repliesToShow = state.quickReplies;
    } else if (activeQuickReplyCategoryId === 'uncategorized') {
      repliesToShow = state.quickReplies.filter(r => !r.categoryId);
    } else {
      repliesToShow = state.quickReplies.filter(r => r.categoryId == activeQuickReplyCategoryId);
    }
    if (!repliesToShow || repliesToShow.length === 0) {
      const tipText = activeQuickReplyCategoryId === 'all'
        ? '你还没有添加任何快捷回复。<br>点击右上角"+"号添加第一条吧！'
        : '这个分类下还没有回复哦~';
      listEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">${tipText}</p>`;
      return;
    }
    repliesToShow.forEach(reply => {
      const item = document.createElement('div');
      item.className = 'quick-reply-item';
      const isSelected = selectedQuickReplies.has(reply.id);
      if (isSelected) item.classList.add('selected');
      item.innerHTML = `
            <input type="checkbox" class="quick-reply-checkbox" ${isSelected ? 'checked' : ''}>
            <span class="quick-reply-text" data-text="${escapeHTML(reply.text)}">${escapeHTML(reply.text)}</span>
            <div class="quick-reply-actions">
                <button class="quick-reply-edit-btn" data-id="${reply.id}" title="编辑">✏️</button>
                <button class="quick-reply-delete-btn" data-id="${reply.id}" title="删除">🗑️</button>
            </div>`;
      item.addEventListener('click', (e) => {
        if (isQuickReplyManagementMode) {
          if (!e.target.closest('.quick-reply-actions')) {
            toggleQuickReplySelection(reply.id);
            const cb = item.querySelector('.quick-reply-checkbox');
            if (cb) cb.checked = !cb.checked;
          }
        } else {
          const textEl = e.target.closest('.quick-reply-text');
          const editBtn = e.target.closest('.quick-reply-edit-btn');
          const deleteBtn = e.target.closest('.quick-reply-delete-btn');
          if (textEl) selectQuickReply(textEl.dataset.text);
          else if (editBtn) editQuickReply(reply.id);
          else if (deleteBtn) deleteQuickReply(reply.id);
        }
      });
      listEl.appendChild(item);
    });
  }

  function switchQuickReplyCategory(categoryId) {
    activeQuickReplyCategoryId = categoryId;
    renderQuickReplyList(true);
  }

  function selectQuickReply(text) {
    const chatInput = document.getElementById('chat-input');
    chatInput.value = text;
    document.getElementById('quick-reply-modal').classList.remove('visible');
    chatInput.focus();
  }

  function toggleQuickReplyManagementMode() {
    isQuickReplyManagementMode = !isQuickReplyManagementMode;
    const listEl = document.getElementById('quick-reply-list');
    const actionBar = document.getElementById('quick-reply-action-bar');
    const normalFooter = document.getElementById('quick-reply-normal-footer');
    const batchBtn = document.getElementById('batch-quick-reply-btn');
    if (isQuickReplyManagementMode) {
      listEl.classList.add('management-mode');
      actionBar.style.display = 'flex';
      normalFooter.style.display = 'none';
      batchBtn.textContent = "完成";
      batchBtn.style.color = "var(--accent-color)";
    } else {
      listEl.classList.remove('management-mode');
      actionBar.style.display = 'none';
      normalFooter.style.display = 'flex';
      batchBtn.textContent = "批量";
      batchBtn.style.color = "";
      selectedQuickReplies.clear();
      updateQuickReplyActionBar();
      renderQuickReplyList(false);
    }
  }

  function toggleQuickReplySelection(id) {
    if (selectedQuickReplies.has(id)) selectedQuickReplies.delete(id);
    else selectedQuickReplies.add(id);
    updateQuickReplyActionBar();
    renderQuickReplyList(false);
  }

  function updateQuickReplyActionBar() {
    const count = selectedQuickReplies.size;
    document.getElementById('move-selected-quick-replies-btn').textContent = `移动 (${count})`;
    document.getElementById('delete-selected-quick-replies-btn').textContent = `删除 (${count})`;
  }

  function handleSelectAllQuickReplies() {
    const isChecked = document.getElementById('select-all-quick-replies-checkbox').checked;
    let currentViewReplies;
    if (activeQuickReplyCategoryId === 'all') currentViewReplies = state.quickReplies;
    else if (activeQuickReplyCategoryId === 'uncategorized') currentViewReplies = state.quickReplies.filter(r => !r.categoryId);
    else currentViewReplies = state.quickReplies.filter(r => r.categoryId == activeQuickReplyCategoryId);
    if (isChecked) currentViewReplies.forEach(r => selectedQuickReplies.add(r.id));
    else selectedQuickReplies.clear();
    updateQuickReplyActionBar();
    renderQuickReplyList(false);
  }

  async function executeBatchMoveQuickReplies() {
    if (selectedQuickReplies.size === 0) return alert("请先选择回复。");
    const categories = await db.quickReplyCategories.toArray();
    const options = [{ text: '未分类', value: 'uncategorized' }, ...categories.map(c => ({ text: c.name, value: c.id }))];
    const targetCategoryId = await showChoiceModal("移动到分类", options);
    if (!targetCategoryId) return;
    const finalCategoryId = targetCategoryId === 'uncategorized' ? null : parseInt(targetCategoryId);
    await db.transaction('rw', db.quickReplies, async () => {
      for (const id of selectedQuickReplies) {
        await db.quickReplies.update(id, { categoryId: finalCategoryId });
        const r = state.quickReplies.find(item => item.id === id);
        if (r) r.categoryId = finalCategoryId;
      }
    });
    await showCustomAlert("成功", `已移动 ${selectedQuickReplies.size} 条回复。`);
    toggleQuickReplyManagementMode();
    renderQuickReplyList(false);
  }

  async function executeBatchDeleteQuickReplies() {
    if (selectedQuickReplies.size === 0) return alert("请先选择回复。");
    const confirmed = await showCustomConfirm("确认删除", `确定要删除选中的 ${selectedQuickReplies.size} 条回复吗？`);
    if (!confirmed) return;
    const ids = Array.from(selectedQuickReplies);
    await db.quickReplies.bulkDelete(ids);
    state.quickReplies = state.quickReplies.filter(r => !selectedQuickReplies.has(r.id));
    await showCustomAlert("成功", "已删除选中回复。");
    toggleQuickReplyManagementMode();
    renderQuickReplyList(false);
  }

  async function addNewQuickReply() {
    const text = await showCustomPrompt("添加快捷回复", "请输入要添加的回复内容：", "", "textarea");
    if (text && text.trim()) {
      let targetCategory = null;
      if (activeQuickReplyCategoryId !== 'all' && activeQuickReplyCategoryId !== 'uncategorized') targetCategory = activeQuickReplyCategoryId;
      const newReply = { text: text.trim(), categoryId: targetCategory };
      const newId = await db.quickReplies.add(newReply);
      state.quickReplies.push({ id: newId, ...newReply });
      renderQuickReplyList(false);
    } else if (text !== null) {
      alert("内容不能为空！");
    }
  }

  async function openQuickReplyCategoryManager() {
    await renderQuickReplyCategoriesInManager();
    document.getElementById('quick-reply-category-manager-modal').classList.add('visible');
  }

  async function renderQuickReplyCategoriesInManager() {
    const listEl = document.getElementById('existing-quick-reply-categories-list');
    const categories = await db.quickReplyCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
      return;
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `<span class="group-name">${cat.name}</span><span class="delete-group-btn" data-id="${cat.id}">×</span>`;
      item.querySelector('.delete-group-btn').onclick = () => deleteQuickReplyCategory(cat.id);
      listEl.appendChild(item);
    });
  }

  async function addNewQuickReplyCategory() {
    const input = document.getElementById('new-quick-reply-category-name-input');
    const name = input.value.trim();
    if (!name) { alert('分类名不能为空！'); return; }
    const existing = await db.quickReplyCategories.where('name').equals(name).first();
    if (existing) { alert(`分类 "${name}" 已经存在了！`); return; }
    await db.quickReplyCategories.add({ name });
    input.value = '';
    await renderQuickReplyCategoriesInManager();
    document.getElementById('quick-reply-tabs').dataset.needsRefresh = 'true';
  }

  async function deleteQuickReplyCategory(categoryId) {
    const category = await db.quickReplyCategories.get(categoryId);
    if (!category) return;
    const confirmed = await showCustomConfirm('确认删除分类', `删除分类《${category.name}》后，该分类下的回复将变为"未分类"。确定吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      await db.quickReplyCategories.delete(categoryId);
      const repliesToUpdate = state.quickReplies.filter(r => r.categoryId == categoryId);
      for (const reply of repliesToUpdate) { reply.categoryId = null; await db.quickReplies.put(reply); }
      await renderQuickReplyCategoriesInManager();
      if (activeQuickReplyCategoryId == categoryId) activeQuickReplyCategoryId = 'all';
      document.getElementById('quick-reply-tabs').dataset.needsRefresh = 'true';
      await renderQuickReplyList(true);
    }
  }

  window.openQuickReplyModal = openQuickReplyModal;
  window.renderQuickReplyList = renderQuickReplyList;
  window.toggleQuickReplyManagementMode = toggleQuickReplyManagementMode;
  window.handleSelectAllQuickReplies = handleSelectAllQuickReplies;
  window.executeBatchMoveQuickReplies = executeBatchMoveQuickReplies;
  window.executeBatchDeleteQuickReplies = executeBatchDeleteQuickReplies;
  window.addNewQuickReply = addNewQuickReply;
  window.openQuickReplyCategoryManager = openQuickReplyCategoryManager;
  window.addNewQuickReplyCategory = addNewQuickReplyCategory;

