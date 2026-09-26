  async function handleCharBilibiliSearch() {
    const input = document.getElementById('char-bilibili-search-input');
    const query = input.value.trim();
    if (!query) return;

    const listEl = document.getElementById('char-bilibili-list');
    listEl.innerHTML = '<div class="spinner"></div>';

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      const maxResults = 15;
      let videos = [];

      for (let i = 1; i <= maxResults; i++) {
        const targetUrl = `https://api.52vmy.cn/api/query/bilibili/video?msg=${encodeURIComponent(query)}&n=${i}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

        let retryCount = 0;
        let success = false;
        const maxRetries = 3;

        while (!success && retryCount < maxRetries) {
          try {
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const text = await res.text();

            if (text.includes("访问过快") || text.includes("频繁") || text.includes("Too Many Requests")) {
              console.warn(`⚠️ 获取第 ${i} 条触发限流，等待冷却...`);
              await delay(1500 + (retryCount * 1000));
              retryCount++;
              continue;
            }

            let json;
            try { json = JSON.parse(text); } catch (e) { console.warn(`第 ${i} 条返回格式错误:`, text.substring(0, 50)); retryCount++; continue; }

            if (json.data) {
              if (Array.isArray(json.data)) { videos.push(...json.data); } else { videos.push(json.data); }
            } else if (json.title) {
              videos.push(json);
            } else if (json.code === 200 && json.data) {
              if (Array.isArray(json.data)) { videos.push(...json.data); } else { videos.push(json.data); }
            }
            success = true;
          } catch (err) { console.warn(`获取第 ${i} 条视频网络错误:`, err); retryCount++; await delay(1000); }
        }
        await delay(800);
      }

      const uniqueVideos = [];
      const seenUrls = new Set();
      videos.forEach(v => {
        const url = v.url || v.arcurl;
        if (url && !seenUrls.has(url)) { seenUrls.add(url); uniqueVideos.push(v); }
      });

      listEl.innerHTML = '';
      if (uniqueVideos.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">未找到相关视频，或接口暂时不可用</p>';
        return;
      }

      uniqueVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'bilibili-item';
        item.innerHTML = `
          <div class="bili-cover" style="position: relative; overflow: hidden;">
            <img src="${video.img_url || video.pic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;">
            <div class="bili-duration" style="position: absolute; z-index: 2;">▶</div>
          </div>
          <div class="bili-info">
            <div class="bili-title">${video.title}</div>
            <div class="bili-author">UP: ${video.user || video.author}</div>
          </div>
        `;
        item.onclick = () => playCharBilibiliVideo(video);
        listEl.appendChild(item);
      });
    } catch (error) {
      console.error('Bilibili search error:', error);
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">搜索出错，请稍后再试</p>';
    }
  }

  function playCharBilibiliVideo(videoData) {
    const playerScreen = document.getElementById('char-bilibili-player-screen');
    const videoEl = document.getElementById('char-bilibili-video');
    const titleEl = document.getElementById('char-bilibili-player-title');
    const authorEl = document.getElementById('char-bilibili-player-author');
    const descEl = document.getElementById('char-bilibili-player-desc');
    videoEl.src = videoData.url;
    titleEl.textContent = videoData.title;
    authorEl.textContent = `UP主: ${videoData.user}`;
    descEl.textContent = videoData.desc || '暂无简介';
    switchToCharScreen('char-bilibili-player-screen');
    videoEl.play().catch(e => console.log("Autoplay blocked", e));
  }

  function closeCharBilibiliPlayer() {
    const videoEl = document.getElementById('char-bilibili-video');
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
    }
    switchToCharScreen('char-bilibili-screen');
  }

  window.handleCharBilibiliSearch = handleCharBilibiliSearch;
  window.playCharBilibiliVideo = playCharBilibiliVideo;
  window.closeCharBilibiliPlayer = closeCharBilibiliPlayer;

  // ========== 从 script.js 迁移：handleEditText, handleEditImage ==========

