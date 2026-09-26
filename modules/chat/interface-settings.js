  function openChatSettings() {
    // 直接触发 chat-settings-btn 的 click，
    // 那里会处理 cleanChatDetail 的判断
    const btn = document.getElementById('chat-settings-btn');
    if (btn) {
      btn.click();
    } else {
      showScreen('chat-settings-screen');
    }
  }
  window.openChatSettings = openChatSettings;

  // ========== 从 script.js 迁移：updateSettingsPreview, updateTokenCountDisplay ==========
  async function updateSettingsPreview() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const previewArea = document.getElementById('settings-preview-area');
    if (!previewArea) return;
    const selectedTheme = document.querySelector('input[name="theme-select"]:checked')?.value || 'default';
    const fontSize = document.getElementById('chat-font-size-slider').value;
    const customCss = document.getElementById('custom-css-input').value;
    const background = chat.settings.background;
    previewArea.dataset.theme = selectedTheme;
    
    // 预览区：如果是自定义主题，也动态注入 CSS 变量
    if (selectedTheme && selectedTheme.startsWith('custom_')) {
      try {
        const savedThemesStr = localStorage.getItem('custom_bubble_themes');
        if (savedThemesStr) {
          const customThemes = JSON.parse(savedThemesStr);
          const currentCustomTheme = customThemes.find(t => t.id === selectedTheme);
          if (currentCustomTheme) {
            previewArea.style.setProperty('--custom-user-bg', currentCustomTheme.userColor);
            previewArea.style.setProperty('--custom-ai-bg', currentCustomTheme.aiColor);
          }
        }
      } catch (e) {
        console.error("加载自定义气泡主题颜色预览失败", e);
      }
    }

    previewArea.style.setProperty('--chat-font-size', `${fontSize}px`);
    if (background && background.startsWith('data:image')) {
      previewArea.style.backgroundImage = `url(${background})`;
      previewArea.style.backgroundColor = 'transparent';
    } else {
      previewArea.style.backgroundImage = 'none';
      previewArea.style.background = background || '#f0f2f5';
    }
    previewArea.innerHTML = '';
    const aiMsg = { role: 'ai', content: '对方消息预览', timestamp: 1, senderName: chat.name };
    const aiBubble = await createMessageElement(aiMsg, chat);
    if (aiBubble) previewArea.appendChild(aiBubble);
    const userMsg = { role: 'user', content: '我的消息预览', timestamp: 2 };
    const userBubble = await createMessageElement(userMsg, chat);
    if (userBubble) previewArea.appendChild(userBubble);
    const previewLyricsBar = document.createElement('div');
    previewLyricsBar.style.cssText = 'position: absolute; font-size: 11px; padding: 2px 6px; border-radius: 8px; background-color: rgba(0, 0, 0, 0.1); color: var(--text-secondary); white-space: nowrap; transition: all 0.3s ease;';
    previewLyricsBar.textContent = '♪ 歌词位置预览 ♪';
    previewArea.appendChild(previewLyricsBar);
    const vertical = document.getElementById('lyrics-vertical-pos').value;
    const horizontal = document.getElementById('lyrics-horizontal-pos').value;
    const offset = parseInt(document.getElementById('lyrics-offset-input').value) || 10;
    if (vertical === 'top') previewLyricsBar.style.top = `${offset}px`;
    else previewLyricsBar.style.bottom = `${offset}px`;
    switch (horizontal) {
      case 'left': previewLyricsBar.style.left = '15px'; break;
      case 'right': previewLyricsBar.style.right = '15px'; break;
      default: previewLyricsBar.style.left = '50%'; previewLyricsBar.style.transform = 'translateX(-50%)'; break;
    }
    applyScopedCss(customCss, '#settings-preview-area', 'preview-bubble-style');
  }

  window.updateSettingsPreview = updateSettingsPreview;
  window.updateTokenCountDisplay = updateTokenCountDisplay;
  window.processMentions = processMentions;
  window.updateBackButtonUnreadCount = updateBackButtonUnreadCount;
  window.getDisplayNameByOriginalName = getDisplayNameByOriginalName;
