  // ========== 从 script.js 迁移：NAI Gallery 批量操作函数 ==========

  async function executeBatchExportNaiImages() {
    if (selectedNaiImages.size === 0) {
      alert("请先选择要导出的图片。");
      return;
    }

    let exportText = "";
    let exportedCount = 0;

    selectedNaiImages.forEach(key => {
      const item = naiGalleryCache.cloud.find(img => {
        const itemKey = `${img.sourceType}_${img.chatId || img.postId}_${img.msgTimestamp || img.imageIndex}`;
        return itemKey === key;
      });

      if (item && item.imageUrl) {
        exportText += `${item.imageUrl}\n`;
        exportedCount++;
      }
    });

    if (exportedCount === 0) {
      alert("未找到所选图片的数据（请确认您在'图床'分类下）。");
      return;
    }

    const finalText = exportText.trim();
    const textareaId = 'batch-export-nai-textarea-' + Date.now();

    const alertHtml = `
        <p style="text-align:left; font-size: 14px; margin: 0 0 10px 0;">
            已提取 ${exportedCount} 条链接：
        </p>
        <textarea id="${textareaId}" 
                  rows="10" 
                  style="width: 100%; font-size: 12px; resize: vertical; border-radius: 6px; border: 1px solid #ccc;"
                  readonly>${finalText}</textarea>
    `;

    showCustomAlert("复制链接", alertHtml);

    const modalConfirmBtn = document.getElementById('custom-modal-confirm');
    if (modalConfirmBtn) {
      modalConfirmBtn.textContent = '一键复制';
      const originalOnclick = modalConfirmBtn.onclick;

      modalConfirmBtn.onclick = async (e) => {
        try {
          await navigator.clipboard.writeText(finalText);
          modalConfirmBtn.textContent = '复制成功!';
          setTimeout(() => {
            modalConfirmBtn.textContent = '完成';
            modalConfirmBtn.onclick = originalOnclick;
          }, 1500);
        } catch (err) {
          alert('自动复制失败，请长按文本框手动复制。');
          modalConfirmBtn.textContent = '完成';
          modalConfirmBtn.onclick = originalOnclick;
        }
      };
    }
  }

  async function executeBatchDownloadNaiImages() {
    const keys = selectedNaiImages;

    if (keys.size === 0) {
      alert("请先选择要下载的图片。");
      return;
    }

    if (typeof JSZip === 'undefined' || !window.streamSaver) {
      await showCustomAlert("下载失败", "核心库 (JSZip 或 StreamSaver) 未能成功加载，请检查您的网络连接并刷新页面后重试。");
      return;
    }

    await showCustomAlert("请稍候...", `正在准备 ${keys.size} 张图片...`);

    const zip = new JSZip();
    let failedDownloads = 0;
    const downloadPromises = [];

    const keysArray = Array.from(keys);

    keysArray.forEach((key, index) => {
      const item = document.querySelector(`.nai-gallery-item[data-key="${key}"]`);
      if (!item) return;

      const imageUrl = item.dataset.imageUrl;
      const prompt = item.dataset.prompt;

      const baseFilename = generateFilenameForNai(prompt);
      const filename = baseFilename.replace(/\.png$/, `_(${index + 1}).png`);

      const promise = (async () => {
        try {
          let blob;
          if (imageUrl.startsWith('data:')) {
            const response = await fetch(imageUrl);
            blob = await response.blob();
          } else {
            let response;
            try {
              response = await fetch(imageUrl, { mode: 'cors' });
              if (!response.ok) throw new Error('直连失败');
            } catch (e) {
              console.warn("直连失败, 尝试使用CORS代理...", e.message);
              const settings = getNovelAISettings();
              let corsProxy = settings.cors_proxy === 'custom' ? settings.custom_proxy_url : settings.cors_proxy;
              if (!corsProxy || corsProxy === '') corsProxy = 'https://corsproxy.io/?';
              const proxiedUrl = corsProxy + encodeURIComponent(imageUrl);
              response = await fetch(proxiedUrl);
            }

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            blob = await response.blob();
          }
          zip.file(filename, blob, { binary: true });
        } catch (e) {
          console.error(`下载图片失败: ${imageUrl}`, e);
          failedDownloads++;
        }
      })();
      downloadPromises.push(promise);
    });

    await Promise.all(downloadPromises);

    if (failedDownloads === keys.size) {
      await showCustomAlert("下载失败", "所有图片都下载失败了。这通常是由于网络问题或CORS跨域限制（请检查API设置中的CORS代理是否有效）。");
      return;
    }

    await showCustomAlert("打包中...", "所有图片已准备就绪，正在流式压缩... 下载将自动开始。");

    try {
      const fileStream = streamSaver.createWriteStream(`NAI_Gallery_Batch_${Date.now()}.zip`);

      const zipStream = zip.generateInternalStream({ type: "blob", streamFiles: true });

      const readableStream = new ReadableStream({
        start(controller) {
          zipStream.on('data', (chunk) => {
            controller.enqueue(chunk);
          }).on('end', () => {
            console.log("ZIP 流生成完毕。");
            controller.close();
          }).on('error', (err) => {
            console.error("JSZip 流错误:", err);
            controller.error(err);
          }).resume();
        }
      });

      await readableStream.pipeTo(fileStream);

      if (failedDownloads > 0) {
        showCustomAlert("部分下载完成", `成功打包 ${keys.size - failedDownloads} 张图片。有 ${failedDownloads} 张图片因网络或CORS限制下载失败。`);
      }

    } catch (error) {
      console.error("流式下载ZIP失败:", error);
      await showCustomAlert("流式下载失败", `创建ZIP流时出错: ${error.message}`);
    }
  }

  async function executeBatchDeleteNaiImages(keysToDelete = null) {
    const keys = keysToDelete || selectedNaiImages;
    if (keys.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要从【聊天记录和动态】中永久删除这 ${keys.size} 张NAI图片吗？此操作不可恢复。`, {
      confirmButtonClass: 'btn-danger'
    });

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行删除操作...");

    let deletedCount = 0;
    const chatsToUpdate = new Map();
    const postsToDelete = new Set();
    const postsToModify = new Map();

    const postIdsToFetch = new Set();
    for (const key of keys) {
      if (key.startsWith('qzone_')) {
        const parts = key.split('_');
        const postId = parseInt(parts[1]);
        if (!isNaN(postId)) {
          postIdsToFetch.add(postId);
        }
      }
    }
    const postsCache = new Map();
    if (postIdsToFetch.size > 0) {
      const posts = await db.qzonePosts.where('id').anyOf(Array.from(postIdsToFetch)).toArray();
      posts.forEach(post => postsCache.set(post.id, post));
    }

    for (const key of keys) {
      const parts = key.split('_');
      if (parts.length < 3) {
        console.warn("跳过格式错误的NAI图片Key:", key);
        continue;
      }

      const sourceType = parts[0];
      const identifier = parts.pop();
      const id = parts.slice(1).join('_');

      if (sourceType === 'chat') {
        const chatId = id;
        const msgTimestamp = parseInt(identifier);

        if (!chatsToUpdate.has(chatId)) {
          const chatData = await db.chats.get(chatId);
          if (chatData) {
            chatsToUpdate.set(chatId, chatData);
          } else {
            console.warn(`未找到 chatID: ${chatId}，跳过...`);
            continue;
          }
        }

        const chat = chatsToUpdate.get(chatId);
        if (chat && chat.history) {
          const originalLength = chat.history.length;
          chat.history = chat.history.filter(msg => msg.timestamp !== msgTimestamp);
          if (chat.history.length < originalLength) {
            deletedCount++;
            chatsToUpdate.set(chatId, chat);
            if (state.chats[chatId]) {
              state.chats[chatId].history = chat.history;
            }
          }
        }
      } else if (sourceType === 'qzone') {
        const postId = parseInt(id);
        const imageIndex = parseInt(identifier);

        const post = postsToModify.get(postId) || postsCache.get(postId);
        if (!post) {
          console.warn(`未找到 postID: ${postId}，跳过...`);
          continue;
        }

        const urls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);

        if (urls.length <= 1) {
          postsToDelete.add(postId);
          if (postsToModify.has(postId)) {
            postsToModify.delete(postId);
          }
        } else {
          const urlToRemove = urls[imageIndex];
          post.imageUrls = post.imageUrls.filter(url => url !== urlToRemove);

          if (post.prompt && Array.isArray(post.prompt) && post.prompt[imageIndex]) {
            post.prompt.splice(imageIndex, 1);
          }
          post.imageUrl = post.imageUrls[0] || null;
          postsToModify.set(postId, post);
        }
        deletedCount++;
      }
    }

    try {
      await db.transaction('rw', db.chats, db.qzonePosts, async () => {
        if (chatsToUpdate.size > 0) {
          await db.chats.bulkPut(Array.from(chatsToUpdate.values()));
        }
        if (postsToModify.size > 0) {
          await db.qzonePosts.bulkPut(Array.from(postsToModify.values()));
        }
        if (postsToDelete.size > 0) {
          await db.qzonePosts.bulkDelete(Array.from(postsToDelete));
        }
      });

      toggleNaiGalleryManagementMode();
      keys.forEach(key => {
        naiGalleryCache.local = naiGalleryCache.local.filter(item => {
          const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
          return itemKey !== key;
        });
        naiGalleryCache.cloud = naiGalleryCache.cloud.filter(item => {
          const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
          return itemKey !== key;
        });
      });

      naiGalleryRenderCount[activeNaiGalleryTab] = 0;
      document.getElementById(`nai-gallery-grid-${activeNaiGalleryTab}`).innerHTML = '';

      loadMoreNaiGalleryImages();
      await showCustomAlert('删除成功', `已成功删除 ${deletedCount} 张图片。`);

      if (document.getElementById('chat-interface-screen').classList.contains('active')) {
        renderChatInterface(state.activeChatId);
      }
      if (document.getElementById('qzone-screen').classList.contains('active')) {
        renderQzonePosts();
      }

    } catch (error) {
      console.error("批量删除NAI图片时出错:", error);
      await showCustomAlert('删除失败', `操作失败: ${error.message}`);
    }
  }

  async function executeBatchUploadNaiImagesToImgBB() {
    if (!state.apiConfig.imgbbEnable || !state.apiConfig.imgbbApiKey) {
      await showCustomAlert("功能未开启", "请先在\"API设置\"中开启 ImgBB 自动图床功能并填写 API Key。");
      return;
    }

    const itemsToUpload = Array.from(selectedNaiImages)
      .map(key => document.querySelector(`.nai-gallery-item[data-key="${key}"]`))
      .filter(item => item && item.dataset.imageUrl && item.dataset.imageUrl.startsWith('data:image'));

    if (itemsToUpload.length === 0) {
      await showCustomAlert("无需上传", "你选择的图片中没有需要上传的本地图片（它们可能已经是网络链接了）。");
      return;
    }

    const confirmed = await showCustomConfirm(
      '确认上传？',
      `即将把 ${itemsToUpload.length} 张本地图片上传到 ImgBB，并永久替换其在数据库中的地址。此操作不可逆！\n\n（上传期间请勿关闭页面）`,
      { confirmButtonClass: 'btn-danger', confirmText: '确认上传' }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在开始上传 ${itemsToUpload.length} 张图片...`);

    let successCount = 0;
    let failCount = 0;
    const chatsToUpdate = new Map();
    const postsToUpdate = new Map();
    const keysToUpdateInCache = new Map();

    for (const item of itemsToUpload) {
      const key = item.dataset.key;
      const base64Url = item.dataset.imageUrl;

      try {
        const newUrl = await uploadImageToImgBB(base64Url);

        if (newUrl === base64Url) {
          throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
        }

        const parts = key.split('_');
        if (parts.length < 3) throw new Error(`Key格式错误: ${key}`);

        const sourceType = parts[0];
        const identifier = parts.pop();
        const id = parts.slice(1).join('_');

        if (sourceType === 'chat') {
          const chatId = id;
          const msgTimestamp = parseInt(identifier);

          let chat = chatsToUpdate.get(chatId);
          if (!chat) chat = await db.chats.get(chatId);

          if (chat && chat.history) {
            const msg = chat.history.find(m => m.timestamp === msgTimestamp);
            if (msg && msg.imageUrl === base64Url) {
              msg.imageUrl = newUrl;
              chatsToUpdate.set(chatId, chat);
              keysToUpdateInCache.set(key, newUrl);
              successCount++;
            } else {
              throw new Error(`未在聊天 ${chatId} 中找到时间戳为 ${msgTimestamp} 且匹配Base64的消息。`);
            }
          }

        } else if (sourceType === 'qzone') {
          const postId = parseInt(id);
          const imageIndex = parseInt(identifier);

          let post = postsToUpdate.get(postId);
          if (!post) post = await db.qzonePosts.get(postId);

          if (post && post.imageUrls && post.imageUrls[imageIndex] === base64Url) {
            post.imageUrls[imageIndex] = newUrl;
            if (imageIndex === 0) {
              post.imageUrl = newUrl;
            }
            postsToUpdate.set(postId, post);
            keysToUpdateInCache.set(key, newUrl);
            successCount++;
          } else {
            throw new Error(`未在动态 ${postId} 的第 ${imageIndex} 张图中找到匹配的Base64。`);
          }
        }

      } catch (error) {
        failCount++;
        console.error(`上传失败 (Key: ${key}):`, error.message);
      }
    }

    try {
      if (chatsToUpdate.size > 0 || postsToUpdate.size > 0) {
        await db.transaction('rw', db.chats, db.qzonePosts, async () => {
          if (chatsToUpdate.size > 0) {
            await db.chats.bulkPut(Array.from(chatsToUpdate.values()));
          }
          if (postsToUpdate.size > 0) {
            await db.qzonePosts.bulkPut(Array.from(postsToUpdate.values()));
          }
        });
      }
    } catch (dbError) {
      console.error("批量更新数据库失败:", dbError);
      await showCustomAlert("数据库更新失败", `图片上传完成，但在保存到数据库时出错: ${dbError.message}`);
      return;
    }

    keysToUpdateInCache.forEach((newUrl, key) => {
      const domItem = document.querySelector(`.nai-gallery-item[data-key="${key}"]`);
      if (domItem) {
        domItem.dataset.imageUrl = newUrl;
        domItem.querySelector('.nai-image-container').style.backgroundImage = `url(${newUrl})`;
      }
    });

    const updatedLocal = [];
    const updatedCloud = [];

    naiGalleryCache.local.forEach(item => {
      const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
      if (keysToUpdateInCache.has(itemKey)) {
        item.imageUrl = keysToUpdateInCache.get(itemKey);
        updatedCloud.push(item);
      } else {
        updatedLocal.push(item);
      }
    });

    naiGalleryCache.cloud.push(...updatedCloud);
    naiGalleryCache.local = updatedLocal;

    naiGalleryRenderCount = { local: 0, cloud: 0 };
    let resultMessage = `批量上传完成！\n\n成功: ${successCount} 张\n失败: ${failCount} 张`;
    if (failCount > 0) {
      resultMessage += "\n\n失败的图片请检查控制台（Console）中的错误日志。";
    }
    await showCustomAlert("操作完成", resultMessage);

    toggleNaiGalleryManagementMode();
  }

  window.executeBatchExportNaiImages = executeBatchExportNaiImages;
  window.executeBatchDownloadNaiImages = executeBatchDownloadNaiImages;
  window.executeBatchDeleteNaiImages = executeBatchDeleteNaiImages;
  window.executeBatchUploadNaiImagesToImgBB = executeBatchUploadNaiImagesToImgBB;

  window.addEventListener('pagehide', event => {
    if (!event.persisted) releaseNaiResultObjectUrl();
  });
