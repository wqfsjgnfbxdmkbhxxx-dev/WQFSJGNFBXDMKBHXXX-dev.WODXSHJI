  // ========== 图标更换 ==========

  async function handleIconChange(iconId, phoneType, itemElement) {
    const appName = itemElement.querySelector('.icon-preview').alt;

    const choice = await showChoiceModal(`更换"${appName}"图标`, [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    // 处理重置逻辑
    if (choice === 'reset') {
      const iconElement = itemElement.querySelector('.icon-preview');
      const defaultSrc = iconElement.dataset.defaultSrc;

      if (defaultSrc) {
        // 恢复到默认图标
        iconElement.src = defaultSrc;

        // 从对应的数据库对象中删除该记录
        if (phoneType === 'cphone') {
          if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) {
            delete state.globalSettings.cphoneAppIcons[iconId];
          }
        } else if (phoneType === 'myphone') {
          if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) {
            delete state.globalSettings.myphoneAppIcons[iconId];
          }
        } else {
          if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) {
            delete state.globalSettings.appIcons[iconId];
          }
        }

        await db.globalSettings.put(state.globalSettings);
        await showCustomAlert("成功", "已重置为默认图标！");
      } else {
        // 没有默认图标，重置为纯白色
        // 创建一个1x1的纯白色图片的Base64
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        iconElement.src = whitePixel;

        // 从对应的数据库对象中删除该记录
        if (phoneType === 'cphone') {
          if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) {
            delete state.globalSettings.cphoneAppIcons[iconId];
          }
        } else if (phoneType === 'myphone') {
          if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) {
            delete state.globalSettings.myphoneAppIcons[iconId];
          }
        } else {
          if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) {
            delete state.globalSettings.appIcons[iconId];
          }
        }

        await db.globalSettings.put(state.globalSettings);
        await showCustomAlert("成功", "没有默认信息，已重置为纯白！");
      }
      return;
    }

    let newUrl = null;
    let isBase64 = false;

    if (choice === 'local') {
      newUrl = await new Promise(resolve => { // 简化版 uploadImageLocally
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => resolve(readerEvent.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
      if (newUrl) isBase64 = true;

    } else if (choice === 'url') {
      let currentUrl;
      if (phoneType === 'cphone') {
        currentUrl = state.globalSettings.cphoneAppIcons[iconId];
      } else if (phoneType === 'myphone') {
        currentUrl = state.globalSettings.myphoneAppIcons[iconId];
      } else {
        currentUrl = state.globalSettings.appIcons[iconId];
      }
      const isCurrentUrlBase64 = currentUrl && currentUrl.startsWith('data:image');

      const initialValueForPrompt = isCurrentUrlBase64 ? '' : currentUrl;

      newUrl = await showCustomPrompt(`更换图标`, '请输入新的图片URL', initialValueForPrompt, 'url');


      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();


      itemElement.querySelector('.icon-preview').src = trimmedUrl;


      let dbPath;
      if (phoneType === 'cphone') {
        dbPath = `cphoneAppIcons.${iconId}`;
        state.globalSettings.cphoneAppIcons[iconId] = trimmedUrl;
      } else if (phoneType === 'myphone') {
        dbPath = `myphoneAppIcons.${iconId}`;
        state.globalSettings.myphoneAppIcons[iconId] = trimmedUrl;
      } else {
        dbPath = `appIcons.${iconId}`;
        state.globalSettings.appIcons[iconId] = trimmedUrl;
      }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "图标已更新！");


      if (isBase64) {
        (async () => {
          console.log(`[ImgBB] 启动 ${dbPath} 的静默上传...`);
          await silentlyUpdateDbUrl(
            db.globalSettings,
            'main',
            dbPath,
            trimmedUrl // The Base64 string
          );
        })();
      }
    } else if (newUrl !== null) {
      alert("请输入一个有效的URL或选择一个文件！");
    }
  }


