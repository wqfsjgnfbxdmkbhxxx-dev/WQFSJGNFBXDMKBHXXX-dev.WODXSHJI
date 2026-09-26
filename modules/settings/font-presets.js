// ========== 字体预设管理 ==========

  async function loadFontPresetsDropdown() {
    const selectEl = document.getElementById('font-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('font').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleFontPresetSelectionChange() {
    const selectEl = document.getElementById('font-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {
      const fontUrlInput = document.getElementById('font-url-input');
      fontUrlInput.value = preset.value;
      applyCustomFont(preset.value, true);
    }
  }


  async function saveFontPreset() {
    const name = await showCustomPrompt('保存字体预设', '请输入预设名称');
    if (!name || !name.trim()) return;

    const fontUrl = document.getElementById('font-url-input').value.trim();
    if (!fontUrl) {
      alert("字体URL不能为空！");
      return;
    }

    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'font'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: fontUrl
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'font',
        value: fontUrl
      });
    }

    await loadFontPresetsDropdown();
    alert('字体预设已保存！');
  }


  async function deleteFontPreset() {
    const selectEl = document.getElementById('font-preset-select');
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
      await loadFontPresetsDropdown();
      alert('预设已删除。');
    }
  }


