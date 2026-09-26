// ========== Album AI Integration ==========

async function handleCoupleSpaceAlbumAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceAlbumAi(chat, data);
    let imageData = null;

    // Try to generate image based on settings
    const albumSettings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + data.charId) || '{}');
    const genMode = albumSettings.imageGenMode || 'none';

    if (genMode === 'pollinations' && result.imagePrompt) {
      try {
        const pollinationsUrl = typeof getPollinationsImageUrl === 'function'
          ? getPollinationsImageUrl(result.imagePrompt)
          : `https://image.pollinations.ai/prompt/${encodeURIComponent(result.imagePrompt)}`;
        const imgResp = await fetch(pollinationsUrl);
        if (imgResp.ok) {
          const blob = await imgResp.blob();
          imageData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
      } catch(e) { console.error('Album Pollinations gen failed:', e); }
    } else if (genMode === 'nai' && result.imagePrompt) {
      try {
        const naiResult = await generateNaiImageFromPrompt(result.imagePrompt, data.charId);
        if (naiResult && naiResult.base64) {
          imageData = 'data:image/png;base64,' + naiResult.base64;
        }
      } catch(e) { console.error('Album NAI gen failed:', e); }
    } else if (genMode === 'imagen' && result.imagePrompt) {
      try {
        const imagenResult = await generateGoogleImagenFromPrompt(result.imagePrompt);
        if (imagenResult && imagenResult.base64) {
          imageData = 'data:image/png;base64,' + imagenResult.base64;
        }
      } catch(e) { console.error('Album Imagen gen failed:', e); }
    }

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceAlbumAiResult',
      description: result.description,
      imageData: imageData,
      imagePrompt: result.imagePrompt,
      tags: result.tags || []
    }, '*');
  } catch(err) {
    console.error('Album AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumAiResult', error: true }, '*');
  }
}

function handleCoupleSpaceAlbumSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleAlbumSettings_', ['coupleAlbumAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 相册 设置并重新初始化定时器`);
  setupCoupleSpaceAlbumAutoTimer();
}

async function handleCoupleSpaceAlbumRecognize(data) {
  // Optional: use vision API to recognize user-uploaded image
  // For now this is a no-op; can be extended later
}

async function handleCoupleSpaceAlbumCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumCommentResult', photoId: data.photoId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceAlbumComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceAlbumCommentResult',
      photoId: data.photoId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Album comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumCommentResult', photoId: data.photoId, error: true }, '*');
  }
}

async function generateCoupleSpaceAlbumComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let taskDesc = '';
  if (data.photoAuthor === 'user') {
    taskDesc = `${ctx.myNickname}在相册里发了一张照片，请你作为${ctx.charName}写一条评论。`;
  } else {
    taskDesc = `你（${ctx.charName}）之前在相册发了一张照片，${ctx.myNickname}给你写了评论："${data.userComment}"。请你回复这条评论。`;
  }

  const tagsText = data.photoTags && data.photoTags.length > 0 ? data.photoTags.join(', ') : '无';

  const systemPrompt = `# 你的任务
${taskDesc}

# 你的角色设定
${ctx.aiPersona}

# 照片信息
- 配文: ${data.photoDescription || '(无描述)'}
- 标签: ${tagsText}
- 作者: ${data.photoAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

# 输出要求
直接返回评论文本，不要JSON格式，不要引号包裹。

# 写作要求
- 像真人在朋友圈/相册下评论一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以夸赞照片、表达感受、调侃、撒娇等
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评论。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8,
                top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
                presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
                frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

async function generateCoupleSpaceAlbumAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let recentPhotosText = '';
  if (data.recentPhotos && data.recentPhotos.length > 0) {
    recentPhotosText = data.recentPhotos.map(p =>
      '- [' + new Date(p.timestamp).toLocaleDateString('zh-CN') + '] ' +
      (p.author === 'user' ? ctx.myNickname : ctx.charName) + ': ' +
      (p.description || '(无描述)') +
      (p.tags && p.tags.length > 0 ? ' #' + p.tags.join(' #') : '')
    ).join('\n');
  }

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的相册里发一张照片。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.worldBook ? '# 世界观\n' + ctx.worldBook : ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${recentPhotosText ? '# 最近的相册照片（避免重复内容）\n' + recentPhotosText : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"description": "照片配文", "imagePrompt": "英文生图提示词", "tags": ["标签1", "标签2"]}

# 要求
- description 是你发照片时配的文字，像发朋友圈一样自然，符合你的性格
- imagePrompt 用英文写，描述具体画面、光线、构图、风格，尽量详细
- tags 是1-3个中文标签
- 可以是自拍、风景、食物、日常、和伴侣相关的场景等
- 不要和最近发过的照片内容重复
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请在相册发一张照片。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8,
                top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
                presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
                frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return parseCoupleSpaceJson(raw);
}

// ========== Auto Album Scheduler ==========
let coupleSpaceAlbumTimers = {};

function setupCoupleSpaceAlbumAutoTimer() {
  Object.values(coupleSpaceAlbumTimers).forEach(t => clearInterval(t));
  coupleSpaceAlbumTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 相册 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleAlbumAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 相册 的自动生成`);
          return triggerAutoAlbumPost(space.charId, true);
        });
        scheduleAlbumAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleAlbumAutoPost(charId, timeStr) {
  coupleSpaceAlbumTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleAlbumAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 相册 的自动生成`);
      return triggerAutoAlbumPost(charId, true);
    });
  }, 60000);
}

async function triggerAutoAlbumPost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;

  const albumSettings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + charId) || '{}');

  if (albumSettings.aiDecide && !isTimer) {
    try {
      const shouldPost = await askAiIfShouldPostPhoto(chat);
      if (!shouldPost) return true;
    } catch(e) {}
  }

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 相册照片...`);
  const postCount = Math.min(Math.max(albumSettings.autoCount || 1, 1), 10);
  let successCount = 0;

  for (let i = 0; i < postCount; i++) {
    try {
      const recentPhotos = JSON.parse(localStorage.getItem('coupleAlbum_' + charId) || '[]').slice(-10);
      const result = await generateCoupleSpaceAlbumAi(chat, { charId, recentPhotos });

      let imageData = null;
      const genMode = albumSettings.imageGenMode || 'none';

    if (genMode === 'pollinations' && result.imagePrompt) {
      try {
        const pollinationsUrl = typeof getPollinationsImageUrl === 'function'
          ? getPollinationsImageUrl(result.imagePrompt)
          : `https://image.pollinations.ai/prompt/${encodeURIComponent(result.imagePrompt)}`;
        const imgResp = await fetch(pollinationsUrl);
        if (imgResp.ok) {
          const blob = await imgResp.blob();
          imageData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
      } catch(e) {}
    } else if (genMode === 'nai' && result.imagePrompt) {
      try {
        const naiResult = await generateNaiImageFromPrompt(result.imagePrompt, charId);
        if (naiResult && naiResult.base64) imageData = 'data:image/png;base64,' + naiResult.base64;
      } catch(e) {}
    } else if (genMode === 'imagen' && result.imagePrompt) {
      try {
        const imagenResult = await generateGoogleImagenFromPrompt(result.imagePrompt);
        if (imagenResult && imagenResult.base64) imageData = 'data:image/png;base64,' + imagenResult.base64;
      } catch(e) {}
    }

    const newPhoto = {
      id: 'ap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      author: 'char',
      timestamp: Date.now(),
      description: result.description,
      imageData: imageData,
      type: imageData ? 'ai_gen' : 'text',
      tags: result.tags || [],
      imagePrompt: result.imagePrompt || ''
    };

    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceAlbumAutoResult',
      photo: newPhoto
    }, 'coupleAlbum_', newPhoto);
    if (saved) successCount++;
  } catch(err) {
    console.error('Auto album post failed:', err);
  }
  } // end for loop
  return successCount > 0;
}

async function askAiIfShouldPostPhoto(chat) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) return false;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的互动，判断现在是否想在相册里发一张照片。

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

考虑：是否有值得记录的事、你的心情、最近相册是否太久没更新。
请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '想发照片吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '想发照片吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return false;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    return answer.includes('yes');
  } catch(e) {
    return false;
  }
}

// Initialize auto album timers when app loads
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceAlbumAutoTimer, 6000);
}
