// ========== Chat Screenshot for Album ==========

async function handleCoupleSpaceScreenshotRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceScreenshotResult', error: true }, '*');
    return;
  }

  try {
    // Add timeout to prevent hanging forever
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Screenshot timeout')), 30000)
    );
    const result = await Promise.race([
      generateChatScreenshot(chat, data),
      timeoutPromise
    ]);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceScreenshotResult',
      imageData: result.imageData,
      description: result.description,
      tags: result.tags || ['聊天截图'],
      meta: result.meta
    }, '*');
  } catch(err) {
    console.error('Screenshot error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceScreenshotResult', error: true }, '*');
  }
}

async function generateChatScreenshot(chat, data) {
  const ctx = buildDiaryAiContext(chat);
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();

  // Step 1: Ask AI to pick a memorable conversation segment
  let selectedMessages = [];
  let description = '';
  let tags = ['聊天截图'];

  if (proxyUrl && apiKey && model) {
    const recentMsgs = chat.history
      .filter(m => !m.isExcluded && !m.isHidden && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-30);

    if (recentMsgs.length > 0) {
      const msgList = recentMsgs.map((m, i) => {
        const sender = m.role === 'user' ? ctx.myNickname : ctx.charName;
        const content = String(m.content || '').substring(0, 200);
        return `[${i}] ${sender}: ${content}`;
      }).join('\n');

      const prompt = `你是"${ctx.charName}"。你想从最近的聊天记录中截一段有纪念意义或甜蜜的对话保存到相册。

最近的对话:
${msgList}

请选择一段连续的对话（3-8条消息），并写一段配文。
以JSON格式返回：
{"startIndex": 起始索引, "endIndex": 结束索引, "description": "截图配文", "tags": ["标签1"]}

要求：
- 选择有意义的片段（甜蜜、搞笑、感动、重要时刻等）
- 配文像发朋友圈一样自然
- 不要提到你是AI`;

      try {
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 20000);

        const isGemini = proxyUrl === GEMINI_API_URL;
        let response;
        if (isGemini) {
          const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '选一段对话截图吧' }]);
          if (geminiConfig.data && typeof geminiConfig.data === 'object' && !(geminiConfig.data instanceof FormData)) {
            geminiConfig.data.signal = controller.signal;
          }
          response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
        } else {
          response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: getCoupleSpaceRequestHeaders(apiKey),
            body: JSON.stringify({
              model,
              messages: [{ role: 'system', content: prompt }, { role: 'user', content: '选一段对话截图吧' }],
              temperature: 0.7
            }),
            signal: controller.signal
          });
        }
        clearTimeout(abortTimer);

        if (response.ok) {
          const respData = await response.json();
          const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
          const result = JSON.parse(raw);
          const start = Math.max(0, result.startIndex || 0);
          const end = Math.min(recentMsgs.length - 1, result.endIndex || start + 4);
          selectedMessages = recentMsgs.slice(start, end + 1);
          description = result.description || '';
          tags = result.tags || ['聊天截图'];
        }
      } catch(e) {
        console.error('AI screenshot selection failed:', e);
      }
    }
  }

  // Fallback: use last 5 messages
  if (selectedMessages.length === 0) {
    selectedMessages = chat.history
      .filter(m => !m.isExcluded && !m.isHidden && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-5);
    description = '记录一下我们的日常';
  }

  // If still no messages, throw
  if (selectedMessages.length === 0) {
    throw new Error('No messages to screenshot');
  }

  // Step 2: Render messages to Canvas
  const imageData = renderChatToCanvas(selectedMessages, chat, ctx);

  return {
    imageData,
    description,
    tags,
    meta: {
      messageCount: selectedMessages.length,
      timeRange: selectedMessages.length > 0 ? {
        start: selectedMessages[0].timestamp,
        end: selectedMessages[selectedMessages.length - 1].timestamp
      } : null
    }
  };
}

function renderChatToCanvas(messages, chat, ctx) {
  const canvas = document.createElement('canvas');
  const dpr = 2; // retina
  const W = 375 * dpr;
  const padding = 16 * dpr;
  const bubbleMaxW = 240 * dpr;
  const avatarSize = 32 * dpr;
  const fontSize = 14 * dpr;
  const smallFontSize = 10 * dpr;
  const lineHeight = fontSize * 1.5;
  const bubblePadH = 12 * dpr;
  const bubblePadV = 10 * dpr;
  const bubbleRadius = 16 * dpr;
  const msgGap = 12 * dpr;
  const avatarGap = 8 * dpr;

  // Pre-calculate height using a temporary small canvas for text measurement
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 1;
  tmpCanvas.height = 1;
  const c2d = tmpCanvas.getContext('2d');
  c2d.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  let totalH = padding * 2; // top + bottom padding
  // Header
  totalH += 40 * dpr; // header area

  const msgLayouts = [];
  messages.forEach(msg => {
    const isUser = msg.role === 'user';
    const text = String(msg.content || '').substring(0, 500);
    const lines = wrapText(c2d, text, bubbleMaxW - bubblePadH * 2);
    const bubbleH = lines.length * lineHeight + bubblePadV * 2;
    const bubbleW = Math.min(bubbleMaxW, Math.max(...lines.map(l => c2d.measureText(l).width)) + bubblePadH * 2 + 4 * dpr);
    msgLayouts.push({ isUser, text, lines, bubbleH, bubbleW });
    totalH += bubbleH + msgGap;
  });

  totalH += padding;
  
  // Now set the actual canvas to the correct size
  canvas.width = W;
  canvas.height = totalH;
  const drawCtx = canvas.getContext('2d');

  // Draw background
  drawCtx.fillStyle = '#FAF9F8';
  drawCtx.fillRect(0, 0, W, totalH);

  // Draw header
  drawCtx.fillStyle = '#1c1917';
  drawCtx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  drawCtx.textAlign = 'center';
  drawCtx.fillText(ctx.charName, W / 2, padding + 24 * dpr);
  drawCtx.textAlign = 'left';

  // Draw separator
  let y = padding + 40 * dpr;
  drawCtx.strokeStyle = '#f0efed';
  drawCtx.lineWidth = dpr;
  drawCtx.beginPath();
  drawCtx.moveTo(padding, y);
  drawCtx.lineTo(W - padding, y);
  drawCtx.stroke();
  y += 12 * dpr;

  // Draw messages
  drawCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  msgLayouts.forEach(layout => {
    const { isUser, lines, bubbleH, bubbleW } = layout;

    let bubbleX, textStartX;
    if (isUser) {
      bubbleX = W - padding - bubbleW;
      textStartX = bubbleX + bubblePadH;
    } else {
      bubbleX = padding + avatarSize + avatarGap;
      textStartX = bubbleX + bubblePadH;
    }

    // Draw avatar circle (simple colored circle)
    if (!isUser) {
      drawCtx.fillStyle = '#fda4af';
      drawCtx.beginPath();
      drawCtx.arc(padding + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      drawCtx.fill();
      // Initial letter
      drawCtx.fillStyle = 'white';
      drawCtx.font = `600 ${smallFontSize * 1.4}px sans-serif`;
      drawCtx.textAlign = 'center';
      drawCtx.fillText(ctx.charName.charAt(0), padding + avatarSize / 2, y + avatarSize / 2 + smallFontSize * 0.4);
      drawCtx.textAlign = 'left';
    } else {
      const ax = W - padding - avatarSize / 2;
      drawCtx.fillStyle = '#a8a29e';
      drawCtx.beginPath();
      drawCtx.arc(ax, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      drawCtx.fill();
      drawCtx.fillStyle = 'white';
      drawCtx.font = `600 ${smallFontSize * 1.4}px sans-serif`;
      drawCtx.textAlign = 'center';
      drawCtx.fillText((ctx.myNickname || '我').charAt(0), ax, y + avatarSize / 2 + smallFontSize * 0.4);
      drawCtx.textAlign = 'left';
      // Adjust bubbleX for user (left of avatar)
      bubbleX = W - padding - avatarSize - avatarGap - bubbleW;
      textStartX = bubbleX + bubblePadH;
    }

    // Draw bubble
    drawCtx.fillStyle = isUser ? '#1c1917' : 'white';
    roundRect(drawCtx, bubbleX, y, bubbleW, bubbleH, bubbleRadius);
    drawCtx.fill();
    if (!isUser) {
      drawCtx.strokeStyle = '#f0efed';
      drawCtx.lineWidth = dpr;
      roundRect(drawCtx, bubbleX, y, bubbleW, bubbleH, bubbleRadius);
      drawCtx.stroke();
    }

    // Draw text
    drawCtx.fillStyle = isUser ? 'white' : '#1c1917';
    drawCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    lines.forEach((line, i) => {
      drawCtx.fillText(line, textStartX, y + bubblePadV + fontSize + i * lineHeight);
    });

    y += bubbleH + msgGap;
  });

  // Draw watermark
  drawCtx.fillStyle = '#d6d3d1';
  drawCtx.font = `${smallFontSize}px sans-serif`;
  drawCtx.textAlign = 'center';
  drawCtx.fillText('情侣空间 · 聊天截图', W / 2, totalH - padding / 2);

  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = text.split('\n');
  paragraphs.forEach(para => {
    if (!para) { lines.push(''); return; }
    let current = '';
    for (let i = 0; i < para.length; i++) {
      const test = current + para[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = para[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  });
  if (lines.length === 0) lines.push('');
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ========== Auto Screenshot Scheduler ==========
let coupleSpaceScreenshotTimers = {};

function setupCoupleSpaceScreenshotTimer() {
  Object.values(coupleSpaceScreenshotTimers).forEach(t => clearInterval(t));
  coupleSpaceScreenshotTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    // Check every 4 hours if there's something worth screenshotting
    coupleSpaceScreenshotTimers[space.charId] = setInterval(() => {
      triggerAutoScreenshot(space.charId);
    }, 14400000);
  });
}

async function triggerAutoScreenshot(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) return;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的对话，判断是否有值得截图保存到相册的甜蜜/有趣/感动的对话片段。

最近的对话:
${ctx.shortTermMemory || '(无)'}

请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '想截图吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '想截图吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    if (answer.includes('yes')) {
      await handleCoupleSpaceScreenshotRequest({ charId });
    }
  } catch(e) {
    console.error('Auto screenshot check failed:', e);
  }
}

try { setupCoupleSpaceScreenshotTimer(); } catch(e) {}

// ========== Garden (Tree) Integration ==========
