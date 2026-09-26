  // ========================================
  // 大数据云备份 (A+B方案: pako压缩 + Git Blob API)
  // ========================================
  async function uploadToGitHubLargeData(isSilent = false) {
    let loadingToast = null;

    // --- 1. 基础配置检查 ---
    if (!state.apiConfig.githubEnable) {
      if (!isSilent) await showCustomAlert('未开启', '请先在"API设置" -> "GitHub 云备份"中开启此功能。');
      return;
    }

    const username = state.apiConfig.githubUsername;
    const repo = state.apiConfig.githubRepo;
    const token = state.apiConfig.githubToken;
    const branch = state.apiConfig.githubBranch || 'main';
    const baseFilename = (state.apiConfig.githubFilename || 'ephone_backup').replace(/\.json$/i, '');

    if (!username || !repo || !token) {
      if (!isSilent) await showCustomAlert('配置缺失', '请先在设置中保存 GitHub 用户名、仓库名和 Token！');
      return;
    }

    // 检查 pako 是否可用
    if (typeof pako === 'undefined') {
      if (!isSilent) await showCustomAlert('组件缺失', '压缩库 pako 未加载，请检查网络后刷新页面重试。');
      return;
    }

    // --- 2. 确认提示 ---
    if (!isSilent) {
      const confirmed = await showCustomConfirm(
        '确认大数据备份',
        `即将备份数据到 GitHub 仓库：<br><strong>${username}/${repo}</strong><br><br>采用<strong style="color:green">压缩 + Git Blob API</strong> 模式。<br>适合大数据量用户（几百MB+），速度更快更稳定。<br>确定要开始吗？`,
        { confirmText: '开始大数据备份' }
      );
      if (!confirmed) return;
      await showCustomAlert("准备中...", "正在初始化大数据备份...");
    } else {
      console.log("⏳ [大数据备份] 开始后台静默备份到 GitHub...");
      loadingToast = showToast('正在大数据云备份...', 'loading');
    }

    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const folderPath = `backups/${dateStr}`;

      // 核心设置
      const CHUNK_CHAR_LIMIT = 4 * 1024 * 1024; // 4MB 字符限制，分片更小以保证成功率
      const DB_BATCH_SIZE = 50;
      const MAX_CONCURRENT_UPLOADS = 4;

      // GitHub API 基础 URL (支持代理)
      const getApiUrl = (path) => {
        let url = `https://api.github.com${path}`;
        if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
          url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + path;
        }
        return url;
      };

      const ghHeaders = {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      };

      // --- 辅助函数：创建 Git Blob ---
      const createBlob = async (contentBase64) => {
        const url = getApiUrl(`/repos/${username}/${repo}/git/blobs`);
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);

          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: ghHeaders,
              body: JSON.stringify({
                content: contentBase64,
                encoding: 'base64'
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
              const err = await res.json();
              const errorMsg = err.message || res.statusText;
              
              // 🔥 特殊处理：如果是大小超限错误，给出更明确的提示
              if (errorMsg.includes('too large') || errorMsg.includes('size')) {
                const sizeMB = (contentBase64.length * 0.75 / 1024 / 1024).toFixed(2);
                throw new Error(
                  `GitHub Blob 大小超限 (${sizeMB}MB)！\n` +
                  `原因：此分片包含大量图片或不可压缩数据。\n` +
                  `建议：使用"高级导出"功能分批备份，或清理大图片后重试。`
                );
              }
              
              throw new Error(errorMsg);
            }

            const data = await res.json();
            return data.sha;
          } catch (err) {
            clearTimeout(timeoutId);
            retryCount++;
            if (retryCount >= maxRetries) throw new Error(`Blob 创建失败: ${err.message}`);
            console.warn(`⚠️ Blob 创建第 ${retryCount} 次重试...`);
            await new Promise(r => setTimeout(r, 2000 * retryCount));
          }
        }
      };

      // --- 辅助函数：压缩并编码 ---
      const compressAndEncode = (jsonString) => {
        const compressed = pako.gzip(jsonString);
        // 将 Uint8Array 转为 Base64
        let binary = '';
        const bytes = compressed;
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return window.btoa(binary);
      };

      // 收集所有分片的 blob SHA
      const blobEntries = []; // { path, sha }
      const errors = [];
      const activeUploads = new Set();
      let partIndex = 1;
      let textBuffer = "";
      let totalCompressedSize = 0;

      // --- 字符串强制切片上传 (彻底解决单条大记录超限问题) ---
      const uploadChunk = async (chunkStr, pIndex) => {
        const fileContentObj = {
          version: 6,
          timestamp: Date.now(),
          type: 'text_stream_slice',
          compression: 'gzip',
          part: pIndex,
          data: chunkStr
        };

        const jsonString = JSON.stringify(fileContentObj);
        const rawSizeMB = (jsonString.length / 1024 / 1024).toFixed(2);

        // 压缩与编码
        const contentBase64 = compressAndEncode(jsonString);
        const compressedSize = contentBase64.length * 0.75;
        const compressedSizeMB = (compressedSize / 1024 / 1024).toFixed(2);
        totalCompressedSize += compressedSize;

        if (!isSilent) {
          const modalBody = document.getElementById('custom-modal-body');
          if (modalBody) {
            const compressionRatio = ((compressedSize / jsonString.length) * 100).toFixed(1);
            modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div>
              <p style="text-align:center;">
                正在压缩上传中...<br>
                队列: <b>${activeUploads.size + 1}</b> / ${MAX_CONCURRENT_UPLOADS}<br>
                文本分片 #${pIndex}: ${rawSizeMB} MB → ${compressedSizeMB} MB (压缩率 ${compressionRatio}%)
              </p>`;
          }
        } else {
          console.log(`[大数据备份] 分片 #${pIndex}: ${rawSizeMB}MB → ${compressedSizeMB}MB`);
        }

        const partFilename = `${baseFilename}_part${pIndex}.json.gz`;
        const sha = await createBlob(contentBase64);

        blobEntries.push({
          path: `${folderPath}/${partFilename}`,
          sha: sha
        });
        console.log(`✅ [大数据备份] 分片 #${pIndex} Blob 已创建`);
      };

      const writeToStream = async (str) => {
        textBuffer += str;
        while (textBuffer.length > CHUNK_CHAR_LIMIT) {
          if (errors.length > 0) throw new Error(errors[0]);
          if (activeUploads.size >= MAX_CONCURRENT_UPLOADS) {
            await Promise.race(activeUploads);
          }
          const chunk = textBuffer.slice(0, CHUNK_CHAR_LIMIT);
          textBuffer = textBuffer.slice(CHUNK_CHAR_LIMIT);
          
          const curIndex = partIndex++;
          const task = uploadChunk(chunk, curIndex).catch(err => {
            console.error(err);
            errors.push(err.message);
          });
          activeUploads.add(task);
          task.finally(() => activeUploads.delete(task));
        }
      };

      // --- 3. 流式生成完整 JSON 并自动分片 ---
      await writeToStream('{\n"version": 3,\n"timestamp": ' + Date.now() + ',\n"data": {\n');
      const tablesToBackup = db.tables.filter(t => t.name !== 'mcpSecrets').map(t => t.name);

      for (let i = 0; i < tablesToBackup.length; i++) {
        const tableName = tablesToBackup[i];
        await writeToStream(`"${tableName}": [\n`);
        
        let isFirstRecord = true;
        const totalCount = await db.table(tableName).count();
        
        if (totalCount > 0) {
          let offset = 0;
          while (offset < totalCount) {
            const batch = await db.table(tableName).offset(offset).limit(DB_BATCH_SIZE).toArray();
            for (const record of batch) {
              if (!isFirstRecord) {
                await writeToStream(',\n');
              }
              let recordToWrite = record;
              if (tableName === 'chats' && record.apiHistory) {
                recordToWrite = { ...record };
                delete recordToWrite.apiHistory;
              }
              await writeToStream(JSON.stringify(recordToWrite));
              isFirstRecord = false;
            }
            offset += DB_BATCH_SIZE;
            if (errors.length > 0) break;
          }
        }
        await writeToStream('\n]');
        if (i < tablesToBackup.length - 1) {
          await writeToStream(',\n');
        }
        if (errors.length > 0) break;
      }

      if (errors.length === 0) {
        const coupleSpaceLocalStorage = exportCoupleSpaceLocalStorage();
        await writeToStream(',\n"localStorage": ');
        await writeToStream(JSON.stringify(coupleSpaceLocalStorage));
        await writeToStream('\n}\n}');
      }

      // --- 4. 处理残余内容 ---
      if (textBuffer.length > 0 && errors.length === 0) {
        if (activeUploads.size >= MAX_CONCURRENT_UPLOADS) {
          await Promise.race(activeUploads);
        }
        const task = uploadChunk(textBuffer, partIndex++).catch(err => {
          errors.push(err.message);
        });
        activeUploads.add(task);
        task.finally(() => activeUploads.delete(task));
        textBuffer = "";
      }

      // --- 5. 等待所有 Blob 上传完成 ---
      if (!isSilent) {
        const modalBody = document.getElementById('custom-modal-body');
        if (modalBody) modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div>
          <p style="text-align:center;">正在等待最后分片完成...</p>`;
      }

      await Promise.all(activeUploads);

      if (errors.length > 0) {
        throw new Error(`上传过程中出现错误:\n${errors.join('\n')}`);
      }

      // --- 6. 用 Git Tree + Commit API 一次性提交 ---
      if (!isSilent) {
        const modalBody = document.getElementById('custom-modal-body');
        if (modalBody) modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div>
          <p style="text-align:center;">所有分片已上传，正在创建 Git Commit...</p>`;
      }

      // 6a. 获取当前分支的最新 commit SHA
      const refUrl = getApiUrl(`/repos/${username}/${repo}/git/ref/heads/${branch}`);
      const refRes = await fetch(refUrl, { headers: ghHeaders });
      if (!refRes.ok) throw new Error(`获取分支信息失败: ${refRes.status}`);
      const refData = await refRes.json();
      const latestCommitSha = refData.object.sha;

      // 6b. 获取该 commit 的 tree SHA
      const commitUrl = getApiUrl(`/repos/${username}/${repo}/git/commits/${latestCommitSha}`);
      const commitRes = await fetch(commitUrl, { headers: ghHeaders });
      if (!commitRes.ok) throw new Error(`获取 Commit 信息失败: ${commitRes.status}`);
      const commitData = await commitRes.json();
      const baseTreeSha = commitData.tree.sha;

      // 6c. 创建新 Tree
      const treeItems = blobEntries.map(entry => ({
        path: entry.path,
        mode: '100644',
        type: 'blob',
        sha: entry.sha
      }));

      const treeUrl = getApiUrl(`/repos/${username}/${repo}/git/trees`);
      const treeRes = await fetch(treeUrl, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems
        })
      });
      if (!treeRes.ok) {
        const treeErr = await treeRes.json();
        throw new Error(`创建 Tree 失败: ${treeErr.message}`);
      }
      const treeData = await treeRes.json();

      // 6d. 创建 Commit
      const newCommitUrl = getApiUrl(`/repos/${username}/${repo}/git/commits`);
      const newCommitRes = await fetch(newCommitUrl, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `Large Data Backup: ${dateStr} (${blobEntries.length} parts, compressed)`,
          tree: treeData.sha,
          parents: [latestCommitSha]
        })
      });
      if (!newCommitRes.ok) {
        const commitErr = await newCommitRes.json();
        throw new Error(`创建 Commit 失败: ${commitErr.message}`);
      }
      const newCommitData = await newCommitRes.json();

      // 6e. 更新分支引用
      const updateRefUrl = getApiUrl(`/repos/${username}/${repo}/git/refs/heads/${branch}`);
      const updateRefRes = await fetch(updateRefUrl, {
        method: 'PATCH',
        headers: ghHeaders,
        body: JSON.stringify({
          sha: newCommitData.sha
        })
      });
      if (!updateRefRes.ok) {
        const refErr = await updateRefRes.json();
        throw new Error(`更新分支失败: ${refErr.message}`);
      }

      // --- 7. 成功 ---
      const totalCompressedMB = (totalCompressedSize / 1024 / 1024).toFixed(2);

      if (!isSilent) {
        await showCustomAlert(
          "✅ 大数据备份成功",
          `全量数据压缩上传完成！<br>共 ${blobEntries.length} 个分片，压缩后总计约 ${totalCompressedMB} MB。<br><strong>路径：</strong> ${folderPath}/`
        );
      } else {
        console.log(`✅ [大数据备份] 成功！${blobEntries.length} 个分片，${totalCompressedMB} MB`);
        if (loadingToast) {
          loadingToast.classList.remove('visible');
          setTimeout(() => loadingToast.remove(), 400);
        }
        showToast('大数据云备份已完成', 'success');
      }

    } catch (error) {
      console.error("大数据备份失败:", error);
      let errorMsg = error.message;
      if (error.name === 'AbortError') errorMsg = "上传超时 (网络较慢或代理不稳定)。";

      if (!isSilent) {
        await showCustomAlert("❌ 大数据备份失败", `上传中断：\n${errorMsg}`);
      } else {
        if (loadingToast) {
          loadingToast.classList.remove('visible');
          setTimeout(() => loadingToast.remove(), 400);
        }
        showToast('大数据备份失败', 'error');
      }
    }
  }

