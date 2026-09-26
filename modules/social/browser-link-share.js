// ============================================================
// 浏览器/分享链接功能 (原 script.js 第 28574~28676 行)
// ============================================================

  function openBrowser(timestamp) {
    if (!state.activeChatId) return;

    const chat = state.chats[state.activeChatId];

    if (!chat || !chat.history) return;

    const message = chat.history.find(m => m.timestamp === timestamp);
    if (!message || message.type !== 'share_link') {
      console.error("无法找到或消息类型不匹配的分享链接:", timestamp);
      return;
    }


    document.getElementById('browser-title').textContent = message.source_name || '文章详情';
    const browserContent = document.getElementById('browser-content');
    browserContent.innerHTML = `
                <h1 class="article-title">${message.title || '无标题'}</h1>
                <div class="article-meta">
                    <span>来源: ${message.source_name || '未知'}</span>
                </div>
                <div class="article-body">
                    <p>${(message.content || '内容为空。').replace(/\n/g, '</p><p>')}</p>
                </div>
            `;


    showScreen('browser-screen');
  }







  function closeBrowser() {
    showScreen('chat-interface-screen');
  }






  function openShareLinkModal() {
    if (!state.activeChatId) return;


    document.getElementById('link-title-input').value = '';
    document.getElementById('link-description-input').value = '';
    document.getElementById('link-source-input').value = '';
    document.getElementById('link-content-input').value = '';


    document.getElementById('share-link-modal').classList.add('visible');
  }


  async function sendUserLinkShare() {
    if (!state.activeChatId) return;

    const title = document.getElementById('link-title-input').value.trim();
    if (!title) {
      alert("标题是必填项哦！");
      return;
    }

    const description = document.getElementById('link-description-input').value.trim();
    const sourceName = document.getElementById('link-source-input').value.trim();
    const content = document.getElementById('link-content-input').value.trim();

    const chat = state.chats[state.activeChatId];


    const linkMessage = {
      role: 'user',
      type: 'share_link',
      timestamp: Date.now(),
      title: title,
      description: description,
      source_name: sourceName,
      content: content,

      thumbnail_url: null
    };


    chat.history.push(linkMessage);
    await db.chats.put(chat);


    appendMessage(linkMessage, chat);
    renderChatList();


    document.getElementById('share-link-modal').classList.remove('visible');
  }


