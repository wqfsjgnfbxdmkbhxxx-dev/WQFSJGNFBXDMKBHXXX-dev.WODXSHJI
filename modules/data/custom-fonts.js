  // ========== 自定义字体管理 ==========

  // 字体范围 → CSS 选择器映射
  const FONT_SCOPE_SELECTORS = {
    homeScreen: '#home-screen',
    qq: '#chat-list-screen, #chat-interface-screen',
    cphone: '#character-phone-screen, #character-selection-screen',
    myphone: '#myphone-screen, #myphone-selection-screen',
    worldBook: '#world-book-screen, #world-book-editor-screen',
    douban: '#douban-screen, #douban-post-detail-screen',
    alipay: '#alipay-screen, #fund-screen',
    settings: '#font-settings-screen, #wallpaper-screen, #rendering-rules-screen, #preset-screen, #preset-editor-screen, #chat-settings-screen, #long-term-memory-screen'
  };

  function applyCustomFont(fontUrl, isPreviewOnly = false) {
    const globalFontSize = state.globalSettings.globalFontSize || 16;
    const fontSizeCss = globalFontSize !== 16 ? `font-size: ${globalFontSize}px;` : '';
    const fontLocalData = state.globalSettings.fontLocalData || '';

    // 优先使用本地字体数据，其次使用URL
    const fontSrc = fontLocalData || fontUrl;

    if (!fontSrc) {
      // 即使没有自定义字体，也要应用字体大小
      if (fontSizeCss) {
        dynamicFontStyle.innerHTML = `body { ${fontSizeCss} }`;
      } else {
        dynamicFontStyle.innerHTML = '';
      }
      document.getElementById('font-preview').style.fontFamily = '';
      return;
    }
    const fontName = 'custom-user-font';
    const newStyle = `
                        @font-face {
                          font-family: '${fontName}';
                          src: url('${fontSrc}');
                          font-display: swap;
                        }`;
    if (isPreviewOnly) {
      const previewStyle = document.getElementById('preview-font-style') || document.createElement('style');
      previewStyle.id = 'preview-font-style';
      previewStyle.innerHTML = newStyle;
      if (!document.getElementById('preview-font-style')) document.head.appendChild(previewStyle);
      document.getElementById('font-preview').style.fontFamily = `'${fontName}', 'bulangni', sans-serif`;
      document.getElementById('font-preview').style.fontSize = `${globalFontSize}px`;
    } else {
      const scope = state.globalSettings.fontScope || { all: true };
      const fontFamily = `'${fontName}', 'bulangni', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      if (scope.all) {
        dynamicFontStyle.innerHTML = `${newStyle}\nbody { font-family: ${fontFamily}; ${fontSizeCss} }`;
      } else {
        const selectors = Object.keys(FONT_SCOPE_SELECTORS)
          .filter(key => scope[key])
          .map(key => FONT_SCOPE_SELECTORS[key])
          .join(', ');
        if (selectors) {
          dynamicFontStyle.innerHTML = `${newStyle}\n${selectors} { font-family: ${fontFamily}; ${fontSizeCss} }`;
        } else {
          dynamicFontStyle.innerHTML = fontSizeCss ? `${newStyle}\nbody { ${fontSizeCss} }` : '';
        }
      }
    }
  }

  async function resetFontByScope() {
    const fontUrl = state.globalSettings.fontUrl;
    if (!fontUrl) {
      alert('当前没有使用自定义字体。');
      return;
    }

    const scope = state.globalSettings.fontScope || { all: true };
    const scopeLabels = {
      homeScreen: '主屏幕', qq: 'QQ (聊天)', cphone: 'Cphone',
      myphone: 'Myphone', worldBook: '世界书', douban: '豆瓣',
      alipay: '支付宝', settings: '设置页面'
    };
    const activeScopes = scope.all
      ? Object.keys(scopeLabels)
      : Object.keys(scopeLabels).filter(k => scope[k]);

    if (activeScopes.length === 0) {
      alert('当前没有区域在使用自定义字体。');
      return;
    }

    // 构建 checkbox 列表 HTML
    const checkboxHtml = activeScopes.map(key =>
      `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;">
        <input type="checkbox" value="${key}" style="width:18px;height:18px;accent-color:#007aff;">
        <span>${scopeLabels[key]}</span>
      </label>`
    ).join('');

    const contentHtml = `
      <div style="max-height:300px;overflow-y:auto;margin:10px 0;">
        ${checkboxHtml}
      </div>
      <p style="font-size:12px;color:#999;margin-top:8px;">勾选的区域将恢复为系统默认字体，其他区域不受影响。</p>
    `;

    return new Promise(resolve => {
      window._modalResolve = null;
      window._modalTitle.textContent = '选择要恢复默认的区域';
      window._modalBody.innerHTML = contentHtml;

      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row';
        modalFooter.style.justifyContent = 'flex-end';
        modalFooter.innerHTML = `
          <button id="custom-modal-cancel">取消</button>
          <button id="custom-modal-confirm" class="confirm-btn btn-danger">恢复选中区域</button>
        `;
      }

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const cancelBtn = document.getElementById('custom-modal-cancel');

      confirmBtn.onclick = async () => {
        const checked = modalBody.querySelectorAll('input[type="checkbox"]:checked');
        if (checked.length === 0) {
          alert('请至少选择一个区域。');
          return;
        }

        const resetKeys = Array.from(checked).map(cb => cb.value);
        const newScope = { ...scope, all: false };
        resetKeys.forEach(key => { newScope[key] = false; });

        const anyActive = Object.keys(scopeLabels).some(k => newScope[k]);
        if (!anyActive) {
          state.globalSettings.fontUrl = '';
          state.globalSettings.fontLocalData = '';
          state.globalSettings.fontScope = { all: true, homeScreen: true, qq: true, cphone: true, myphone: true, worldBook: true, douban: true, alipay: true, settings: true };
          dynamicFontStyle.innerHTML = '';
          document.getElementById('font-url-input').value = '';
          document.getElementById('font-preview').style.fontFamily = '';
          document.getElementById('font-local-filename').textContent = '';
          document.getElementById('font-local-warning').style.display = 'none';
          document.getElementById('font-local-clear-btn').style.display = 'none';
          document.getElementById('font-url-input').disabled = false;
          document.getElementById('font-url-input').placeholder = 'https://..../font.ttf';
        } else {
          state.globalSettings.fontScope = newScope;
          applyCustomFont(state.globalSettings.fontUrl, false);
        }

        await db.globalSettings.put(state.globalSettings);

        // 刷新字体设置页面 UI
        const allCb = document.getElementById('font-scope-all');
        if (allCb) {
          allCb.checked = state.globalSettings.fontScope.all;
          document.getElementById('font-scope-list').style.display = state.globalSettings.fontScope.all ? 'none' : 'flex';
          document.querySelectorAll('#font-scope-list input[data-scope]').forEach(cb => {
            cb.checked = state.globalSettings.fontScope[cb.dataset.scope] !== false;
          });
        }

        hideCustomModal();
        const names = resetKeys.map(k => scopeLabels[k]).join('、');
        alert(`已恢复以下区域的默认字体：${names}`);
        resolve(true);
      };

      cancelBtn.onclick = () => {
        hideCustomModal();
        resolve(false);
      };

      showCustomModal();
    });
  }

  async function resetToDefaultFont() {
    dynamicFontStyle.innerHTML = '';
    state.globalSettings.fontUrl = '';
    state.globalSettings.fontLocalData = '';
    state.globalSettings.globalFontSize = 16;
    state.globalSettings.fontScope = { all: true, homeScreen: true, qq: true, cphone: true, myphone: true, worldBook: true, douban: true, alipay: true, settings: true };
    await db.globalSettings.put(state.globalSettings);
    document.getElementById('font-url-input').value = '';
    document.getElementById('font-preview').style.fontFamily = '';
    document.getElementById('font-preview').style.fontSize = '';
    document.getElementById('font-local-filename').textContent = '';
    document.getElementById('font-local-warning').style.display = 'none';
    document.getElementById('font-local-clear-btn').style.display = 'none';
    document.getElementById('font-size-slider').value = 16;
    document.getElementById('font-size-value').textContent = '16';
    // 重置 UI
    const allCb = document.getElementById('font-scope-all');
    if (allCb) {
      allCb.checked = true;
      document.getElementById('font-scope-list').style.display = 'none';
      document.querySelectorAll('#font-scope-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    }
    alert('已恢复默认字体。');
  }


