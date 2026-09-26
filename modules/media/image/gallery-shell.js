  // ========== 从 script.js 迁移：NAI Gallery 及相关函数 ==========
  let isNaiGalleryManagementMode = false;
  let selectedNaiImages = new Set();
  let naiGalleryCache = { local: [], cloud: [] };
  let naiGalleryRenderCount = { local: 0, cloud: 0 };
  let isLoadingMoreNaiImages = { local: false, cloud: false };
  let activeNaiGalleryTab = 'local';
  const NAI_GALLERY_RENDER_WINDOW = 45;

  async function handleRegenerateNaiImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    const originalPrompt = message.prompt;
    if (!originalPrompt) { await showCustomAlert("无法重新生成", "未找到该图片的原始提示词(prompt)。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.realimag-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      let generatedData;
      if (message.type === 'googleimag') {
        generatedData = await generateGoogleImagenFromPrompt(originalPrompt);
      } else if (message.type === 'openaiimag') {
        generatedData = await generateOpenAIImageFromPrompt(originalPrompt);
      } else {
        generatedData = await generateNaiImageFromPrompt(originalPrompt, chat.id);
      }
      message.imageUrl = generatedData.imageUrl;
      message.fullPrompt = generatedData.fullPrompt;
      if (generatedData.model) message.model = generatedData.model;
      if (generatedData.mimeType) message.mimeType = generatedData.mimeType;
      if (generatedData.requestId) message.requestId = generatedData.requestId;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = generatedData.imageUrl; imgElement.title = generatedData.fullPrompt; imgElement.style.opacity = '1'; }
    } catch (error) {
      console.error("重新生成图片失败:", error);
      await showCustomAlert("生成失败", `无法重新生成图片: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  async function handleSilentUploadNaiImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    const base64Url = message.imageUrl;
    if (!base64Url || !base64Url.startsWith('data:image')) { alert("错误：这张图片已经是URL，或数据已损坏。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.realimag-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      const newUrl = await uploadImageToImgBB(base64Url);
      if (newUrl === base64Url) throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
      message.imageUrl = newUrl;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = newUrl; imgElement.style.opacity = '1'; }
      buttonElement.style.display = 'none';
    } catch (error) {
      console.error("静默上传NAI图片失败:", error);
      await showCustomAlert("上传失败", `无法上传到 ImgBB: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  async function handleSilentUploadUserImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    if (!message || message.role !== 'user' || !Array.isArray(message.content)) { alert("错误：消息格式不正确。"); return; }
    const base64Url = message.content[0].image_url.url;
    if (!base64Url || !base64Url.startsWith('data:image')) { alert("错误：这张图片已经是URL，或数据已损坏。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.chat-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      const newUrl = await uploadImageToImgBB(base64Url);
      if (newUrl === base64Url) throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
      message.content[0].image_url.url = newUrl;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = newUrl; imgElement.style.opacity = '1'; }
      buttonElement.style.display = 'none';
    } catch (error) {
      console.error("静默上传User图片失败:", error);
      await showCustomAlert("上传失败", `无法上传到 ImgBB: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  window.handleRegenerateNaiImage = handleRegenerateNaiImage;
  window.handleSilentUploadNaiImage = handleSilentUploadNaiImage;
  window.handleSilentUploadUserImage = handleSilentUploadUserImage;
  window.naiGalleryCache = naiGalleryCache;
  window.naiGalleryRenderCount = naiGalleryRenderCount;
  window.isLoadingMoreNaiImages = isLoadingMoreNaiImages;
  window.activeNaiGalleryTab = activeNaiGalleryTab;

