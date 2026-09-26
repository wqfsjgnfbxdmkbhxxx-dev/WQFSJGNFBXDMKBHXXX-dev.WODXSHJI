// ========== 预设管理功能（从 script.js 补充拆分，原第 47706~48160 行） ==========

  let editingPresetId = null;

  async function openPresetScreen() {
    await renderPresetScreen();
    showScreen('preset-screen');
  }

  async function renderPresetScreen() {
    const tabsContainer = document.getElementById('preset-tabs');
    const contentContainer = document.getElementById('preset-content-container');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const [presets, categories] = await Promise.all([
      db.presets.toArray(),
      db.presetCategories.orderBy('name').toArray()
    ]);

    state.presets = presets;

    if (presets.length === 0) {
      contentContainer.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一个预设</p>';
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

    const hasUncategorized = presets.some(p => !p.categoryId);
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

    presets.forEach(preset => {
      const contentPreview = `该预设包含 ${preset.content.length} 个条目。`;

      const card = document.createElement('div');
      card.className = 'world-book-card';
      card.innerHTML = `
            <div class="card-title">${preset.name}</div>
            <div class="card-content-preview">${contentPreview}</div>
        `;

      const cardClickHandler = () => openPresetEditor(preset.id);
      const cardLongPressHandler = async () => {
        const confirmed = await showCustomConfirm('删除预设', `确定要删除《${preset.name}》吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.presets.delete(preset.id);
          state.presets = await db.presets.toArray();
          renderPresetScreen();
        }
      };

      card.addEventListener('click', cardClickHandler);
      addLongPressListener(card, cardLongPressHandler);

      const clonedCardForAll = card.cloneNode(true);
      clonedCardForAll.addEventListener('click', cardClickHandler);
      addLongPressListener(clonedCardForAll, cardLongPressHandler);
      allPane.appendChild(clonedCardForAll);

      const categoryKey = preset.categoryId ? String(preset.categoryId) : 'uncategorized';
      const targetPane = contentContainer.querySelector(`.world-book-category-pane[data-category-id="${categoryKey}"]`);
      if (targetPane) {
        targetPane.appendChild(card);
      }
    });

    document.querySelectorAll('#preset-tabs .world-book-tab').forEach(tab => {
      tab.addEventListener('click', () => switchPresetCategory(tab.dataset.categoryId));
    });
  }

  function switchPresetCategory(categoryId) {
    document.querySelectorAll('#preset-tabs .world-book-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.categoryId === categoryId);
    });
    document.querySelectorAll('#preset-content-container .world-book-category-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.categoryId === categoryId);
    });
  }

  async function openPresetEditor(presetId) {
    showScreen('preset-editor-screen');
    editingPresetId = presetId;

    try {
      const [preset, categories] = await Promise.all([
        db.presets.get(presetId),
        db.presetCategories.toArray()
      ]);

      if (!preset) {
        console.error("错误：尝试打开一个不存在的预设，ID:", presetId);
        await showCustomAlert("加载失败", "找不到这个预设的详细信息。");
        showScreen('preset-screen');
        return;
      }

      setTimeout(() => {
        document.getElementById('preset-editor-title').textContent = preset.name;
        document.getElementById('preset-name-input').value = preset.name;

        const selectEl = document.getElementById('preset-category-select');
        selectEl.innerHTML = '<option value="">-- 未分类 --</option>';
        categories.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.id;
          option.textContent = cat.name;
          if (preset.categoryId === cat.id) option.selected = true;
          selectEl.appendChild(option);
        });

        const entriesContainer = document.getElementById('preset-entries-container');
        entriesContainer.innerHTML = '';
        if (Array.isArray(preset.content) && preset.content.length > 0) {
          preset.content.forEach(entry => {
            const block = createPresetEntryBlock(entry);
            entriesContainer.appendChild(block);
          });
        } else {
          entriesContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">还没有内容，点击下方按钮添加第一条吧！</p>';
        }
      }, 50);

    } catch (error) {
      console.error("打开预设编辑器时发生严重错误:", error);
      await showCustomAlert("加载失败", `加载预设详情时发生错误: ${error.message}`);
      showScreen('preset-screen');
    }
  }

  function createPresetEntryBlock(entry = {
    keys: [],
    comment: '',
    content: '',
    enabled: true
  }) {
    const block = document.createElement('div');
    block.className = 'message-editor-block';
    const isChecked = entry.enabled !== false ? 'checked' : '';

    block.innerHTML = `
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 5px;">
            <label class="toggle-switch" title="启用/禁用此条目">
                <input type="checkbox" class="entry-enabled-switch" ${isChecked}>
                <span class="slider"></span>
            </label>
            <button type="button" class="delete-block-btn" title="删除此条目">×</button>
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 0.8em;">备注 (可选)</label>
            <input type="text" class="entry-comment-input" value="${entry.comment || ''}" placeholder="例如：角色核心设定" style="padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 0.8em;">关键词 (用英文逗号,分隔)</label>
            <input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}" placeholder="例如: key1, key2" style="padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8em; display: flex; justify-content: space-between; align-items: center;">
                <span>内容 (点击右侧展开)</span>
                <button type="button" class="toggle-content-btn">展开</button>
            </label>
            <div class="entry-content-container">
                 <textarea class="entry-content-textarea" rows="8" style="width: 100%; font-size: 14px;">${entry.content || ''}</textarea>
            </div>
        </div>
    `;

    block.querySelector('.delete-block-btn').addEventListener('click', () => block.remove());

    const toggleBtn = block.querySelector('.toggle-content-btn');
    const contentContainer = block.querySelector('.entry-content-container');
    toggleBtn.addEventListener('click', () => {
      const isHidden = contentContainer.style.display === 'none';
      contentContainer.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '收起' : '展开';
    });

    return block;
  }

  async function openPresetCategoryManager() {
    await renderPresetCategoriesInManager();

    document.querySelector('#group-management-modal .modal-header span').textContent = '管理预设分类';
    document.getElementById('add-new-group-btn').onclick = addNewPresetCategory;
    document.getElementById('existing-groups-list').onclick = (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        deletePresetCategory(parseInt(e.target.dataset.id));
      }
    };
    document.getElementById('close-group-manager-btn').onclick = () => {
      document.getElementById('group-management-modal').classList.remove('visible');
      renderPresetScreen();
    };
    document.getElementById('group-management-modal').classList.add('visible');
  }

  async function renderPresetCategoriesInManager() {
    const listEl = document.getElementById('existing-groups-list');
    const categories = await db.presetCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `<span class="group-name">${cat.name}</span><span class="delete-group-btn" data-id="${cat.id}">×</span>`;
      listEl.appendChild(item);
    });
  }

  async function addNewPresetCategory() {
    const input = document.getElementById('new-group-name-input');
    const name = input.value.trim();
    if (!name) return alert('分类名不能为空！');
    const existing = await db.presetCategories.where('name').equals(name).first();
    if (existing) return alert(`分类 "${name}" 已经存在了！`);
    await db.presetCategories.add({ name });
    input.value = '';
    await renderPresetCategoriesInManager();
  }

  async function deletePresetCategory(categoryId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分类后，该分类下的所有预设将变为"未分类"。确定吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.presetCategories.delete(categoryId);
      await db.presets.where('categoryId').equals(categoryId).modify({ categoryId: null });
      state.presets = await db.presets.toArray();
      await renderPresetCategoriesInManager();
    }
  }

  async function handlePresetImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        throw new Error("文件格式不支持。请选择 .json 格式的 Tavern 预设文件。");
      }

      const text = await file.text();
      const tavernData = JSON.parse(text);
      await importTavernPresetFile(tavernData, file.name);

    } catch (error) {
      console.error("预设导入失败:", error);
      await showCustomAlert("导入失败", `无法解析预设文件。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  async function importTavernPresetFile(tavernData, fileName) {
    let newEntries = [];

    if (Array.isArray(tavernData.prompts) && Array.isArray(tavernData.prompt_order) && tavernData.prompt_order.length > 0) {
      console.log("检测到 Tavern/SillyTavern 预设格式，将严格按照 prompt_order 排序。");
      const promptsMap = new Map(tavernData.prompts.map(p => [p.identifier, p]));
      const orderArray = tavernData.prompt_order.reduce((acc, curr) => (
        (curr.order && curr.order.length > (acc.length || 0)) ? curr.order : acc
      ), []);

      if (orderArray && orderArray.length > 0) {
        newEntries = orderArray
          .map(orderItem => {
            const promptData = promptsMap.get(orderItem.identifier);
            if (promptData) {
              return {
                keys: [],
                comment: promptData.name || '无标题',
                content: promptData.content || '',
                enabled: orderItem.enabled
              };
            }
            return null;
          })
          .filter(Boolean);
      }
    } else if (tavernData.entries && typeof tavernData.entries === 'object') {
      if (Array.isArray(tavernData.order)) {
        newEntries = tavernData.order
          .map(key => tavernData.entries[key])
          .filter(Boolean)
          .map(entry => ({
            keys: entry.key || [],
            comment: entry.comment || '无备注',
            content: entry.content || '',
            enabled: !entry.disable
          }));
      } else {
        newEntries = Object.values(tavernData.entries).map(entry => ({
          keys: entry.key || [],
          comment: entry.comment || '无备注',
          content: entry.content || '',
          enabled: !entry.disable
        }));
      }
    } else if (Array.isArray(tavernData.prompts)) {
      newEntries = tavernData.prompts.map(prompt => ({
        keys: [],
        comment: prompt.name || '无标题',
        content: prompt.content || '',
        enabled: true
      }));
    } else {
      throw new Error("文件格式无法识别。未找到有效的 'prompts' 数组或 'entries' 对象。");
    }

    newEntries = newEntries.filter(entry => entry.content);

    if (newEntries.length === 0) {
      alert("这个预设文件中没有找到任何有效的提示词条目。");
      return;
    }

    const presetNameSuggestion = fileName.replace(/\.json$/i, '');
    const newPresetName = await showCustomPrompt("导入 Tavern 预设", "请为这组提示词预设命名：", presetNameSuggestion);
    if (!newPresetName || !newPresetName.trim()) {
      alert("导入已取消，因为未提供名称。");
      return;
    }

    const newPreset = {
      id: 'preset_' + Date.now(),
      name: newPresetName.trim(),
      content: newEntries,
      categoryId: null
    };

    await db.presets.add(newPreset);
    state.presets.push(newPreset);

    await renderPresetScreen();
    await showCustomAlert('导入成功！', `已成功从文件导入预设《${newPresetName}》。`);
  }

  async function renderOfflinePresetSelector(chat) {
    const selectEl = document.getElementById('offline-preset-select');
    if (!selectEl) return;

    const presets = state.presets || [];

    selectEl.innerHTML = '<option value="">-- 不使用预设 --</option>';
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    if (chat.settings.offlinePresetId) {
      selectEl.value = chat.settings.offlinePresetId;
    }
  }

