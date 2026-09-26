  async function handleRedditSearch(query = '') {
    const listEl = document.getElementById('char-reddit-list');
    listEl.innerHTML = '<div class="spinner"></div>';
    let targetUrl;
    if (query === 'popular' || !query) {
      targetUrl = `https://www.reddit.com/r/popular.json?limit=30&raw_json=1`;
    } else {
      targetUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=30&raw_json=1&sort=relevance`;
    }
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("网络请求失败");
      const json = await response.json();
      const posts = json.data.children;
      renderRedditList(posts);
    } catch (error) {
      console.error("Reddit API Error:", error);
      listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">无法连接到 Reddit，请检查网络或代理。</p>';
    }
  }

  async function openRedditDetail(post) {
    const isFromChat = document.getElementById('chat-interface-screen').classList.contains('active');
    const titleEl = document.getElementById('char-article-title');
    const contentEl = document.getElementById('char-article-content');
    const backBtn = document.querySelector('#char-browser-article-screen .back-btn');
    let headerActions = document.querySelector('#char-browser-article-screen .header .header-actions');
    if (!headerActions) {
      const header = document.querySelector('#char-browser-article-screen .header');
      headerActions = document.createElement('div'); headerActions.className = 'header-actions'; header.appendChild(headerActions);
    }
    titleEl.textContent = "加载中...";
    contentEl.innerHTML = '<div class="spinner" style="margin-top:50px;"></div>';
    if (isFromChat) { showScreen('character-phone-screen'); }
    switchToCharScreen('char-browser-article-screen');
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.onclick = () => { if (isFromChat) { showScreen('chat-interface-screen'); } else { switchToCharScreen('char-reddit-screen'); } };
    headerActions.innerHTML = '';
    const forwardBtn = document.createElement('span');
    forwardBtn.className = 'action-btn';
    forwardBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    forwardBtn.title = "转发给TA";
    headerActions.appendChild(forwardBtn);
    contentEl.onclick = async (e) => {
      const link = e.target.closest('a.reddit-inner-link');
      if (link) {
        e.preventDefault();
        const href = link.href;
        const redditMatch = href.match(/reddit\.com\/r\/[^\/]+\/comments\/([a-zA-Z0-9]+)/);
        if (redditMatch) { const urlObj = new URL(href); await openRedditDetail({ permalink: urlObj.pathname }); } else { window.open(href, '_blank'); }
      }
    };
    try {
      const permalink = post.permalink;
      if (!permalink) throw new Error("无效的帖子链接");
      const targetUrl = `https://www.reddit.com${permalink}.json?raw_json=1`;
      const proxyUrlDetail = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrlDetail);
      if (!response.ok) throw new Error("无法加载帖子详情");
      const json = await response.json();
      const fullPostData = json[0].data.children[0].data;
      const commentsData = json[1].data.children;
      const postObjForForward = {
        id: fullPostData.id, title: fullPostData.title, subreddit_name_prefixed: fullPostData.subreddit_name_prefixed,
        author: fullPostData.author, score: fullPostData.score, num_comments: fullPostData.num_comments,
        permalink: fullPostData.permalink, selftext: fullPostData.selftext || '',
        thumbnail: (fullPostData.preview && fullPostData.preview.images[0]) ? fullPostData.preview.images[0].source.url.replace(/&amp;/g, '&') : (fullPostData.thumbnail && fullPostData.thumbnail.startsWith('http') ? fullPostData.thumbnail : null),
        url: fullPostData.url
      };
      forwardBtn.onclick = () => { forwardRedditPost(null, postObjForForward); };
      titleEl.textContent = fullPostData.subreddit_name_prefixed;
      let htmlContent = '';
      htmlContent += `<div style="margin-bottom: 15px;"><h2 style="font-size: 20px; font-weight: bold; margin: 0 0 8px 0;">${escapeHTML(fullPostData.title)}</h2><div style="color: #888; font-size: 12px;">u/${fullPostData.author} • ${new Date(fullPostData.created_utc * 1000).toLocaleString()}</div></div>`;
      const ytMatch = fullPostData.url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/);
      if (ytMatch) {
        htmlContent += `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom: 10px; background: #000;"><iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&playsinline=1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" frameborder="0" allowfullscreen></iframe></div>`;
      } else if (fullPostData.is_video && fullPostData.media && fullPostData.media.reddit_video) {
        htmlContent += `<video controls playsinline poster="${fullPostData.thumbnail}" style="width: 100%; border-radius: 8px; margin-bottom: 5px; background: #000;"><source src="${fullPostData.media.reddit_video.fallback_url}" type="video/mp4"></video><div style="font-size:12px; color:#999; margin-bottom:15px;">⚠️ Reddit原生视频可能无声，<a href="${fullPostData.url}" target="_blank" style="color:#007aff;">点击此处跳转原网页观看</a></div>`;
      } else if (fullPostData.url && fullPostData.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
        htmlContent += `<img src="${fullPostData.url}" style="width:100%; border-radius:8px; margin-bottom:15px;">`;
      } else if (fullPostData.preview && fullPostData.preview.images && fullPostData.preview.images.length > 0) {
        htmlContent += `<img src="${fullPostData.preview.images[0].source.url.replace(/&amp;/g, '&')}" style="width:100%; border-radius:8px; margin-bottom:15px;">`;
      }
      if (fullPostData.selftext) {
        let processedText = escapeHTML(fullPostData.selftext);
        processedText = processedText.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" class="reddit-inner-link" style="color:#007aff; text-decoration:none;">$1</a>');
        processedText = processedText.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" class="reddit-inner-link" style="color:#007aff; text-decoration:none;">🔗 Link</a>');
        processedText = processedText.replace(/\n/g, '<br>');
        htmlContent += `<div style="line-height:1.6; font-size:15px; color:#333; margin-bottom:20px; word-break: break-word;">${processedText}</div>`;
      }
      const score = fullPostData.score > 1000 ? (fullPostData.score / 1000).toFixed(1) + 'k' : fullPostData.score;
      htmlContent += `<div style="display:flex; gap:20px; padding:10px 0; border-top:1px solid #eee; border-bottom:1px solid #eee; margin-bottom:15px; font-size:13px; color:#555; align-items:center;"><span style="display:flex; align-items:center; gap:4px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ff4500;"><path d="M12 19V5M5 12l7-7 7 7"/></svg> ${score} 赞</span><span style="display:flex; align-items:center; gap:4px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ${fullPostData.num_comments} 评论</span></div>`;
      htmlContent += `<div style="font-weight:bold; margin-bottom:10px;">评论</div>`;
      if (commentsData.length === 0) { htmlContent += `<div style="text-align:center; color:#999; padding:20px;">暂无评论</div>`; }
      else { commentsData.forEach(child => { const c = child.data; if (!c.body) return; htmlContent += `<div class="reddit-comment-item" style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #f9f9f9;"><div style="font-size:12px; color:#888; margin-bottom:4px; display:flex; justify-content:space-between;"><span style="color: #1c1c1e; font-weight: 500;">${c.author}</span><span>${c.score} pts</span></div><div style="font-size:14px; line-height:1.5; color:#333;">${escapeHTML(c.body).replace(/\n/g, '<br>')}</div></div>`; }); }
      contentEl.innerHTML = htmlContent;
      contentEl.scrollTop = 0;
    } catch (error) {
      console.error("Reddit Detail Error:", error);
      contentEl.innerHTML = `<div style="padding:20px; text-align:center;"><h3>加载失败</h3><p style="color:#888; font-size:14px;">${error.message}</p></div>`;
    }
  }

  function renderRedditList(posts) {
    const listEl = document.getElementById('char-reddit-list');
    listEl.innerHTML = '';
    if (!posts || posts.length === 0) { listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">未找到内容</p>'; return; }
    posts.forEach(child => {
      const post = child.data;
      let previewImage = '';
      if (post.preview && post.preview.images && post.preview.images.length > 0) { previewImage = post.preview.images[0].source.url.replace(/&amp;/g, '&'); }
      else if (post.thumbnail && post.thumbnail.startsWith('http')) { previewImage = post.thumbnail; }
      const item = document.createElement('div'); item.className = 'reddit-post-item';
      const score = post.score > 1000 ? (post.score / 1000).toFixed(1) + 'k' : post.score;
      item.innerHTML = `<div class="reddit-vote-box"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ff4500;"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span style="font-weight:bold; margin-top:2px;">${score}</span></div><div class="reddit-content-box"><div class="reddit-meta"><div class="reddit-sub-icon"></div><strong>${post.subreddit_name_prefixed}</strong><span>• u/${post.author}</span></div><div class="reddit-title">${post.title}</div>${previewImage ? `<img src="${previewImage}" class="reddit-preview-img" loading="lazy">` : ''}<button class="reddit-forward-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>转发给TA</button></div>`;
      if (!window.redditPostCache) window.redditPostCache = new Map();
      window.redditPostCache.set(post.id, post);
      // 仅缓存转发所需的近期帖子对象，防止反复搜索后运行时 Map 无限增长。
      // 这是可重建的页面缓存，不影响角色数据、推荐结果或已发送的 Reddit 消息。
      while (window.redditPostCache.size > 100) {
        const oldestPostId = window.redditPostCache.keys().next().value;
        window.redditPostCache.delete(oldestPostId);
      }
      item.addEventListener('click', () => { openRedditDetail(post); });
      const fwdBtn = item.querySelector('.reddit-forward-btn');
      fwdBtn.addEventListener('click', (e) => { e.stopPropagation(); forwardRedditPost(post.id); });
      listEl.appendChild(item);
    });
  }

  async function forwardRedditPost(postId, directData = null) {
    let post;
    if (directData) { post = directData; } else { if (!window.redditPostCache) window.redditPostCache = new Map(); post = window.redditPostCache.get(postId); }
    if (!post) { alert("无法获取帖子数据"); return; }
    await openShareTargetPicker();
    const confirmBtn = document.getElementById('confirm-share-target-btn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.onclick = async () => {
      const selectedTargetIds = Array.from(document.querySelectorAll('.share-target-checkbox:checked')).map(cb => cb.dataset.chatId);
      if (selectedTargetIds.length === 0) return alert("请选择要转发到的聊天。");
      const redditMsg = { role: 'user', type: 'reddit_share', timestamp: Date.now(), redditData: { title: post.title, subreddit: post.subreddit_name_prefixed, author: post.author, score: post.score, num_comments: post.num_comments, permalink: post.permalink, image: post.thumbnail || (post.preview && post.preview.images[0] ? post.preview.images[0].source.url.replace(/&amp;/g, '&') : null), selftext: post.selftext ? post.selftext.substring(0, 150) + '...' : '' } };
      document.getElementById('share-target-modal').classList.remove('visible');
      await showCustomAlert("转发中...", "正在生成预览并发送，请稍候...");
      let fullContextForAI = `标题: "${post.title}"\n来自: ${post.subreddit_name_prefixed}\n`;
      if (post.selftext) { fullContextForAI += `\n[内容摘要]: ${post.selftext.substring(0, 500)}...\n`; }
      try {
        const targetUrl = `https://www.reddit.com${post.permalink}.json?raw_json=1`;
        const proxyUrlFwd = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrlFwd);
        if (res.ok) { const json = await res.json(); const comments = json[1].data.children; if (comments.length > 0) { fullContextForAI += `\n[热门评论 (Top 3)]:\n`; comments.slice(0, 3).forEach((c, i) => { if (c.data.body) { fullContextForAI += `${i + 1}. ${c.data.author}: ${c.data.body.substring(0, 150)}\n`; } }); } }
      } catch (e) { console.warn("抓取详情失败，仅使用基本信息", e); }
      for (const targetId of selectedTargetIds) {
        const targetChat = state.chats[targetId];
        if (targetChat) {
          targetChat.history.push(redditMsg);
          targetChat.history.push({ role: 'system', content: `[系统提示：用户转发了一个 Reddit 帖子给你。\n请你阅读以下帖子详情和网友评论。\n注意：**用户还没有对此发表看法**，TA可能正在打字。请你**先不要回复**，耐心等待用户接下来的消息。\n---\n${fullContextForAI}\n---]`, timestamp: Date.now() + 1, isHidden: true });
          await db.chats.put(targetChat);
        }
      }
      document.querySelector('#custom-modal-overlay').classList.remove('visible');
      if (selectedTargetIds.length === 1) {
        showScreen('chat-interface-screen'); openChat(selectedTargetIds[0]);
        setTimeout(() => { const input = document.getElementById('chat-input'); if (input) input.focus(); }, 500);
      } else { alert(`已转发给 ${selectedTargetIds.length} 位好友。`); }
    };
  }

  window.handleRedditSearch = handleRedditSearch;
  window.openRedditDetail = openRedditDetail;
  window.renderRedditList = renderRedditList;
  window.forwardRedditPost = forwardRedditPost;

  // ========== 从 script.js 迁移：handleGenerateSimulatedReddit ==========

  async function handleGenerateSimulatedReddit() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;
    await showCustomAlert("请稍候...", `正在深度分析"${chat.name}"的兴趣网络...`);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) { alert('请先在API设置中配置好API信息。'); return; }
    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const longTermMemoryContext = await getMemoryContextForPromptAsync(chat, { queryText: recentHistoryWithUser }) || '无';
    const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId => state.worldBooks.find(wb => wb.id === bookId)).filter(Boolean).map(book => `\n## 世界书《${book.name}》:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`).join('');
    const systemPrompt = `
# 你的任务
你是一个虚拟用户画像分析师。你的任务是扮演角色"${chat.name}"，根据TA的人设、所处的世界观、长期记忆、以及与用户（${userDisplayNameForAI}）的最近互动，**推测TA现在最可能在 Reddit 上浏览或搜索的关键词**。

# 核心规则
1.  **语言策略**: 请根据角色的人设和想看的内容决定语言。如果角色想看国际新闻、技术文档、迷因 (Memes) 或特定外语内容，请生成【英文】关键词。如果角色想看中文圈的讨论、华语新闻或特定中文话题，请生成【中文】关键词。
2.  **深度人设绑定**: 关键词必须紧扣角色的性格、职业、爱好以及**世界观设定**。
3.  **多样性与数量 (关键)**: 请生成 **15到20个** 不同的关键词，涵盖角色兴趣的各个方面。
4.  **格式铁律**: 你的回复【必须且只能】是一个JSON数组格式的字符串。示例: \`["keyword1", "r/China_irl", "coding help", "猫咪", ...]\`

# 供你参考的详细上下文
- **角色人设**: ${chat.settings.aiPersona}
- **用户(${userDisplayNameForAI})的人设**: ${chat.settings.myPersona || '无'}
- **长期记忆**: 
${longTermMemoryContext}
${worldBookContext} 
- **最近对话**:
${recentHistoryWithUser}

现在，请生成这组详细的 Reddit 搜索关键词。`;
    try {
      const messagesForApi = [{ role: 'user', content: "请生成Reddit关键词列表。" }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);
      let reqBody = { model: model, messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi], temperature: state.globalSettings.apiTemperature || 1.0 };
      if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
      if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
      if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
      if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(reqBody)
        });
      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      let keywords;
      try { keywords = JSON.parse(cleanedJson); } catch (e) { throw new Error("AI返回格式错误，无法解析JSON"); }
      if (!Array.isArray(keywords) || keywords.length === 0) throw new Error("AI没有返回有效的关键词数组。");
      await showCustomAlert("搜索中...", `AI 生成了 ${keywords.length} 个兴趣关键词，正在聚合全网内容... (这一步可能需要十几秒，请耐心等待)`);
      const listEl = document.getElementById('char-reddit-list');
      listEl.innerHTML = '<div class="spinner" style="margin-top:50px;"></div>';
      const queries = keywords;
      let aggregatedPosts = [];
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const fetchRedditData = async (query) => {
        try {
          let tUrl;
          if (query.startsWith('r/')) { tUrl = `https://www.reddit.com/${query}/hot.json?limit=5&raw_json=1`; }
          else { tUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&raw_json=1&sort=relevance`; }
          const pUrl = `https://corsproxy.io/?${encodeURIComponent(tUrl)}`;
          const res = await fetch(pUrl);
          if (!res.ok) return [];
          const json = await res.json();
          return json.data.children;
        } catch (e) { console.warn(`搜索关键词 ${query} 失败:`, e); return []; }
      };
      for (const [index, query] of queries.entries()) {
        console.log(`[Reddit生成流] 正在搜索 (${index + 1}/${queries.length}): ${query}`);
        const posts = await fetchRedditData(query);
        if (posts && posts.length > 0) { aggregatedPosts.push(...posts); }
        await delay(600);
      }
      if (aggregatedPosts.length === 0) { throw new Error("所有关键词都未能搜索到内容，可能是网络问题或关键词太偏门。"); }
      const uniquePosts = []; const seenIds = new Set();
      for (let i = aggregatedPosts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [aggregatedPosts[i], aggregatedPosts[j]] = [aggregatedPosts[j], aggregatedPosts[i]]; }
      aggregatedPosts.forEach(item => { const post = item.data; if (!seenIds.has(post.id)) { seenIds.add(post.id); uniquePosts.push(item); } });
      const finalFeed = uniquePosts.slice(0, 30);
      chat.simulatedRedditFeed = finalFeed;
      await db.chats.put(chat);
      renderRedditList(finalFeed);
    } catch (error) {
      console.error("生成 Reddit 推荐失败:", error);
      await showCustomAlert("生成失败", `无法生成推荐内容。\n错误: ${error.message}`);
      handleRedditSearch('popular');
    }
  }

  window.handleGenerateSimulatedReddit = handleGenerateSimulatedReddit;

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    const player = document.getElementById('char-audio-player');
    if (charPlayerState.lrcUpdateInterval) {
      clearInterval(charPlayerState.lrcUpdateInterval);
      charPlayerState.lrcUpdateInterval = null;
    }
    if (player) {
      player.pause();
      releaseCharMusicObjectUrl(player);
      player.removeAttribute('src');
      try { player.load(); } catch (error) { }
    }
  });
