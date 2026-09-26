  // ========== 自动备份定时器 ==========
  let backupIntervalId = null;

  function startAutoBackupTimer(intervalMinutes) {
    if (backupIntervalId) clearInterval(backupIntervalId);
    if (!intervalMinutes) {
      const saved = localStorage.getItem('github-backup-interval');
      intervalMinutes = saved ? parseInt(saved) : 30;
    }
    console.log(`✅ 自动备份定时器已启动 (每 ${intervalMinutes} 分钟)`);
    backupIntervalId = setInterval(async () => {
      const isEnabled = localStorage.getItem('github-enabled') === 'true';
      const isAuto = localStorage.getItem('github-auto-backup') === 'true';
      if (isEnabled && isAuto) {
        console.log("⏰ 触发定时自动备份...");
        await uploadToGitHub(true);
      }
    }, intervalMinutes * 60 * 1000);
  }

  function stopAutoBackupTimer() {
    if (backupIntervalId) {
      clearInterval(backupIntervalId);
      backupIntervalId = null;
      console.log("🛑 自动备份定时器已停止");
    }
  }

  async function restoreFromGitHub() {
    if (!state.apiConfig.githubEnable) { alert("请先开启 GitHub 云备份功能。"); return; }
    const username = state.apiConfig.githubUsername;
    const repo = state.apiConfig.githubRepo;
    const token = state.apiConfig.githubToken;
    if (!username || !repo || !token) { alert("请先保存 GitHub 配置！"); return; }

    const modalBody = document.getElementById('custom-modal-body');
    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');

    const showProgress = (text) => {
      const modal = document.getElementById('custom-modal-overlay');
      document.getElementById('custom-modal-title').textContent = "GitHub 恢复";
      modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div><p style="text-align:center;">${text}</p>`;
      confirmBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      modal.classList.add('visible');
    };

    const ghFetch = async (path) => {
      let url = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
      if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
        const relativePath = url.replace("https://api.github.com", "");
        url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
      }
      const res = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
      if (!res.ok) { if (res.status === 404) return []; throw new Error(`GitHub API Error: ${res.status}`); }
      return await res.json();
    };

    try {
      showProgress("正在搜索备份...");
      let rootPath = "";
      const backupsDir = await ghFetch("backups");
      if (backupsDir.length > 0) {
        const dateFolders = backupsDir.filter(item => item.type === 'dir');
        if (dateFolders.length > 0) {
          document.getElementById('custom-modal-overlay').classList.remove('visible');
          dateFolders.sort((a, b) => b.name.localeCompare(a.name));
          const dateChoices = dateFolders.map(f => ({ text: `📅 ${f.name}`, value: f.path }));
          const selectedPath = await showChoiceModal('请选择备份日期', dateChoices);
          if (!selectedPath) return;
          rootPath = selectedPath;
          showProgress(`正在读取 ${rootPath} ...`);
        }
      }
      const files = await ghFetch(rootPath);
      const backupSets = new Map();
      files.forEach(file => {
        if (!file.name.endsWith('.json') && !file.name.endsWith('.json.gz')) return;
        const partMatch = file.name.match(/^(.*)_part(\d+)\.json(?:\.gz)?$/);
        if (partMatch) {
          const baseName = partMatch[1];
          const partNum = parseInt(partMatch[2]);
          if (!backupSets.has(baseName)) backupSets.set(baseName, { type: 'multipart', display: baseName, parts: [] });
          backupSets.get(baseName).parts.push({ num: partNum, name: file.name, path: file.path });
        } else {
          backupSets.set(file.name, { type: 'single', display: file.name, name: file.name, path: file.path });
        }
      });
      if (backupSets.size === 0) throw new Error("未找到备份文件。");
      document.getElementById('custom-modal-overlay').classList.remove('visible');
      const choices = [];
      backupSets.forEach((info, key) => {
        let text = info.display;
        if (info.type === 'multipart') text += ` (${info.parts.length} 个分片)`;
        choices.push({ text: text, value: key });
      });
      const selectedKey = await showChoiceModal('请选择要恢复的档案', choices);
      if (!selectedKey) return;
      const targetSet = backupSets.get(selectedKey);
      const confirmRestore = await showCustomConfirm('最后确认', `即将恢复数据。本地数据将被覆盖。确定吗？`, { confirmButtonClass: 'btn-danger', confirmText: '恢复' });
      if (!confirmRestore) return;
      showProgress("正在下载并恢复数据...");
      await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
      const processFile = async (filePath) => {
        let url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
          const relativePath = url.replace("https://api.github.com", "");
          url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
        }
        const res = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3.raw' } });
        if (!res.ok) throw new Error(`下载失败: ${res.status}`);
        let json;
        const isGzipped = filePath.endsWith('.gz');
        if (isGzipped && typeof pako !== 'undefined') {
          const arrayBuffer = await res.arrayBuffer();
          const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
          json = JSON.parse(decompressed);
        } else {
          const text = await res.text();
          try { json = JSON.parse(text); } catch (e) {
            const decoded = decodeURIComponent(escape(window.atob(text.replace(/\s/g, ''))));
            json = JSON.parse(decoded);
          }
        }
        const dataPart = json.data || json;
        for (const tableName of Object.keys(dataPart)) {
          if (tableName === 'mcpSecrets') continue;
          const records = dataPart[tableName];
          if (Array.isArray(records) && records.length > 0) await db.table(tableName).bulkPut(records);
        }
      };
      if (targetSet.type === 'multipart') {
        targetSet.parts.sort((a, b) => a.num - b.num);
        let isTextStreamMode = false;
        let fullTextBuffer = "";

        for (let i = 0; i < targetSet.parts.length; i++) {
          modalBody.innerHTML = `<div class="spinner"></div><p style="text-align:center;">正在处理分片 ${i + 1}/${targetSet.parts.length}...</p>`;
          
          let url = `https://api.github.com/repos/${username}/${repo}/contents/${targetSet.parts[i].path}`;
          if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
            const relativePath = url.replace("https://api.github.com", "");
            url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
          }
          const res = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3.raw' } });
          if (!res.ok) throw new Error(`下载失败: ${res.status}`);
          
          let json;
          const isGzipped = targetSet.parts[i].path.endsWith('.gz');
          if (isGzipped && typeof pako !== 'undefined') {
            const arrayBuffer = await res.arrayBuffer();
            const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
            json = JSON.parse(decompressed);
          } else {
            const text = await res.text();
            try { json = JSON.parse(text); } catch (e) {
              const decoded = decodeURIComponent(escape(window.atob(text.replace(/\s/g, ''))));
              json = JSON.parse(decoded);
            }
          }

          if (json.type === 'text_stream_slice') {
            isTextStreamMode = true;
            fullTextBuffer += json.data;
          } else {
            const dataPart = json.data || json;
            for (const tableName of Object.keys(dataPart)) {
              if (tableName === 'mcpSecrets') continue;
              const records = dataPart[tableName];
              if (Array.isArray(records) && records.length > 0) await db.table(tableName).bulkPut(records);
            }
          }
          await new Promise(r => setTimeout(r, 50));
        }

        if (isTextStreamMode) {
          modalBody.innerHTML = `<div class="spinner"></div><p style="text-align:center;">正在解析合并后的数据，请稍候...</p>`;
          await new Promise(r => setTimeout(r, 100)); // 让UI刷新
          
          const parsed = JSON.parse(fullTextBuffer);
          fullTextBuffer = ""; // 释放内存
          
          const dataPart = parsed.data || parsed;
          for (const tableName of Object.keys(dataPart)) {
            if (tableName === 'mcpSecrets') continue;
            const records = dataPart[tableName];
            if (Array.isArray(records) && records.length > 0) await db.table(tableName).bulkPut(records);
          }
        }
      } else {
        await processFile(targetSet.path);
      }
      try {
        const restoredApiConfig = await db.apiConfig.get('main');
        if (restoredApiConfig) {
          if (restoredApiConfig.imgbbApiKey) localStorage.setItem('imgbb-api-key', restoredApiConfig.imgbbApiKey);
          if (restoredApiConfig.imgbbEnable !== undefined) localStorage.setItem('imgbb-enabled', restoredApiConfig.imgbbEnable);
          if (restoredApiConfig.minimaxApiKey) localStorage.setItem('minimax-api-key', restoredApiConfig.minimaxApiKey);
          if (restoredApiConfig.minimaxGroupId) localStorage.setItem('minimax-group-id', restoredApiConfig.minimaxGroupId);
          if (restoredApiConfig.githubToken) state.apiConfig.githubToken = restoredApiConfig.githubToken;
        }
      } catch (e) { }
      confirmBtn.style.display = '';
      await showCustomAlert("恢复成功", "所有分片已处理完毕，数据已恢复！点击确定刷新页面。");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error(error);
      confirmBtn.style.display = '';
      await showCustomAlert("恢复失败", error.message);
    }
  }

  window.restoreFromGitHub = restoreFromGitHub;
  window.uploadToGitHub = uploadToGitHub;
  window.uploadToGitHubLargeData = uploadToGitHubLargeData;
  window.startAutoBackupTimer = startAutoBackupTimer;
  window.stopAutoBackupTimer = stopAutoBackupTimer;
