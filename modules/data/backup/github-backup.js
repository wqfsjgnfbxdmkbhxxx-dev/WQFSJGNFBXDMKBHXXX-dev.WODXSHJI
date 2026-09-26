  // ========== 从 script.js 迁移：GitHub 备份功能 ==========
  
  // 解决中文 Base64 编码问题的辅助函数
  function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  function b64_to_utf8(str) {
    return decodeURIComponent(escape(window.atob(str)));
  }

  async function uploadToGitHub(isSilent = false) {
    let loadingToast = null;
    // --- 1. 基础配置检查 ---
    if (!state.apiConfig.githubEnable) {
      if (!isSilent) await showCustomAlert('未开启', '请先在"API设置" -> "GitHub 云备份"中开启此功能。');
      return;
    }

    const username = state.apiConfig.githubUsername;
    const repo = state.apiConfig.githubRepo;
    const token = state.apiConfig.githubToken;
    const baseFilename = (state.apiConfig.githubFilename || 'ephone_backup').replace(/\.json$/i, '');

    if (!username || !repo || !token) {
      if (!isSilent) await showCustomAlert("配置缺失", "请先在设置中保存 GitHub 用户名、仓库名和 Token！");
      return;
    }

    // --- 2. 确认提示 ---
    if (!isSilent) {
      const confirmed = await showCustomConfirm(
        '确认上传备份',
        `即将备份数据到 GitHub 仓库：<br><strong>${username}/${repo}</strong><br><br>采用<strong style="color:green">流式上传</strong> 模式。<br>速度将显著提升。<br>确定要立即上传吗？`,
        { confirmText: '开始极速上传' }
      );
      if (!confirmed) return;
      await showCustomAlert("准备中...", "正在初始化并发上传...");
    } else {
      console.log("⏳ [自动备份] 开始后台静默备份到 GitHub...");

      loadingToast = showToast('正在云端备份...', 'loading');
    }

    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const folderPath = `backups/${dateStr}/`;

      // 【核心设置】
      const RAW_SIZE_LIMIT = 15 * 1024 * 1024;

      // 2. 增大数据库读取批次：加快读取速度
      const DB_BATCH_SIZE = 50;

      // 3. 增加并发数：同时上传 6 个分片 (GitHub API 通常允许较高并发)
      const MAX_CONCURRENT_UPLOADS = 4;

      let currentSliceIndex = 1;
      let currentSliceData = {};
      let currentSliceRawSize = 0;

      // 并发控制队列
      const activeUploads = new Set();
      const errors = []; // 收集错误

      // --- 内部函数：执行单个分片上传 (独立作用域) ---
      const triggerUploadTask = async (partIndex, dataSnapshot) => {
        const partFilename = `${baseFilename}_part${partIndex}.json`;
        const finalPath = `${folderPath}${partFilename}`;

        // 构造分片对象
        const fileContentObj = {
          version: 4,
          timestamp: Date.now(),
          type: 'slice',
          part: partIndex,
          data: dataSnapshot
        };

        const contentString = JSON.stringify(fileContentObj);
        const contentBase64 = utf8_to_b64(contentString);
        const uploadSizeMB = (contentBase64.length / 1024 / 1024).toFixed(2);

        if (!isSilent) {
          // 更新 UI 显示当前正在进行的任务数量
          const modalBody = document.getElementById('custom-modal-body');
          if (modalBody) {
            modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div>
                    <p style="text-align:center;">
                        正在并发上传中...<br>
                        当前队列: <b>${activeUploads.size + 1}</b> / ${MAX_CONCURRENT_UPLOADS}<br>
                        正在处理分片: #${partIndex} (${uploadSizeMB} MB)
                    </p>`;
          }
        } else {
          console.log(`[GitHub] 开始上传分片 #${partIndex}...`);
        }

        // API URL
        let apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${finalPath}`;
        if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
          const relativePath = apiUrl.replace("https://api.github.com", "");
          apiUrl = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
        }

        // --- 步骤 A: 获取 SHA ---
        let sha = null;
        try {
          const checkUrl = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          const getRes = await fetch(checkUrl, {
            method: 'GET',
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
          }
        } catch (e) { console.warn(`分片 #${partIndex} 获取SHA失败(可能是新文件)，继续上传`, e); }

        // --- 步骤 B: 上传 (带重试) ---
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let lastError = null;

        while (!success && retryCount < maxRetries) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000); // 3分钟超时

          try {
            const putRes = await fetch(apiUrl, {
              method: 'PUT',
              headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `Auto Backup: ${dateStr} (Part ${partIndex})`,
                content: contentBase64,
                sha: sha || undefined
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!putRes.ok) {
              const err = await putRes.json();
              throw new Error(err.message || putRes.statusText);
            }

            success = true;
            console.log(`✅ [GitHub] 分片 #${partIndex} 上传成功`);

          } catch (err) {
            clearTimeout(timeoutId);
            lastError = err;
            retryCount++;
            console.warn(`⚠️ 分片 #${partIndex} 第 ${retryCount} 次重试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!success) {
          throw new Error(`分片 #${partIndex} 最终失败: ${lastError.message}`);
        }
      };

      // --- 3. 流式遍历数据库 ---
      const tablesToBackup = db.tables.filter(t => t.name !== 'mcpSecrets').map(t => t.name);

      for (const tableName of tablesToBackup) {
        const totalCount = await db.table(tableName).count();
        if (totalCount === 0) continue;

        let offset = 0;

        while (offset < totalCount) {
          const batch = await db.table(tableName).offset(offset).limit(DB_BATCH_SIZE).toArray();

          for (const record of batch) {
            const recordStr = JSON.stringify(record);
            const recordSize = recordStr.length + tableName.length + 5;

            // 检查是否需要切片
            if (currentSliceRawSize + recordSize > RAW_SIZE_LIMIT) {

              // --- 核心并发逻辑 ---
              // 1. 创建当前数据的快照 (深拷贝或直接引用，这里直接用引用因为下面会重置变量)
              const dataSnapshot = currentSliceData;
              const indexSnapshot = currentSliceIndex;

              // 2. 创建 Promise 任务
              const taskPromise = triggerUploadTask(indexSnapshot, dataSnapshot).catch(err => {
                console.error(err);
                errors.push(err.message);
              });

              // 3. 加入队列
              activeUploads.add(taskPromise);
              // 任务完成后从队列移除
              taskPromise.finally(() => activeUploads.delete(taskPromise));

              // 4. 如果队列满了，等待最早的一个完成 (Promise.race)
              if (activeUploads.size >= MAX_CONCURRENT_UPLOADS) {
                await Promise.race(activeUploads);
              }

              // 5. 如果有错误，立即停止
              if (errors.length > 0) break;

              // 6. 重置容器
              currentSliceData = {};
              currentSliceRawSize = 0;
              currentSliceIndex++;
            }

            if (!currentSliceData[tableName]) {
              currentSliceData[tableName] = [];
            }
            currentSliceData[tableName].push(record);
            currentSliceRawSize += recordSize;
          }

          if (errors.length > 0) break;
          offset += DB_BATCH_SIZE;
        }
        if (errors.length > 0) break;
      }

      // --- 4. 处理最后一个分片 ---
      if (currentSliceRawSize > 0 && errors.length === 0) {
        const taskPromise = triggerUploadTask(currentSliceIndex, currentSliceData).catch(err => {
          errors.push(err.message);
        });
        activeUploads.add(taskPromise);
      }

      // --- 5. 等待所有剩余任务完成 ---
      if (!isSilent) {
        const modalBody = document.getElementById('custom-modal-body');
        if (modalBody) modalBody.innerHTML += `<p style="color:blue">正在等待最后 ${activeUploads.size} 个分片完成...</p>`;
      }

      await Promise.all(activeUploads);

      // --- 6. 结果处理 ---
      if (errors.length > 0) {
        throw new Error(`上传过程中出现错误:\n${errors.join('\n')}`);
      }

      if (!isSilent) {
        await showCustomAlert(
          "✅ 备份成功",
          `全量数据并发上传完成！<br>共上传 ${currentSliceIndex} 个分片。<br><strong>路径：</strong> ${folderPath}`
        );
      } else {
        console.log(`✅ [自动备份] 成功！`);
        if (loadingToast) {
          loadingToast.classList.remove('visible');
          setTimeout(() => loadingToast.remove(), 400);
        }
        showToast('云端备份已完成', 'success');
      }

    } catch (error) {
      console.error("GitHub 上传失败:", error);
      let errorMsg = error.message;
      if (error.name === 'AbortError') errorMsg = "上传超时 (网络较慢或代理不稳定)。";

      if (!isSilent) {
        await showCustomAlert("❌ 备份失败", `上传中断：\n${errorMsg}`);
      } else {
        // 【修改点 4】: 失败时显示警告图标，但不打断用户
        if (loadingToast) {
          loadingToast.classList.remove('visible');
          setTimeout(() => loadingToast.remove(), 400);
        }
        showToast('备份失败: 网络错误', 'error');
      }
    }
  }

