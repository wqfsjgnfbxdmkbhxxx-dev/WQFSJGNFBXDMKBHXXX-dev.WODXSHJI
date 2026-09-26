// ========== 世界书渲染与编辑（从 script.js 补充拆分） ==========

  function switchWorldBookCategory(categoryId) {

    document.querySelectorAll('.world-book-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.categoryId === categoryId);
    });

    document.querySelectorAll('.world-book-category-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.categoryId === categoryId);
    });
  }


  // 世界书顶栏“更多”菜单初始化
  function initWorldBookHeaderMenu() {
    const moreBtn = document.getElementById('world-book-more-btn');
    const menu = document.getElementById('world-book-dropdown-menu');
    if (!moreBtn || !menu) return;

    if (moreBtn.dataset.menuBound === 'true') return;
    moreBtn.dataset.menuBound = 'true';

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = menu.classList.contains('show');
      // 关闭其他可能存在的菜单
      document.querySelectorAll('.myphone-dropdown-menu.show, .worldbook-dropdown-menu.show').forEach(m => {
        m.classList.remove('show');
      });
      if (!isVisible) {
        menu.classList.add('show');
      }
    });

    // 点击菜单项内部按钮时自动关闭菜单
    menu.querySelectorAll('.worldbook-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        menu.classList.remove('show');
      });
    });

    // 点击页面任意外部空白处关闭
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !moreBtn.contains(e.target)) {
        menu.classList.remove('show');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorldBookHeaderMenu);
  } else {
    initWorldBookHeaderMenu();
  }

  async function renderWorldBookScreen() {
    initWorldBookHeaderMenu();
    const tabsContainer = document.getElementById('world-book-tabs');
    const contentContainer = document.getElementById('world-book-content-container');

    const [books, categories] = await Promise.all([
      db.worldBooks.toArray(),
      db.worldBookCategories.orderBy('name').toArray()
    ]);

    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    state.worldBooks = books;

    if (books.length === 0) {
      contentContainer.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一本世界书</p>';
      return;
    }


    const allTab = document.createElement('button');
    allTab.className = 'world-book-tab active';
    allTab.textContent = '全部';
    allTab.dataset.categoryId = 'all';
    tabsContainer.appendChild(allTab);

    const allPane = document.createElement('div');
    allPane.className = 'world-book-category-pane active';
    allPane.dataset.categoryId = 'all';
    contentContainer.appendChild(allPane);


    categories.forEach(category => {
      const categoryTab = document.createElement('button');
      categoryTab.className = 'world-book-tab';
      categoryTab.textContent = category.name;
      categoryTab.dataset.categoryId = String(category.id);
      tabsContainer.appendChild(categoryTab);

      const categoryPane = document.createElement('div');
      categoryPane.className = 'world-book-category-pane';
      categoryPane.dataset.categoryId = String(category.id);
      contentContainer.appendChild(categoryPane);
    });


    const hasUncategorized = books.some(book => !book.categoryId);
    if (hasUncategorized) {
      const uncategorizedTab = document.createElement('button');
      uncategorizedTab.className = 'world-book-tab';
      uncategorizedTab.textContent = '未分类';
      uncategorizedTab.dataset.categoryId = 'uncategorized';
      tabsContainer.appendChild(uncategorizedTab);

      const uncategorizedPane = document.createElement('div');
      uncategorizedPane.className = 'world-book-category-pane';
      uncategorizedPane.dataset.categoryId = 'uncategorized';
      contentContainer.appendChild(uncategorizedPane);
    }


    books.forEach(book => {
      let contentPreview = '暂无内容...';
      if (Array.isArray(book.content) && book.content.length > 0) {
        const firstEntry = book.content[0];
        contentPreview = firstEntry.comment || firstEntry.content || '';
      } else if (typeof book.content === 'string' && book.content.trim() !== '') {
        contentPreview = book.content;
      }

      const card = document.createElement('div');
      card.className = 'world-book-card';
      card.innerHTML = `
                    <div class="card-title">${book.name}</div>
                    <div class="card-content-preview">${contentPreview}</div>
                `;


      const cardClickHandler = () => openWorldBookEditor(book.id);
      const cardLongPressHandler = async () => {
        const confirmed = await showCustomConfirm('删除世界书', `确定要删除《${book.name}》吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.worldBooks.delete(book.id);
          state.worldBooks = state.worldBooks.filter(wb => wb.id !== book.id);
          renderWorldBookScreen();
        }
      };

      card.addEventListener('click', cardClickHandler);
      addLongPressListener(card, cardLongPressHandler);


      const clonedCardForAll = card.cloneNode(true);
      clonedCardForAll.addEventListener('click', cardClickHandler);
      addLongPressListener(clonedCardForAll, cardLongPressHandler);
      allPane.appendChild(clonedCardForAll);


      const categoryKey = book.categoryId ? String(book.categoryId) : 'uncategorized';
      const targetPane = contentContainer.querySelector(`.world-book-category-pane[data-category-id="${categoryKey}"]`);
      if (targetPane) {
        targetPane.appendChild(card);
      }
    });


    document.querySelectorAll('.world-book-tab').forEach(tab => {
      tab.addEventListener('click', () => switchWorldBookCategory(tab.dataset.categoryId));
    });
  }



  function createWorldBookGroup(groupName, books) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'world-book-group-container';

    groupContainer.innerHTML = `
                <div class="world-book-group-header">
                    <span class="arrow">▼</span>
                    <span class="group-name">${groupName}</span>
                </div>
                <div class="world-book-group-content"></div>
            `;

    const contentEl = groupContainer.querySelector('.world-book-group-content');
    books.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    books.forEach(book => {

      let contentPreview = '暂无内容...';


      if (Array.isArray(book.content) && book.content.length > 0) {


        const firstEntry = book.content[0];
        contentPreview = firstEntry.comment || firstEntry.content || '';
      } else if (typeof book.content === 'string' && book.content.trim() !== '') {

        contentPreview = book.content;
      }


      const item = document.createElement('div');
      item.className = 'list-item';
      item.dataset.bookId = book.id;

      item.innerHTML = `
                    <div class="item-title">${book.name}</div>
                    <div class="item-content">${String(contentPreview).substring(0, 50)}</div>
                `;
      item.addEventListener('click', () => openWorldBookEditor(book.id));
      addLongPressListener(item, async () => {
        const confirmed = await showCustomConfirm('删除世界书', `确定要删除《${book.name}》吗？此操作不可撤销。`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.worldBooks.delete(book.id);
          state.worldBooks = state.worldBooks.filter(wb => wb.id !== book.id);
          renderWorldBookScreen();
        }
      });
      contentEl.appendChild(item);
    });

    return groupContainer;
  }


  async function openWorldBookEditor(bookId) {


    showScreen('world-book-editor-screen');

    window.editingWorldBookId = bookId;
    const [book, categories] = await Promise.all([
      db.worldBooks.get(bookId),
      db.worldBookCategories.toArray()
    ]);


    if (!book) {
      console.error("尝试打开一个不存在的世界书，ID:", bookId);
      showScreen('world-book-screen');
      return;
    }


    document.getElementById('world-book-editor-title').textContent = book.name;
    document.getElementById('world-book-name-input').value = book.name;


    const selectEl = document.getElementById('world-book-category-select');
    selectEl.innerHTML = '<option value="">-- 未分类 --</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      if (book.categoryId === cat.id) option.selected = true;
      selectEl.appendChild(option);
    });

    // 设置全局开关状态（默认为关闭）
    const globalSwitch = document.getElementById('world-book-global-switch');
    if (globalSwitch) {
      globalSwitch.checked = book.isGlobal === true;
    }

    // 设置注入位置的值（默认为'before'）
    const injectPositionSelect = document.getElementById('world-book-inject-position-select');
    if (injectPositionSelect) {
      injectPositionSelect.value = book.injectPosition || 'before';
    }


    const entriesContainer = document.getElementById('world-book-entries-container');
    entriesContainer.innerHTML = '';

    if (Array.isArray(book.content) && book.content.length > 0) {
      book.content.forEach(entry => {
        const block = createWorldBookEntryBlock(entry);
        entriesContainer.appendChild(block);
      });
    } else {
      entriesContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">还没有内容，点击下方按钮添加第一条吧！</p>';
    }


  }


  function createWorldBookEntryBlock(entry = {
    keys: [],
    comment: '',
    content: '',
    enabled: true
  }) {
    const block = document.createElement('div');
    block.className = 'message-editor-block';

    const isChecked = entry.enabled !== false ? 'checked' : '';

    block.innerHTML = `
                <div class="entry-header-actions" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px;">
                    <div class="entry-badge-title" style="font-size: 13px; font-weight: 600; color: var(--text-secondary); letter-spacing: -0.1px;">
                        词条配置
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label class="ios-toggle-container" style="transform: scale(0.85);" title="启用/禁用此条目">
                            <input type="checkbox" class="entry-enabled-switch" ${isChecked}>
                            <span class="ios-toggle-track"></span>
                        </label>
                        <button class="delete-block-btn" title="删除此条目">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="form-subgroup">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">备注 (可选)</label>
                    <input type="text" class="entry-comment-input" value="${entry.comment || ''}" placeholder="例如：关于角色的童年">
                </div>
                <div class="form-subgroup">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">关键词 (用英文逗号,分隔)</label>
                    <input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}" placeholder="例如: key1, key2, key3">
                </div>
                <div class="form-subgroup">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">内容</label>
                    <textarea class="entry-content-textarea" rows="4" placeholder="填写触发词注入内容...">${entry.content || ''}</textarea>
                </div>
            `;

    block.querySelector('.delete-block-btn').addEventListener('click', () => {
      block.remove();
    });

    return block;
  }
