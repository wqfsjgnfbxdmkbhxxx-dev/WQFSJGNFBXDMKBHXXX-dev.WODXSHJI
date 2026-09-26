  // ========== 图片压缩 ==========

  async function compressAllLocalImages() {

    const confirmed = await showCustomConfirm(
      '确认压缩图片？',
      '此操作将扫描并压缩所有本地上传的图片（Base64格式），将其转换为JPEG以减小体积。这会轻微降低图片质量且【不可恢复】。<br><br><strong>强烈建议在操作前先进行数据备份！</strong>', {
      confirmButtonClass: 'btn-danger',
      confirmText: '我已了解风险，确认压缩'
    }
    );

    if (!confirmed) return;


    await showCustomAlert("请稍候...", "正在开始全面压缩图片，根据图片数量，这可能需要几分钟时间，请不要关闭或刷新页面...");

    let stats = {
      found: 0,
      compressed: 0,
      skipped: 0,
      originalSize: 0,
      newSize: 0
    };

    try {





      console.log("压缩步骤 1/3: 正在从数据库读取所有相关数据...");
      const tablesToScan = [
        'chats', 'globalSettings', 'qzoneSettings',
        'userStickers', 'customAvatarFrames'
      ];
      const allData = [];
      for (const tableName of tablesToScan) {
        const table = db.table(tableName);
        const records = await table.toArray();
        allData.push({
          tableName,
          records
        });
      }


      console.log("压缩步骤 2/3: 正在内存中异步压缩图片，这可能需要一些时间...");
      for (const data of allData) {
        for (const record of data.records) {

          await traverseAndCompress(record, stats);
        }
      }


      console.log("压缩步骤 3/3: 正在将压缩后的数据写回数据库...");
      await db.transaction('rw', tablesToScan, async () => {
        for (const data of allData) {

          await db.table(data.tableName).bulkPut(data.records);
        }
      });






      const reduction = stats.originalSize - stats.newSize;
      const reductionPercent = stats.originalSize > 0 ? (reduction / stats.originalSize * 100).toFixed(2) : 0;

      await showCustomAlert(
        '压缩完成！',
        `扫描完成！<br>
            - 共找到 ${stats.found} 张本地图片<br>
            - 成功压缩 ${stats.compressed} 张<br>
            - 跳过(已压缩或无需压缩) ${stats.skipped} 张<br>
            - 空间节省了 <strong>${(reduction / 1024 / 1024).toFixed(2)} MB</strong> (压缩率 ${reductionPercent}%)
            <br><br>
            建议刷新页面以应用所有更改。`
      );

    } catch (error) {
      console.error("图片压缩过程中发生错误:", error);
      await showCustomAlert('压缩失败', `操作失败: ${error.message}`);
    }
  }

  function calculateTotalSizeRecursive(obj, parentKey = '') {
    let totalSize = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string' && value.startsWith('data:image')) {


          const isExcluded =

            (parentKey === 'globalSettings' && (key === 'wallpaper' || key === 'cphoneWallpaper' || key === 'globalChatBackground')) ||

            (parentKey === 'widgetData') ||

            (parentKey === 'settings' && key === 'background') ||

            (parentKey === 'appIcons' || parentKey === 'cphoneAppIcons' || parentKey === 'myphoneAppIcons');

          if (!isExcluded) {
            totalSize += value.length;
          }


        } else if (typeof value === 'object' && value !== null) {

          totalSize += calculateTotalSizeRecursive(value, key);
        }
      }
    }
    return totalSize;
  }


  async function displayTotalImageSize() {
    const displayElement = document.getElementById('total-image-size-display');
    if (!displayElement) return;

    displayElement.innerHTML = `
        <span id="image-size-label">正在计算可压缩图片大小...</span>
        <span id="image-size-value">-- MB</span>
    `;

    try {
      let totalBytes = 0;
      const tablesToScan = [
        'chats', 'globalSettings', 'qzoneSettings',
        'userStickers', 'customAvatarFrames'
      ];

      for (const tableName of tablesToScan) {
        const table = db.table(tableName);
        await table.each(record => {

          totalBytes += calculateTotalSizeRecursive(record);
        });
      }

      const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

      displayElement.innerHTML = `
            <span id="image-size-label">本地图片(头像/表情/头像框/等)大小:</span>
            <span id="image-size-value"><strong>${totalMB} MB</strong></span>
        `;

    } catch (error) {
      console.error("计算图片总大小时出错:", error);
      displayElement.innerHTML = `
            <span id="image-size-label">计算图片大小时出错</span>
            <span id="image-size-value">Error</span>
        `;
    }
  }


  // ========== 清空聊天表情包消息 ==========

  let selectedCharsForStickerClear = [];

  async function openClearStickersModal() {
    const modal = document.getElementById('clear-stickers-modal');
    selectedCharsForStickerClear = [];
    
    // 计算并显示存储占用
    const statsEl = document.getElementById('sticker-storage-stats');
    statsEl.innerHTML = '正在计算...';
    
    const stats = await calculateChatStickerStorageSize();
    if (stats) {
      statsEl.innerHTML = `
        <div>聊天中总表情消息数：<strong>${stats.totalCount}</strong> 条</div>
        <div>• Base64表情消息：<strong>${stats.base64Count}</strong> 条 (<strong>${stats.totalMB} MB</strong>)</div>
        <div>• 网络URL表情消息：<strong>${stats.urlCount}</strong> 条 (不占本地空间)</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffc107;">
          💡 <strong>结论：</strong>${stats.base64Count > 0 ? `聊天中的Base64表情消息占用了 ${stats.totalMB} MB 本地存储空间` : '聊天中的表情消息没有占用本地存储空间'}
        </div>
      `;
    } else {
      statsEl.innerHTML = '<div style="color: #dc3545;">计算失败</div>';
    }

    await renderClearStickersList();
    modal.classList.add('visible');
  }

  async function calculateChatStickerStorageSize() {
    try {
      const allChats = await db.chats.toArray();
      let totalCount = 0;
      let base64Count = 0;
      let base64Size = 0;
      let urlCount = 0;

      for (const chat of allChats) {
        if (chat.history && Array.isArray(chat.history)) {
          for (const msg of chat.history) {
            // 检查是否是表情消息：有meaning字段或type==='sticker'
            const isSticker = msg.meaning || msg.type === 'sticker';
            if (isSticker && msg.content) {
              totalCount++;
              if (msg.content.startsWith('data:image')) {
                base64Count++;
                base64Size += msg.content.length;
              } else {
                urlCount++;
              }
            }
          }
        }
      }

      const totalMB = (base64Size / 1024 / 1024).toFixed(2);
      return {
        totalCount,
        base64Count,
        base64Size,
        totalMB,
        urlCount
      };
    } catch (error) {
      console.error('计算聊天表情包大小时出错:', error);
      return null;
    }
  }

  async function renderClearStickersList() {
    const listEl = document.getElementById('clear-stickers-category-list');
    listEl.innerHTML = '';

    const allChats = await db.chats.toArray();
    const chatsWithStickers = [];

    // 统计每个角色的表情消息数量和大小
    for (const chat of allChats) {
      if (chat.isGroup) continue; // 暂不支持群聊

      let stickerCount = 0;
      let totalSize = 0;
      let base64Count = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          const isSticker = msg.meaning || msg.type === 'sticker';
          if (isSticker && msg.content) {
            stickerCount++;
            if (msg.content.startsWith('data:image')) {
              base64Count++;
              totalSize += msg.content.length;
            }
          }
        }
      }

      if (stickerCount > 0) {
        chatsWithStickers.push({
          id: chat.id,
          name: chat.name,
          avatar: chat.settings?.aiAvatar || defaultAvatar,
          stickerCount,
          base64Count,
          totalSize
        });
      }
    }

    // 按表情数量排序
    chatsWithStickers.sort((a, b) => b.stickerCount - a.stickerCount);

    if (chatsWithStickers.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">聊天中没有发送过表情包消息</div>';
      return;
    }

    chatsWithStickers.forEach(chatInfo => {
      const sizeMB = (chatInfo.totalSize / 1024 / 1024).toFixed(2);
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.chatId = chatInfo.id;
      item.innerHTML = `
        <img src="${chatInfo.avatar}" class="avatar" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 500;">${chatInfo.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${chatInfo.stickerCount} 条表情消息 (Base64: ${chatInfo.base64Count}条, ${sizeMB} MB)
          </div>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  async function handleConfirmClearStickers() {
    if (selectedCharsForStickerClear.length === 0) {
      await showCustomAlert('提示', '请先选择要清空表情的角色');
      return;
    }

    const selectedItems = document.querySelectorAll('#clear-stickers-category-list .clear-posts-item.selected');
    const charNames = [];
    selectedItems.forEach(item => {
      const name = item.querySelector('div').textContent.trim();
      charNames.push(name);
    });

    const confirmed = await showCustomConfirm(
      '确认清空',
      `确定要清空以下 ${selectedCharsForStickerClear.length} 个角色的聊天表情包消息吗？\n\n${charNames.join('\n')}\n\n⚠️ 此操作不可恢复！仅删除表情消息，保留文字聊天记录。`,
      { confirmText: '确认清空', cancelText: '取消' }
    );

    if (!confirmed) return;

    try {
      await showCustomAlert('请稍候', '正在清空表情包消息...');

      let totalDeletedMessages = 0;
      let totalFreedSize = 0;

      for (const chatId of selectedCharsForStickerClear) {
        const chat = await db.chats.get(chatId);
        if (!chat || !chat.history) continue;

        const originalLength = chat.history.length;
        let deletedSize = 0;

        // 过滤掉表情消息
        chat.history = chat.history.filter(msg => {
          const isSticker = msg.meaning || msg.type === 'sticker';
          if (isSticker) {
            if (msg.content && msg.content.startsWith('data:image')) {
              deletedSize += msg.content.length;
            }
            return false; // 删除表情消息
          }
          return true; // 保留其他消息
        });

        const deletedCount = originalLength - chat.history.length;
        totalDeletedMessages += deletedCount;
        totalFreedSize += deletedSize;

        await db.chats.put(chat);
        
        // 更新 state
        if (state.chats[chatId]) {
          state.chats[chatId].history = chat.history;
        }
      }

      document.getElementById('clear-stickers-modal').classList.remove('visible');

      const freedMB = (totalFreedSize / 1024 / 1024).toFixed(2);
      await showCustomAlert(
        '清空完成', 
        `已成功删除 ${totalDeletedMessages} 条表情包消息！\n释放了约 ${freedMB} MB 存储空间。`
      );

      // 刷新当前聊天界面
      if (state.activeChatId && selectedCharsForStickerClear.includes(state.activeChatId)) {
        await renderChatScreen();
      }

      // 刷新存储大小显示
      displayTotalImageSize();
    } catch (error) {
      console.error('清空表情包消息时出错:', error);
      await showCustomAlert('清空失败', '操作过程中发生错误，请重试');
    }
  }


  // ========== 清空聊天图片 ==========

  let selectedCharsForImageClear = [];

  function openClearChatImagesModal() {
    const modal = document.getElementById('clear-chat-images-modal');
    selectedCharsForImageClear = [];

    renderClearChatImagesList();
    modal.classList.add('visible');
  }

  async function renderClearChatImagesList() {
    const listEl = document.getElementById('clear-chat-images-list');
    listEl.innerHTML = '';

    const allChats = await db.chats.toArray();
    const chatsWithImages = [];

    // 统计每个角色的图片数量和大小
    for (const chat of allChats) {
      if (chat.isGroup) continue;

      let imageCount = 0;
      let totalSize = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          // 检查 msg.images 格式（旧格式）
          if (msg.images && Array.isArray(msg.images)) {
            for (const img of msg.images) {
              if (typeof img === 'string' && img.startsWith('data:image')) {
                imageCount++;
                totalSize += img.length;
              }
            }
          }
          // 检查 msg.content 格式（新格式：图片上传）
          if (Array.isArray(msg.content)) {
            for (const item of msg.content) {
              if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                const url = item.image_url.url;
                if (typeof url === 'string' && url.startsWith('data:image')) {
                  imageCount++;
                  totalSize += url.length;
                }
              }
            }
          }
        }
      }

      if (imageCount > 0) {
        chatsWithImages.push({
          id: chat.id,
          name: chat.name,
          imageCount: imageCount,
          totalSize: totalSize
        });
      }
    }

    if (chatsWithImages.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">没有找到包含本地图片的聊天角色</p>';
      return;
    }

    // 按图片数量降序排列
    chatsWithImages.sort((a, b) => b.imageCount - a.imageCount);

    chatsWithImages.forEach(chat => {
      const sizeMB = (chat.totalSize / 1024 / 1024).toFixed(2);
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.charId = chat.id;
      item.innerHTML = `
        <div class="checkbox"></div>
        <div>
          <span class="name">${chat.name}</span>
          <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${chat.imageCount} 张图片，占用 ${sizeMB} MB</p>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  async function handleConfirmClearChatImages() {
    const selectedItems = document.querySelectorAll('#clear-chat-images-list .clear-posts-item.selected');

    if (selectedItems.length === 0) {
      alert("请至少选择一个角色。");
      return;
    }

    selectedCharsForImageClear = Array.from(selectedItems).map(item => item.dataset.charId);

    const confirmed = await showCustomConfirm(
      '确认清空图片？',
      `即将清空 <strong>${selectedCharsForImageClear.length}</strong> 个角色的所有聊天本地图片。<br><br>此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在清空图片，请不要关闭页面...");

    try {
      let stats = {
        chatsProcessed: 0,
        imagesCleared: 0,
        sizeFreed: 0
      };

      await db.transaction('rw', db.chats, async () => {
        for (const chatId of selectedCharsForImageClear) {
          const chat = await db.chats.get(chatId);
          if (!chat) continue;

          if (chat.history && Array.isArray(chat.history)) {
            for (const msg of chat.history) {
              // 清空 msg.images 格式（旧格式）
              if (msg.images && Array.isArray(msg.images)) {
                for (const img of msg.images) {
                  if (typeof img === 'string' && img.startsWith('data:image')) {
                    stats.imagesCleared++;
                    stats.sizeFreed += img.length;
                  }
                }
                msg.images = [];
              }
              // 清空 msg.content 中的图片（新格式）
              if (Array.isArray(msg.content)) {
                const newContent = [];
                for (const item of msg.content) {
                  if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                    const url = item.image_url.url;
                    if (typeof url === 'string' && url.startsWith('data:image')) {
                      stats.imagesCleared++;
                      stats.sizeFreed += url.length;
                      // 不添加到 newContent，即删除该图片
                    } else {
                      newContent.push(item);
                    }
                  } else {
                    newContent.push(item);
                  }
                }
                msg.content = newContent;
              }
            }
          }

          await db.chats.put(chat);
          stats.chatsProcessed++;
        }
      });

      const freedMB = (stats.sizeFreed / 1024 / 1024).toFixed(2);

      document.getElementById('clear-chat-images-modal').classList.remove('visible');

      // 清空成功，询问用户是否刷新页面
      const shouldRefresh = await showCustomConfirm(
        '清空完成',
        `已成功清空 ${stats.chatsProcessed} 个角色的聊天图片。<br>
        清空了 ${stats.imagesCleared} 张图片<br>
        释放了 <strong>${freedMB} MB</strong> 空间<br><br>
        是否立即刷新页面以使更改生效？<br>
        <span style="color: #666; font-size: 14px;">（点击"取消"可以继续进行其他操作）</span>`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        // 用户选择刷新页面
        location.reload();
      } else {
        // 用户选择不刷新，尝试局部刷新
        if (state.currentChatId && selectedCharsForImageClear.includes(state.currentChatId)) {
          await loadChat(state.currentChatId);
        }
      }

    } catch (error) {
      console.error("清空图片时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }


  // ========== 清空聊天HTML ==========

  let selectedChatsForHtmlClear = [];

  function isRawHtmlContent(content) {
    if (typeof content !== 'string') return false;
    const trimmed = content.trim();
    return trimmed.startsWith('<') && trimmed.endsWith('>');
  }

  function stripHtmlTags(html) {
    if (typeof html !== 'string') return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }

  function openClearChatHtmlModal() {
    const modal = document.getElementById('clear-chat-html-modal');
    selectedChatsForHtmlClear = [];
    document.getElementById('select-all-chats-for-html-clear').checked = false;
    
    renderClearChatHtmlList();
    modal.classList.add('visible');
  }

  async function renderClearChatHtmlList() {
    const listEl = document.getElementById('clear-chat-html-list');
    listEl.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">正在扫描...</p>';

    const allChats = await db.chats.toArray();
    const chatsWithHtml = [];

    for (const chat of allChats) {
      let htmlMsgCount = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          if (isRawHtmlContent(msg.content)) {
            htmlMsgCount++;
          }
        }
      }

      if (htmlMsgCount > 0) {
        chatsWithHtml.push({
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup || false,
          htmlMsgCount: htmlMsgCount
        });
      }
    }

    if (chatsWithHtml.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">没有找到包含HTML内容的聊天</p>';
      return;
    }

    chatsWithHtml.sort((a, b) => b.htmlMsgCount - a.htmlMsgCount);

    listEl.innerHTML = '';
    chatsWithHtml.forEach(chat => {
      const typeLabel = chat.isGroup ? '群聊' : '单聊';
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.chatId = chat.id;
      item.innerHTML = `
        <div class="checkbox"></div>
        <div>
          <span class="name">${chat.name}</span>
          <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${typeLabel} · ${chat.htmlMsgCount} 条HTML消息</p>
        </div>
      `;
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
        updateHtmlClearSelection();
      });
      listEl.appendChild(item);
    });
  }

  function updateHtmlClearSelection() {
    const allItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item');
    const selectedItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item.selected');
    document.getElementById('select-all-chats-for-html-clear').checked = allItems.length > 0 && allItems.length === selectedItems.length;
  }

  async function handleConfirmClearChatHtml() {
    const selectedItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item.selected');

    if (selectedItems.length === 0) {
      alert("请至少选择一个聊天。");
      return;
    }

    selectedChatsForHtmlClear = Array.from(selectedItems).map(item => item.dataset.chatId);
    
    const clearMode = document.querySelector('input[name="html-clear-mode"]:checked').value;
    const modeText = clearMode === 'strip' ? '剥离HTML标签（保留文本）' : '直接删除消息';

    const confirmed = await showCustomConfirm(
      '确认清空HTML？',
      `即将处理 <strong>${selectedChatsForHtmlClear.length}</strong> 个聊天的HTML内容。<br><br>
      清理模式：<strong>${modeText}</strong><br><br>
      此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在清空HTML内容，请不要关闭页面...");

    try {
      let stats = {
        chatsProcessed: 0,
        msgsProcessed: 0,
        msgsDeleted: 0
      };

      await db.transaction('rw', db.chats, async () => {
        for (const chatId of selectedChatsForHtmlClear) {
          const chat = await db.chats.get(chatId);
          if (!chat) continue;

          if (chat.history && Array.isArray(chat.history)) {
            if (clearMode === 'delete') {
              const originalLength = chat.history.length;
              chat.history = chat.history.filter(msg => {
                if (isRawHtmlContent(msg.content)) {
                  stats.msgsDeleted++;
                  return false;
                }
                return true;
              });
              stats.msgsProcessed += (originalLength - chat.history.length);
            } else {
              for (const msg of chat.history) {
                if (isRawHtmlContent(msg.content)) {
                  msg.content = stripHtmlTags(msg.content);
                  stats.msgsProcessed++;
                }
              }
            }
          }

          await db.chats.put(chat);
          stats.chatsProcessed++;
        }
      });

      document.getElementById('clear-chat-html-modal').classList.remove('visible');

      const resultText = clearMode === 'delete' 
        ? `删除了 ${stats.msgsDeleted} 条HTML消息`
        : `处理了 ${stats.msgsProcessed} 条HTML消息（已剥离标签）`;

      const shouldRefresh = await showCustomConfirm(
        '清空完成',
        `已成功处理 ${stats.chatsProcessed} 个聊天的HTML内容。<br>
        ${resultText}<br><br>
        是否立即刷新页面以使更改生效？<br>
        <span style="color: #666; font-size: 14px;">（点击"取消"可以继续进行其他操作）</span>`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        location.reload();
      } else {
        if (state.currentChatId && selectedChatsForHtmlClear.includes(state.currentChatId)) {
          await loadChat(state.currentChatId);
        }
      }

    } catch (error) {
      console.error("清空HTML时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }


