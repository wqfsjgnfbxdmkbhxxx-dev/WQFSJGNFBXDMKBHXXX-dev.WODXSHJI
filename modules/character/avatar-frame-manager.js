// ============================================================
// 头像框管理（async版本，含自定义上传）(原 script.js 第 47397~47596 行)
// ============================================================

  async function populateFrameGrids(isForMember = false, memberAvatar = null, memberFrame = null) {
    const aiFrameGrid = document.getElementById('ai-frame-grid');
    const myFrameGrid = document.getElementById('my-frame-grid');
    const chat = state.chats[state.activeChatId];
    aiFrameGrid.innerHTML = '';
    myFrameGrid.innerHTML = '';


    const customFrames = await db.customAvatarFrames.toArray();

    const allFrames = [...avatarFrames, ...customFrames];

    document.querySelector('#avatar-frame-modal .frame-tabs').style.display = isForMember ? 'none' : 'flex';
    document.getElementById('ai-frame-content').style.display = 'block';
    document.getElementById('my-frame-content').style.display = 'none';
    document.getElementById('ai-frame-tab').classList.add('active');
    document.getElementById('my-frame-tab').classList.remove('active');

    if (isForMember) {
      allFrames.forEach(frame => {
        const item = createFrameItem(frame, 'my', memberAvatar);
        if (frame.url === memberFrame) {
          item.classList.add('selected');
        }
        aiFrameGrid.appendChild(item);
      });
    } else {
      const aiAvatarForPreview = chat.settings.aiAvatar || defaultAvatar;
      const myAvatarForPreview = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
      allFrames.forEach(frame => {
        const aiItem = createFrameItem(frame, 'ai', aiAvatarForPreview);
        if (frame.url === currentFrameSelection.ai) aiItem.classList.add('selected');
        aiFrameGrid.appendChild(aiItem);

        const myItem = createFrameItem(frame, 'my', myAvatarForPreview);
        if (frame.url === currentFrameSelection.my) myItem.classList.add('selected');
        myFrameGrid.appendChild(myItem);
      });
    }
  }


  function createFrameItem(frame, type, previewAvatarSrc) {
    const item = document.createElement('div');
    item.className = 'frame-item';
    item.dataset.frameUrl = frame.url;
    item.title = frame.name;

    const isCustom = typeof frame.id === 'number';
    const deleteButtonHtml = isCustom ? `<button class="delete-btn" data-id="${frame.id}" style="display:block;">×</button>` : '';

    item.innerHTML = `
        ${deleteButtonHtml}
        <img src="${previewAvatarSrc}" class="preview-avatar">
        ${frame.url ? `<img src="${frame.url}" class="preview-frame">` : ''}
    `;


    item.addEventListener('click', (e) => {

      if (e.target.classList.contains('delete-btn')) {
        return;
      }


      if (isFrameManagementMode) {

        if (isCustom) {
          const frameId = parseInt(frame.id);
          item.classList.toggle('selected');
          if (selectedFrames.has(frameId)) {
            selectedFrames.delete(frameId);
          } else {
            selectedFrames.add(frameId);
          }
          updateDeleteFrameButton();
        }
      } else {

        currentFrameSelection[type] = frame.url;
        const grid = type === 'ai' ? document.getElementById('ai-frame-grid') : document.getElementById('my-frame-grid');
        grid.querySelectorAll('.frame-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      }
    });

    return item;
  }



  async function handleUploadFrame() {
    const fileInput = document.getElementById('custom-frame-upload-input');

    const file = await new Promise(resolve => {
      const changeHandler = (e) => {
        resolve(e.target.files[0] || null);
        fileInput.removeEventListener('change', changeHandler);
      };
      fileInput.addEventListener('change', changeHandler, {
        once: true
      });
      fileInput.click();
    });

    if (!file) return;

    const name = await showCustomPrompt("命名头像框", "请为这个新头像框起个名字");
    if (!name || !name.trim()) return;

    const trimmedName = name.trim();

    const base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async (readerEvent) => {
        resolve(readerEvent.target.result);
      };
      reader.readAsDataURL(file);
    });

    const newFrame = {
      name: trimmedName,
      url: base64Url
    };
    const newId = await db.customAvatarFrames.add(newFrame);

    populateFrameGrids(editingFrameForMember);
    await showCustomAlert("添加成功！", `头像框"${trimmedName}"已添加。\n\n图片将在后台静默上传到图床...`);

    // 【【【已修复的调用】】】
    (async () => {
      await silentlyUpdateDbUrl(
        db.customAvatarFrames, // table
        newId, // recordId
        'url', // pathString (指向简单属性)
        base64Url // base64ToFind
        // nameToMatch (不需要)
      );
    })();
  }


  async function handleBatchUploadFrames() {
    const placeholder = `请按照以下格式粘贴，一行一个：\n\n头像框名字1: https://.../image1.png\n头像框名字2: https://.../image2.gif`;
    const pastedText = await showCustomPrompt("批量导入头像框", "从完整链接批量导入", "", 'textarea', `<p style="font-size:12px;color:#888;">${placeholder}</p>`);

    if (!pastedText || !pastedText.trim()) return;

    const lines = pastedText.trim().split('\n');
    const newFrames = [];
    let errorCount = 0;

    for (const line of lines) {

      const match = line.match(/^(.+?)[:：]\s*(https?:\/\/.+)$/);
      if (match) {
        newFrames.push({
          name: match[1].trim(),
          url: match[2].trim()
        });
      } else if (line.trim()) {
        errorCount++;
      }
    }

    if (newFrames.length > 0) {
      await db.customAvatarFrames.bulkAdd(newFrames);
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert("导入成功", `成功导入 ${newFrames.length} 个新头像框！`);
    }

    if (errorCount > 0) {
      await showCustomAlert("部分失败", `有 ${errorCount} 行格式不正确，已被忽略。`);
    }
  }

  async function handleDeleteCustomFrame(frameId) {
    const frame = await db.customAvatarFrames.get(frameId);
    if (!frame) return;

    const confirmed = await showCustomConfirm(
      "确认删除",
      `确定要删除头像框 "${frame.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      await db.customAvatarFrames.delete(frameId);
      populateFrameGrids(editingFrameForMember);
    }
  }


