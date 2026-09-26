// ========== 主题预设管理 ==========

  // 加载自定义气泡颜色预设
  async function loadCustomBubbleThemes() {
      const container = document.getElementById('theme-selector-container');
      if (!container) return;

      // 移除之前动态添加的自定义主题单选按钮
      const existingCustoms = container.querySelectorAll('label[data-custom="true"]');
      existingCustoms.forEach(el => el.remove());

      // 找到重置按钮
      const resetBtn = document.getElementById('reset-theme-btn');
      
      try {
          // 从 localStorage 读取保存的自定义主题
          const savedThemesStr = localStorage.getItem('custom_bubble_themes');
          let customThemes = [];
          if (savedThemesStr) {
              customThemes = JSON.parse(savedThemesStr);
          }

          // 如果是从旧版本数据结构恢复（如果没有id）
          let hasMigration = false;
          customThemes.forEach(theme => {
              if (!theme.id) {
                  theme.id = 'custom_' + Date.now() + Math.floor(Math.random() * 1000);
                  hasMigration = true;
              }
          });
          if (hasMigration) {
              localStorage.setItem('custom_bubble_themes', JSON.stringify(customThemes));
          }

          // 重新生成单选按钮
          customThemes.forEach(theme => {
              const label = document.createElement('label');
              label.setAttribute('data-custom', 'true');
              label.style.display = 'inline-flex';
              label.style.alignItems = 'center';
              label.innerHTML = `<input type="radio" name="theme-select" value="${theme.id}" id="theme-${theme.id}"> <span style="display:inline-block; width:12px; height:12px; border-radius:50%; margin-right:4px; background: linear-gradient(135deg, ${theme.userColor} 50%, ${theme.aiColor} 50%); border: 1px solid #ddd;"></span> ${theme.name}`;
              
              // 绑定事件，点击时应用 CSS 变量并保存配置
              const radio = label.querySelector('input');
              radio.addEventListener('change', () => {
                  applyCustomBubbleTheme(theme.id, theme.userColor, theme.aiColor);
                  updateSettingsPreview();
              });

              // 插入到重置按钮之前
              container.insertBefore(label, resetBtn);
          });
      } catch (e) {
          console.error("加载自定义气泡主题失败", e);
      }
  }

  // 应用自定义气泡主题到 CSS 变量
  function applyCustomBubbleTheme(themeId, userColor, aiColor) {
      if (themeId && themeId.startsWith('custom_')) {
          const chatMessages = document.getElementById('chat-messages');
          const settingsPreview = document.getElementById('settings-preview-area');
          
          if (chatMessages) {
              chatMessages.style.setProperty('--custom-user-bg', userColor);
              chatMessages.style.setProperty('--custom-ai-bg', aiColor);
          }
          if (settingsPreview) {
              settingsPreview.style.setProperty('--custom-user-bg', userColor);
              settingsPreview.style.setProperty('--custom-ai-bg', aiColor);
          }
      }
  }
  
  // 确保全局挂载
  window.loadCustomBubbleThemes = loadCustomBubbleThemes;
  window.applyCustomBubbleTheme = applyCustomBubbleTheme;

  async function loadThemePresetsDropdown() {
    const selectEl = document.getElementById('theme-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('bubble_theme').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleThemePresetSelectionChange() {
    const selectEl = document.getElementById('theme-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {


      const baseTheme = preset.value.base || 'default';
      const customCss = preset.value.custom || '';


      const themeRadio = document.querySelector(`input[name="theme-select"][value="${baseTheme}"]`);
      if (themeRadio) {
        themeRadio.checked = true;
      }


      const customCssInput = document.getElementById('custom-css-input');
      customCssInput.value = customCss;


      updateSettingsPreview();

    }
  }


  async function saveThemePreset() {
    const name = await showCustomPrompt('保存主题预设', '请输入预设名称');
    if (!name || !name.trim()) return;



    const selectedThemeRadio = document.querySelector('input[name="theme-select"]:checked');
    const themeValue = selectedThemeRadio ? selectedThemeRadio.value : 'default';


    const cssValue = document.getElementById('custom-css-input').value.trim();


    const presetValueObject = {
      base: themeValue,
      custom: cssValue
    };


    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'bubble_theme'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;


      await db.appearancePresets.update(existingPreset.id, {
        value: presetValueObject
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'bubble_theme',

        value: presetValueObject
      });
    }

    await loadThemePresetsDropdown();
    alert('主题预设已保存！');
  }


  async function deleteThemePreset() {
    const selectEl = document.getElementById('theme-preset-select');
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
      await loadThemePresetsDropdown();
      alert('预设已删除。');
    }
  }

