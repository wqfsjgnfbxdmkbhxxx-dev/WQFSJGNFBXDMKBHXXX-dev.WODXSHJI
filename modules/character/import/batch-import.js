  async function handleCardImport(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    try {
      // 如果只有一个文件，使用旧的单文件导入流程
      if (files.length === 1) {
        await importSingleCard(files[0]);
        event.target.value = null;
        return;
      }

      // 多文件：显示批量导入预览
      await showBatchImportPreview(files);

    } catch (error) {
      console.error("角色卡导入失败:", error);
      await showCustomAlert("导入失败", `无法解析角色卡文件。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  // 单个文件导入（支持酒馆AI和小手机格式）
  async function importSingleCard(file) {
    try {
      let cardData;
      let avatarBase64 = null;

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);

        // 检测是否为小手机专属格式
        if (parsed.type === 'EPhoneCharacterExport') {
          await importEPhoneCharacter(parsed);
          return;
        }

        cardData = parsed;
      } else if (file.name.endsWith('.png')) {
        const arrayBuffer = await file.arrayBuffer();

        // 同时检测ephone和chara两种格式
        const formats = await parsePngForAllFormats(arrayBuffer);

        if (formats.ephone && formats.ephone.type === 'EPhoneCharacterExport') {
          // 小手机格式：读取PNG作为头像
          avatarBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });

          // 处理ImgBB上传
          if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
            try {
              await showCustomAlert("请稍候...", "正在上传角色头像到 ImgBB...");
              avatarBase64 = await uploadImageToImgBB(avatarBase64);
            } catch (uploadError) {
              console.error(uploadError);
              await showCustomAlert("ImgBB 上传失败", `头像上传失败: ${uploadError.message}\n\n将继续使用本地 Base64 格式保存。`);
            }
          }

          await importEPhoneCharacter(formats.ephone, avatarBase64);
          return;
        }

        if (formats.chara) {
          cardData = formats.chara;
        } else {
          throw new Error("在PNG文件中未找到有效的角色数据。");
        }

        avatarBase64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = async (readerEvent) => {
            let base64Result = readerEvent.target.result;

            if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
              try {
                await showCustomAlert("请稍候...", "正在上传角色卡封面到 ImgBB...");
                const imageUrl = await uploadImageToImgBB(base64Result);
                resolve(imageUrl);
              } catch (uploadError) {
                console.error(uploadError);
                await showCustomAlert("ImgBB 上传失败", `封面上传失败: ${uploadError.message}\n\n将继续使用本地 Base64 格式保存。`);
                resolve(base64Result);
              }
            } else {
              resolve(base64Result);
            }
          };
          reader.readAsDataURL(file);
        });
      } else {
        throw new Error("不支持的文件格式。请选择 .json 或 .png 文件。");
      }

      await createChatFromCardData(cardData, avatarBase64);

    } catch (error) {
      throw error;
    }
  }

  // 显示批量导入预览界面
  async function showBatchImportPreview(files) {
    const modal = document.getElementById('batch-import-preview-modal');
    const listContainer = document.getElementById('batch-import-preview-list');

    if (!modal || !listContainer) {
      console.error('批量导入预览模态框未找到');
      return;
    }

    // 显示加载提示
    listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">正在解析角色卡...</p>';
    modal.style.display = 'flex';

    // 解析所有文件
    pendingImportCards = [];
    const parsePromises = files.map(async (file, index) => {
      try {
        let cardData;
        let avatarBase64 = null;
        let fileType = file.name.endsWith('.png') ? 'png' : 'json';
        let isEPhoneFormat = false;
        let ephoneExportData = null;

        if (fileType === 'json') {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed.type === 'EPhoneCharacterExport') {
            isEPhoneFormat = true;
            ephoneExportData = parsed;
            cardData = { name: parsed.chatData?.name, data: { name: parsed.chatData?.name, description: parsed.chatData?.settings?.aiPersona || '' } };
          } else {
            cardData = parsed;
          }
        } else if (fileType === 'png') {
          const arrayBuffer = await file.arrayBuffer();
          const formats = await parsePngForAllFormats(arrayBuffer);

          if (formats.ephone && formats.ephone.type === 'EPhoneCharacterExport') {
            isEPhoneFormat = true;
            ephoneExportData = formats.ephone;
            cardData = { name: formats.ephone.chatData?.name, data: { name: formats.ephone.chatData?.name, description: formats.ephone.chatData?.settings?.aiPersona || '' } };
          } else if (formats.chara) {
            cardData = formats.chara;
          } else {
            throw new Error("在PNG文件中未找到有效的角色数据。");
          }

          // 读取PNG作为base64
          avatarBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
        }

        return {
          id: `import_${Date.now()}_${index}`,
          fileName: file.name,
          fileType: fileType,
          cardData: cardData,
          avatarBase64: avatarBase64,
          selected: true,
          parseSuccess: true,
          isEPhoneFormat: isEPhoneFormat,
          ephoneExportData: ephoneExportData
        };
      } catch (error) {
        console.error(`解析失败: ${file.name}`, error);
        return {
          id: `import_${Date.now()}_${index}`,
          fileName: file.name,
          fileType: file.name.endsWith('.png') ? 'png' : 'json',
          error: error.message,
          selected: false,
          parseSuccess: false
        };
      }
    });

    pendingImportCards = await Promise.all(parsePromises);
    renderBatchImportPreview();
  }

  // 渲染批量导入预览列表
  function renderBatchImportPreview() {
    const listContainer = document.getElementById('batch-import-preview-list');
    if (!listContainer) return;

    if (pendingImportCards.length === 0) {
      listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">没有可导入的角色卡</p>';
      return;
    }

    listContainer.innerHTML = pendingImportCards.map(card => {
      if (!card.parseSuccess) {
        return `
          <div class="list-item" style="padding: 15px; border-bottom: 1px solid var(--border-color); opacity: 0.5;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <input type="checkbox" disabled style="width: 20px; height: 20px;">
              <div style="width: 60px; height: 60px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999;">
                ❌
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: #f44;">${escapeHtml(card.fileName)}</div>
                <div style="font-size: 13px; color: #f44; margin-top: 5px;">解析失败: ${escapeHtml(card.error)}</div>
              </div>
            </div>
          </div>
        `;
      }

      const name = card.cardData.name || card.cardData.data?.name || '未命名角色';
      const description = card.cardData.description || card.cardData.data?.description || '';
      const previewDesc = description.substring(0, 100) + (description.length > 100 ? '...' : '');
      const avatarSrc = card.avatarBase64 || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';

      return `
        <div class="list-item" style="padding: 15px; border-bottom: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 15px;">
            <input type="checkbox" 
                   class="batch-import-card-checkbox" 
                   data-card-id="${card.id}" 
                   ${card.selected ? 'checked' : ''}
                   style="width: 20px; height: 20px;">
            <img src="${avatarSrc}" 
                 style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;"
                 onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 5px;">${escapeHtml(name)}</div>
              <div style="font-size: 13px; color: #666; margin-bottom: 5px;">${escapeHtml(previewDesc)}</div>
              <div style="font-size: 12px; color: #999;">
                <span style="background: #e3f2fd; padding: 2px 8px; border-radius: 4px; margin-right: 5px;">${card.fileType.toUpperCase()}</span>
                ${card.isEPhoneFormat ? '<span style="background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; margin-right: 5px;">小手机</span>' : ''}
                ${escapeHtml(card.fileName)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定复选框事件
    document.querySelectorAll('.batch-import-card-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const cardId = e.target.dataset.cardId;
        const card = pendingImportCards.find(c => c.id === cardId);
        if (card) {
          card.selected = e.target.checked;
        }
        updateSelectAllCheckbox();
      });
    });

    updateSelectAllCheckbox();
  }

  // 更新全选复选框状态
  function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-import-cards');
    if (!selectAllCheckbox) return;

    const successCards = pendingImportCards.filter(c => c.parseSuccess);
    const selectedCount = successCards.filter(c => c.selected).length;

    selectAllCheckbox.checked = selectedCount === successCards.length && successCards.length > 0;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < successCards.length;
  }

  // 确认批量导入
  async function confirmBatchImport() {
    const selectedCards = pendingImportCards.filter(c => c.selected && c.parseSuccess);

    if (selectedCards.length === 0) {
      await showCustomAlert("提示", "请至少选择一个角色卡进行导入");
      return;
    }

    // 关闭预览模态框
    const modal = document.getElementById('batch-import-preview-modal');
    if (modal) modal.style.display = 'none';

    // 显示进度提示
    const progressDiv = document.createElement('div');
    progressDiv.id = 'batch-import-progress';
    progressDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10001;
      text-align: center;
      min-width: 300px;
    `;
    document.body.appendChild(progressDiv);

    let successCount = 0;
    let failCount = 0;
    const failedCards = [];

    for (let i = 0; i < selectedCards.length; i++) {
      const card = selectedCards[i];

      // 更新进度显示
      progressDiv.innerHTML = `
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px;">正在导入角色卡</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 10px;">
          ${i + 1} / ${selectedCards.length}
        </div>
        <div style="font-size: 14px; color: #999;">
          ${escapeHtml(card.fileName)}
        </div>
        <div style="margin-top: 15px; width: 100%; height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
          <div style="width: ${((i + 1) / selectedCards.length * 100)}%; height: 100%; background: #4CAF50; transition: width 0.3s;"></div>
        </div>
      `;

      try {
        // 处理ImgBB上传（仅针对PNG）
        let finalAvatar = card.avatarBase64;
        if (card.fileType === 'png' && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
          try {
            finalAvatar = await uploadImageToImgBB(card.avatarBase64);
          } catch (uploadError) {
            console.error('ImgBB上传失败，使用本地Base64:', uploadError);
          }
        }

        // 小手机格式走专属导入逻辑
        if (card.isEPhoneFormat && card.ephoneExportData) {
          await importEPhoneCharacter(card.ephoneExportData, finalAvatar, true);
        } else {
          await createChatFromCardData(card.cardData, finalAvatar);
        }
        successCount++;
      } catch (error) {
        console.error(`导入失败: ${card.fileName}`, error);
        failCount++;
        failedCards.push({
          name: card.fileName,
          error: error.message
        });
      }

      // 添加小延迟，让用户看到进度
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 移除进度提示
    document.body.removeChild(progressDiv);

    // 显示结果
    let message = `✓ 成功导入 ${successCount} 个角色`;
    if (failCount > 0) {
      message += `\n✗ 失败 ${failCount} 个`;
      if (failedCards.length <= 3) {
        message += '\n\n失败列表：';
        failedCards.forEach(fc => {
          message += `\n• ${fc.name}: ${fc.error}`;
        });
      }
    }
    await showCustomAlert("导入完成", message);

    // 清空待导入列表
    pendingImportCards = [];

    // 刷新聊天列表
    if (typeof renderChatList === 'function') {
      renderChatList();
    }
  }

  // 取消批量导入
  function cancelBatchImport() {
    const modal = document.getElementById('batch-import-preview-modal');
    if (modal) modal.style.display = 'none';
    pendingImportCards = [];
  }


