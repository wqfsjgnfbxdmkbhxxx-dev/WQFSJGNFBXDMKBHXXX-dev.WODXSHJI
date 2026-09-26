  // ============================================================
  // 以下来自 script.js 第二段（原始行范围：54517~55595）
  // ============================================================

  function removeApiHistoryFromChats(chatsArray) {
    if (!Array.isArray(chatsArray)) return chatsArray;
    
    // 创建深拷贝并移除apiHistory字段
    return chatsArray.map(chat => {
      const chatCopy = { ...chat };
      if (chatCopy.apiHistory) {
        delete chatCopy.apiHistory;
      }
      return chatCopy;
    });
  }

  async function exportDataAsSlicedZip() {

    if (!window.streamSaver || typeof JSZip === 'undefined') {
      await showCustomAlert("库加载失败", "无法启动导出，所需的核心库 (StreamSaver.js 或 JSZip) 未加载。请检查您的网络连接并刷新页面后重试。");
      return;
    }

    await showCustomAlert("正在准备分片导出...", "即将开始打包您的完整备份文件。文件将以ZIP格式流式下载，请勿关闭页面。");


    const fileStream = streamSaver.createWriteStream(`330-EPhone-Sliced-Backup-${new Date().toISOString().split('T')[0]}.zip`);
    const zip = new JSZip();


    const MAX_SLICE_SIZE = 95 * 1024 * 1024;
    let sliceIndex = 1;
    let currentSliceData = {};
    let currentSliceSizeBytes = 0;
    const encoder = new TextEncoder();

    try {
      const tablesToBackup = db.tables.filter(t => t.name !== 'mcpSecrets').map(t => t.name);

      for (const tableName of tablesToBackup) {
        console.log(`正在打包表: ${tableName}...`);
        let tableData = await db.table(tableName).toArray();

        // 方案3：导出时移除API历史记录
        if (tableName === 'chats') {
          tableData = removeApiHistoryFromChats(tableData);
        }

        if (tableData.length === 0) continue;

        const tableDataString = JSON.stringify(tableData);
        const tableDataSize = encoder.encode(tableDataString).length;


        if (tableDataSize > MAX_SLICE_SIZE) {
          console.warn(`警告：表 "${tableName}" (大小: ${(tableDataSize / 1024 / 1024).toFixed(2)}MB) 单独超过了切片限制。`);


          if (currentSliceSizeBytes > 0) {
            zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
              version: 4,
              type: 'slice',
              data: currentSliceData
            }));
            currentSliceData = {};
            currentSliceSizeBytes = 0;
          }


          currentSliceData[tableName] = tableData;
          zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
            version: 4,
            type: 'slice',
            data: currentSliceData
          }));
          currentSliceData = {};
          currentSliceSizeBytes = 0;

          continue;
        }


        if (currentSliceSizeBytes > 0 && (currentSliceSizeBytes + tableDataSize > MAX_SLICE_SIZE)) {
          console.log(`切片 ${sliceIndex} 已满 (大小: ${(currentSliceSizeBytes / 1024 / 1024).toFixed(2)}MB)，正在归档...`);


          zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
            version: 4,
            type: 'slice',
            data: currentSliceData
          }));


          currentSliceData = {};
          currentSliceSizeBytes = 0;
        }


        currentSliceData[tableName] = tableData;
        currentSliceSizeBytes += tableDataSize;
      }


      if (currentSliceSizeBytes > 0) {
        console.log(`正在归档最后一个切片 ${sliceIndex} (大小: ${(currentSliceSizeBytes / 1024 / 1024).toFixed(2)}MB)...`);
        zip.file(`slice_${sliceIndex}.json`, JSON.stringify({
          version: 4,
          type: 'slice',
          data: currentSliceData
        }));
      }
      
      // 导出情侣空间 localStorage 数据到单独的文件
      const coupleSpaceLocalStorage = exportCoupleSpaceLocalStorage();
      if (Object.keys(coupleSpaceLocalStorage).length > 0) {
        console.log('正在打包情侣空间 localStorage 数据...');
        zip.file('localStorage.json', JSON.stringify({
          version: 4,
          type: 'localStorage',
          data: coupleSpaceLocalStorage
        }));
      }

      console.log("所有切片已打包，开始流式下载ZIP...");


      const zipStream = zip.generateInternalStream({
        type: "blob",
        streamFiles: true
      });


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


      await showCustomAlert('导出已开始', '您的分片备份已开始下载。解压后，您可以使用"导入"功能，选择其中的 `slice_X.json` 文件进行增量恢复。');

    } catch (error) {
      console.error("分片导出过程中出错:", error);
      await showCustomAlert('导出失败', `在打包或写入文件流时发生错误: ${error.message}`);


      try {
        const writer = fileStream.getWriter();
        writer.abort(error);
      } catch (e) { }
    }
  }

  async function exportDataAsStream() {

    if (!window.streamSaver) {
      alert("流式下载库 (StreamSaver.js) 未加载。请检查网络连接或HTML文件配置。");
      return;
    }

    await showCustomAlert("正在准备...", "即将开始下载您的完整备份文件。下载过程中请勿关闭页面。");


    const fileStream = streamSaver.createWriteStream(`330-EPhone-Full-Backup-Streamed-${new Date().toISOString().split('T')[0]}.json`);
    const writer = fileStream.getWriter();
    const encoder = new TextEncoder();

    try {

      await writer.write(encoder.encode('{\n"version": 3,\n"timestamp": ' + Date.now() + ',\n"data": {\n'));

      const tablesToBackup = db.tables.filter(t => t.name !== 'mcpSecrets').map(t => t.name);

      for (let i = 0; i < tablesToBackup.length; i++) {
        const tableName = tablesToBackup[i];
        const table = db.table(tableName);


        await writer.write(encoder.encode(`"${tableName}": [\n`));

        let isFirstRecordInTable = true;

        await table.each(record => {
          if (!isFirstRecordInTable) {
            writer.write(encoder.encode(',\n'));
          }

          // 方案3：导出时移除API历史记录
          let recordToWrite = record;
          if (tableName === 'chats' && record.apiHistory) {
            recordToWrite = { ...record };
            delete recordToWrite.apiHistory;
          }

          writer.write(encoder.encode(JSON.stringify(recordToWrite)));
          isFirstRecordInTable = false;
        });


        await writer.write(encoder.encode('\n]'));
        if (i < tablesToBackup.length - 1) {

          await writer.write(encoder.encode(',\n'));
        }
      }
      
      // 导出情侣空间 localStorage 数据
      const coupleSpaceLocalStorage = exportCoupleSpaceLocalStorage();
      await writer.write(encoder.encode(',\n"localStorage": '));
      await writer.write(encoder.encode(JSON.stringify(coupleSpaceLocalStorage)));


      await writer.write(encoder.encode('\n}\n}'));

    } catch (error) {
      console.error("流式导出过程中出错:", error);
      await showCustomAlert('导出失败', `在写入文件流时发生错误: ${error.message}`);
    } finally {

      await writer.close();
    }
  }

  async function exportDataAsBlob() {
    await showCustomAlert("正在准备...", "正在读取所有数据到内存中，请稍候...");

    try {
      const backupData = {
        version: 3,
        timestamp: Date.now(),
        data: {}
      };

      const tablesToBackup = db.tables.filter(t => t.name !== 'mcpSecrets').map(t => t.name);

      for (const tableName of tablesToBackup) {
        let tableData = await db.table(tableName).toArray();
        
        // 方案3：导出时移除API历史记录
        if (tableName === 'chats') {
          tableData = removeApiHistoryFromChats(tableData);
        }
        
        backupData.data[tableName] = tableData;
        console.log(`已打包表: ${tableName}, 记录数: ${tableData.length}`);
      }
      
      // 导出情侣空间 localStorage 数据
      const coupleSpaceLocalStorage = exportCoupleSpaceLocalStorage();
      backupData.data.localStorage = coupleSpaceLocalStorage;

      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `330-EPhone-Full-Backup-Legacy-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await showCustomAlert('导出成功', '已成功导出所有数据！');

    } catch (error) {
      console.error("传统导出数据时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }

  // 供更新弹窗/崩溃恢复弹窗使用：先选备份方式再导出，避免卡在「正在准备」
  window.ephoneExportBackupFromPopup = async function () {
    if (typeof showChoiceModal !== 'function' || typeof exportDataAsBlob !== 'function') {
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('无法备份', '导出功能尚未加载完成，请稍候几秒再试。');
      } else {
        alert('导出功能尚未加载完成，请稍候几秒再试。');
      }
      return false;
    }
    // 若从更新弹窗内调用，其 z-index 很高，选择/导出过程弹窗会被挡住，故临时降低直到流程结束
    const updateOverlay = document.getElementById('update-notification-overlay');
    const prevZ = updateOverlay ? updateOverlay.style.zIndex : '';
    if (updateOverlay) updateOverlay.style.zIndex = '10000';
    try {
      const choice = await showChoiceModal('选择备份方式', [
        { text: '分片导出 (推荐，ZIP 包，大数据也稳定)', value: 'slice' },
        { text: '智能导出 (单个大文件，数据大时可能较慢)', value: 'stream' },
        { text: '传统导出 (兼容旧设备，单文件)', value: 'blob' }
      ]);
      if (!choice) return false;
      if (choice === 'slice') {
        await exportDataAsSlicedZip();
      } else if (choice === 'stream') {
        await exportDataAsStream();
      } else {
        await exportDataAsBlob();
      }
      return true;
    } catch (e) {
      console.error('[备份]', e);
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('备份失败', '导出时出错：' + (e && e.message ? e.message : String(e)));
      } else {
        alert('备份失败：' + (e && e.message ? e.message : String(e)));
      }
      return false;
    } finally {
      if (updateOverlay) updateOverlay.style.zIndex = prevZ || '999999';
    }
  };

