// ========== 提示音预设管理 ==========

  async function migrateSoundPresetsToDb() {
    try {
      // 检查数据库表是否为空
      const existingPresets = await db.soundPresets.toArray();
      if (existingPresets.length > 0) {
        console.log('[声音预设迁移] 数据库表已有数据，跳过迁移');
        return;
      }

      // 检查旧数据是否存在
      if (state.globalSettings.soundPresets && Array.isArray(state.globalSettings.soundPresets) && state.globalSettings.soundPresets.length > 0) {
        console.log('[声音预设迁移] 发现旧数据，开始迁移...', state.globalSettings.soundPresets);
        
        // 迁移数据到新表
        for (const preset of state.globalSettings.soundPresets) {
          await db.soundPresets.add({
            name: preset.name,
            url: preset.url
          });
        }
        
        console.log(`[声音预设迁移] 成功迁移 ${state.globalSettings.soundPresets.length} 个预设到数据库表`);
      } else {
        console.log('[声音预设迁移] 未发现旧数据');
      }
    } catch (error) {
      console.error('[声音预设迁移] 迁移失败:', error);
    }
  }

  // 加载提示音预设下拉框
  async function loadSoundPresetsDropdown(forceSelectedId = null) {
    console.log('[声音预设DEBUG] loadSoundPresetsDropdown 被调用, forceSelectedId:', forceSelectedId);
    const selectEl = document.getElementById('sound-preset-select');
    if (!selectEl) {
      console.error('[声音预设DEBUG] 找不到 sound-preset-select 元素！');
      return;
    }

    selectEl.innerHTML = '<option value="current">当前配置 (未保存)</option>';

    console.log('[声音预设DEBUG] 开始从数据库读取预设...');
    const presets = await db.soundPresets.toArray();
    console.log('[声音预设DEBUG] 从数据库读取到的预设:', presets);
    
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
      console.log('[声音预设DEBUG] 添加预设到下拉框:', preset.name, 'ID:', preset.id);
    });

    // 如果指定了要选中的预设ID
    if (forceSelectedId) {
      selectEl.value = forceSelectedId;
      return;
    }

    // 自动匹配当前配置
    const currentUrl = document.getElementById('notification-sound-url-input').value.trim();
    let matchingPresetId = null;
    for (const preset of presets) {
      if (preset.url === currentUrl) {
        matchingPresetId = preset.id;
        break;
      }
    }

    if (matchingPresetId) {
      selectEl.value = matchingPresetId;
    } else {
      selectEl.value = 'current';
    }
  }

  // 处理提示音预设选择变化
  async function handleSoundPresetSelectionChange() {
    const selectEl = document.getElementById('sound-preset-select');
    const selectedValue = selectEl.value;

    if (selectedValue === 'current') {
      return;
    }

    const selectedId = parseInt(selectedValue);
    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.soundPresets.get(selectedId);
    if (!preset) return;

    // 直接应用预设
    document.getElementById('notification-sound-url-input').value = preset.url || '';
    state.globalSettings.notificationSoundUrl = preset.url || '';
    saveState();

    // 刷新下拉框，确保选中状态
    await loadSoundPresetsDropdown(selectedId);
  }

  // 保存提示音预设
  async function saveSoundPreset() {
    console.log('[声音预设DEBUG] saveSoundPreset 被调用');
    const url = document.getElementById('notification-sound-url-input').value.trim();

    // 请求输入预设名称
    const name = await showCustomPrompt('保存提示音预设', '请输入预设名称');
    if (!name || name.trim() === '') {
      console.log('[声音预设DEBUG] 用户取消输入');
      return;
    }

    state.globalSettings.customThoughtsUIEnabled = document.getElementById('custom-thoughts-ui-switch').checked;
    state.globalSettings.customThoughtsHTML = document.getElementById('custom-thoughts-html-textarea').value;
    state.globalSettings.customThoughtsCSS = document.getElementById('custom-thoughts-css-textarea').value;

    const presetData = {
      name: name.trim(),
      url: url
    };
    console.log('[声音预设DEBUG] 准备保存预设:', presetData);

    // 检查是否已存在同名预设
    const existingPreset = await db.soundPresets.where('name').equals(presetData.name).first();
    if (existingPreset) {
      console.log('[声音预设DEBUG] 发现同名预设:', existingPreset);
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) {
        console.log('[声音预设DEBUG] 用户取消覆盖');
        return;
      }
      presetData.id = existingPreset.id;
    }

    console.log('[声音预设DEBUG] 开始写入数据库...');
    await db.soundPresets.put(presetData);
    console.log('[声音预设DEBUG] 数据库写入完成，返回的ID:', presetData.id);
    
    console.log('[声音预设DEBUG] 准备刷新下拉框...');
    await loadSoundPresetsDropdown(presetData.id);
    console.log('[声音预设DEBUG] 下拉框刷新完成');
    
    alert('预设已保存！');
  }

  // 删除提示音预设（从下拉框删除选中的预设）
  async function deleteSoundPreset() {
    const selectEl = document.getElementById('sound-preset-select');
    const selectedValue = selectEl.value;

    if (selectedValue === 'current') {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const selectedId = parseInt(selectedValue);
    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.soundPresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.soundPresets.delete(selectedId);
      await loadSoundPresetsDropdown();
      alert('预设已删除！');
    }
  }

  // 渲染提示音预设列表（保持兼容，但现在主要用下拉框）
  async function renderSoundPresets() {
    console.log('[声音预设DEBUG] renderSoundPresets 被调用');
    await migrateSoundPresetsToDb(); // 先执行数据迁移
    console.log('[声音预设DEBUG] 迁移完成，开始加载下拉框');
    await loadSoundPresetsDropdown();
    console.log('[声音预设DEBUG] 下拉框加载完成');
  }

  // ========== 提示音预设管理功能结束 ==========


