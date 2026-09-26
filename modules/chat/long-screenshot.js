// ============================================================
// 长截图 (原 script.js 第 32868~32990 行)
// ============================================================

  async function handleLongScreenshot() {
    if (selectedMessages.size === 0) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;


    const screenshotBtn = document.getElementById('selection-screenshot-btn');
    const originalBtnText = screenshotBtn.textContent;
    screenshotBtn.textContent = '生成中...';
    screenshotBtn.disabled = true;


    const screenshotContainer = document.createElement('div');
    const phoneScreen = document.getElementById('phone-screen');
    screenshotContainer.style.width = phoneScreen.offsetWidth + 'px';
    screenshotContainer.style.position = 'absolute';
    screenshotContainer.style.top = '-9999px';
    screenshotContainer.style.left = '-9999px';
    screenshotContainer.style.display = 'flex';
    screenshotContainer.style.flexDirection = 'column';
    screenshotContainer.style.height = 'auto';

    const chatScreen = document.getElementById('chat-interface-screen');
    screenshotContainer.style.backgroundImage = chatScreen.style.backgroundImage;
    screenshotContainer.style.backgroundColor = chatScreen.style.backgroundColor || (document.getElementById('phone-screen').classList.contains('dark-mode') ? '#000000' : '#f0f2f5');

    const tempStyle = document.createElement('style');
    tempStyle.innerHTML = `
                .message-bubble.selected::after { display: none !important; }
                .cloned-header .default-controls { display: flex !important; justify-content: space-between; align-items: center; width: 100%; }
                .cloned-header .selection-controls { display: none !important; }
            `;
    document.head.appendChild(tempStyle);

    try {

      const header = chatScreen.querySelector('.header').cloneNode(true);
      header.classList.add('cloned-header');



      const messagesContainer = document.createElement('div');
      const originalMessagesContainer = document.getElementById('chat-messages');


      messagesContainer.style.display = 'flex';
      messagesContainer.style.flexDirection = 'column';
      messagesContainer.style.gap = '20px';
      messagesContainer.style.padding = '10px 15px 20px 15px';
      messagesContainer.style.width = '100%';
      messagesContainer.style.boxSizing = 'border-box';


      messagesContainer.dataset.theme = originalMessagesContainer.dataset.theme;
      messagesContainer.style.setProperty('--chat-font-size', originalMessagesContainer.style.getPropertyValue('--chat-font-size'));


      const inputArea = chatScreen.querySelector('#chat-input-area').cloneNode(true);

      const sortedTimestamps = [...selectedMessages].sort((a, b) => a - b);
      sortedTimestamps.forEach(timestamp => {

        const originalBubble = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`);
        if (originalBubble) {
          const originalWrapper = originalBubble.closest('.message-wrapper');
          if (originalWrapper) {
            messagesContainer.appendChild(originalWrapper.cloneNode(true));
          }
        }
      });

      screenshotContainer.appendChild(header);
      screenshotContainer.appendChild(messagesContainer);
      screenshotContainer.appendChild(inputArea);
      document.body.appendChild(screenshotContainer);


      const images = Array.from(screenshotContainer.getElementsByTagName('img'));
      const imageLoadPromises = images.map(img => new Promise((resolve, reject) => {
        if (img.src.startsWith('data:')) {
          resolve();
          return;
        }
        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = resolve;
        newImg.onerror = resolve;
        newImg.src = img.src;
      }));

      await Promise.all(imageLoadPromises);


      const canvas = await html2canvas(screenshotContainer, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: null,
        scale: window.devicePixelRatio || 2,
      });


      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `EPhone-长截图-${chat.name}-${Date.now()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');

    } catch (error) {
      console.error('长截图生成失败:', error);
      await showCustomAlert('生成失败', '生成截图时发生错误，请检查控制台获取详情。');
    } finally {

      document.body.removeChild(screenshotContainer);
      document.head.removeChild(tempStyle);
      screenshotBtn.textContent = originalBtnText;
      screenshotBtn.disabled = false;
      exitSelectionMode();
    }
  }


