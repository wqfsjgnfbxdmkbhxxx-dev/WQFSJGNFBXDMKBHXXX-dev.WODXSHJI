// ========== CSS 预设管理 ==========

  async function loadCssPresetsDropdown() {
    const selectEl = document.getElementById('css-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('global_css').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleCssPresetSelectionChange() {
    const selectEl = document.getElementById('css-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const cssInput = document.getElementById('global-css-input');
    const currentCss = cssInput ? cssInput.value.trim() : '';

    if (currentCss) {
      const presets = await db.appearancePresets.where('type').equals('global_css').toArray();
      const existingPreset = presets.find(p => p.value.trim() === currentCss);
      
      if (!existingPreset) {
        const importedName = cssInput.dataset.importedName || '';
        
        const saveName = await showCustomPrompt(
          '未保存的自定义CSS', 
          '检测到当前的CSS未保存，切换后将丢失。是否要保存？\n(输入名称以保存，留空或取消则不保存)', 
          importedName
        );

        if (saveName && saveName.trim()) {
          const nameToSave = saveName.trim();
          const existingByName = presets.find(p => p.name === nameToSave);

          if (existingByName) {
            const confirmed = await showCustomConfirm('覆盖预设', `名为 "${nameToSave}" 的预设已存在。要覆盖它吗？`, {
              confirmButtonClass: 'btn-danger'
            });
            if (confirmed) {
              await db.appearancePresets.update(existingByName.id, {
                value: currentCss
              });
              await loadCssPresetsDropdown();
              selectEl.value = selectedId;
            }
          } else {
            await db.appearancePresets.add({
              name: nameToSave,
              type: 'global_css',
              value: currentCss
            });
            await loadCssPresetsDropdown();
            selectEl.value = selectedId;
          }
        }
      }
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {
      if (cssInput) {
        cssInput.value = preset.value;
        cssInput.dataset.importedName = '';
      }
      applyGlobalCss(preset.value);
    }
  }


  async function saveCssPreset() {
    const name = await showCustomPrompt('保存CSS预设', '请输入预设名称');
    if (!name || !name.trim()) return;

    const cssValue = document.getElementById('global-css-input').value;

    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'global_css'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: cssValue
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'global_css',
        value: cssValue
      });
    }

    await loadCssPresetsDropdown();
    alert('CSS 预设已保存！');
  }


  async function deleteCssPreset() {
    const selectEl = document.getElementById('css-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadCssPresetsDropdown();
      alert('预设已删除。');
    }
  }


