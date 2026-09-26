
function handleCoupleSpaceGardenChanged(data) {
  localStorage.setItem('coupleGarden_' + data.charId, JSON.stringify(data.gardenData || {}));
}

function handleCoupleSpaceGardenSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleGardenSettings_', ['coupleGardenAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 浇水 设置并重新初始化定时器`);
  setupCoupleSpaceGardenAutoTimer();
}

async function handleCoupleSpaceGardenWaterReward(data) {
  const success = await applyCoupleSpaceGardenReward(data);
  const iframe = document.getElementById('couple-space-iframe');
  if (iframe && iframe.contentWindow && localStorage.getItem('coupleSpaceLastId') === data.charId) {
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenWaterRewardResult',
      charId: data.charId,
      transactionId: data.transactionId || '',
      success
    }, '*');
  }
  return success;
}

let coupleSpaceGardenRewardQueue = Promise.resolve();

function getCoupleSpaceGardenRewardLedger() {
  try { return JSON.parse(localStorage.getItem('coupleGardenRewardLedger') || '{}'); }
  catch(e) { return {}; }
}

function saveCoupleSpaceGardenRewardLedger(ledger) {
  const entries = Object.entries(ledger);
  if (entries.length > 500) {
    entries.sort((a, b) => (b[1].completedAt || 0) - (a[1].completedAt || 0));
    ledger = Object.fromEntries(entries.slice(0, 500));
  }
  localStorage.setItem('coupleGardenRewardLedger', JSON.stringify(ledger));
}

function applyCoupleSpaceGardenReward(data) {
  const transactionId = data.transactionId || [
    'garden', data.charId, data.author, Number(data.amount).toFixed(2), data.description || '', Date.now()
  ].join('-');
  const task = coupleSpaceGardenRewardQueue.then(async () => {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return false;

    const ledger = getCoupleSpaceGardenRewardLedger();
    if (ledger[transactionId] && ledger[transactionId].state === 'completed') return true;

    try {
      if (data.author === 'user') {
        if (typeof db === 'undefined' || !db.userWallet || !db.userTransactions) return false;
        await db.transaction('rw', db.userWallet, db.userTransactions, async () => {
          const existing = await db.userTransactions.filter(item => item.transactionId === transactionId).first();
          if (existing) return;
          let wallet = await db.userWallet.get('main');
          if (!wallet) wallet = { id: 'main', balance: 0, kinshipCards: [] };
          if (typeof wallet.balance !== 'number' || Number.isNaN(wallet.balance)) wallet.balance = 0;
          wallet.balance += amount;
          await db.userWallet.put(wallet);
          await db.userTransactions.add({
            timestamp: Date.now(),
            type: 'income',
            amount,
            description: data.description || '情侣树浇水奖励',
            transactionId
          });
          window.userBalance = wallet.balance;
        });
      } else if (data.author === 'char') {
        const chat = state.chats[data.charId];
        if (!chat || typeof db === 'undefined' || !db.chats) return false;
        if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
        if (!Array.isArray(chat.coupleGardenRewardTransactionIds)) chat.coupleGardenRewardTransactionIds = [];
        if (chat.coupleGardenRewardTransactionIds.includes(transactionId)) return true;
        const previousBalance = Number(chat.simulatedTaobaoHistory.totalBalance) || 0;
        const previousTransactionIds = chat.coupleGardenRewardTransactionIds.slice();
        chat.simulatedTaobaoHistory.totalBalance = previousBalance + amount;
        chat.coupleGardenRewardTransactionIds.push(transactionId);
        if (chat.coupleGardenRewardTransactionIds.length > 500) {
          chat.coupleGardenRewardTransactionIds = chat.coupleGardenRewardTransactionIds.slice(-500);
        }
        try {
          await db.chats.put(chat);
        } catch (error) {
          chat.simulatedTaobaoHistory.totalBalance = previousBalance;
          chat.coupleGardenRewardTransactionIds = previousTransactionIds;
          throw error;
        }
      } else {
        return false;
      }

      ledger[transactionId] = {
        state: 'completed',
        completedAt: Date.now(),
        charId: data.charId,
        author: data.author,
        amount
      };
      saveCoupleSpaceGardenRewardLedger(ledger);
      return true;
    } catch(e) {
      console.error('Garden water reward error:', e);
      return false;
    }
  });
  coupleSpaceGardenRewardQueue = task.catch(() => false);
  return task;
}

function calculateCoupleSpaceGardenReward(gardenData, now = new Date()) {
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const defaultDates = {
    '01-01': ['元旦', 100], '02-14': ['情人节', 520], '03-08': ['妇女节', 38],
    '03-14': ['白色情人节', 314], '05-01': ['劳动节', 51], '05-20': ['520', 520],
    '05-21': ['521', 521], '06-01': ['儿童节', 61], '07-07': ['七夕', 77.77],
    '10-01': ['国庆节', 101], '11-11': ['光棍节', 111.10], '12-24': ['平安夜', 124],
    '12-25': ['圣诞节', 125], '12-31': ['跨年', 131.40]
  };
  let special = defaultDates[mmdd] ? { name: defaultDates[mmdd][0], coins: defaultDates[mmdd][1] } : null;
  if (!special) {
    const custom = (gardenData.specialDates || []).find(item => item.date === mmdd);
    if (custom) special = { name: custom.name, coins: Number(custom.coins) || 0 };
  }
  if (!special) {
    try {
      const anniversaries = JSON.parse(localStorage.getItem('coupleAnniv_' + gardenData.charId) || '[]');
      const anniversary = anniversaries.find(item => item.date && item.date.slice(5) === mmdd);
      if (anniversary) special = { name: anniversary.title, coins: 1314 };
    } catch(e) {}
  }
  const amount = special && special.coins > 0 ? special.coins : 5.20;
  return {
    amount,
    special: special ? { name: special.name, coins: amount } : null,
    description: special ? `情侣树浇水-${special.name}` : '情侣树自动浇水奖励'
  };
}

function getCoupleSpaceGardenRepairTransactionId(charId, water, index) {
  return water.rewardTransactionId || (water.id
    ? 'garden-water-' + water.id
    : ['garden-repair', charId, Number(water.createdAt) || 0, water.author || 'unknown', index].join('-'));
}

async function isCoupleSpaceGardenRewardSettled(charId, water, transactionId) {
  if (water.rewardSettled === true) return true;
  const ledger = getCoupleSpaceGardenRewardLedger();
  if (ledger[transactionId]?.state === 'completed') return true;
  if (water.author === 'char') {
    return state.chats[charId]?.coupleGardenRewardTransactionIds?.includes(transactionId) === true;
  }
  if (water.author === 'user' && typeof db !== 'undefined' && db.userTransactions) {
    try {
      return Boolean(await db.userTransactions.filter(item => item.transactionId === transactionId).first());
    } catch (error) {
      console.warn('[情侣树] 检查历史奖励到账记录失败，将在确认时再次核验:', error);
    }
  }
  return false;
}

async function getCoupleSpaceGardenRepairCandidates() {
  const candidates = [];
  for (const space of getCoupleSpaces()) {
    let gardenData;
    try { gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + space.charId) || '{}'); }
    catch (_) { continue; }
    const waterLogs = Array.isArray(gardenData.waterLogs) ? gardenData.waterLogs : [];
    const knownRewardTotal = waterLogs.reduce((sum, item) => {
      const amount = Number(item.coinsEarned);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
    for (let index = 0; index < waterLogs.length; index += 1) {
      const water = waterLogs[index];
      const existingAmount = Number(water.coinsEarned);
      if (Number.isFinite(existingAmount) && existingAmount > 0) continue;
      if (!['user', 'char'].includes(water.author)) continue;
      const createdAt = new Date(water.createdAt);
      if (!Number.isFinite(createdAt.getTime())) continue;
      const reward = calculateCoupleSpaceGardenReward({ ...gardenData, charId: space.charId }, createdAt);
      if (!reward.special && water.author === 'user') reward.description = '情侣树浇水奖励';
      if (!Number.isFinite(reward.amount) || reward.amount <= 0) continue;
      const transactionId = getCoupleSpaceGardenRepairTransactionId(space.charId, water, index);
      const settled = await isCoupleSpaceGardenRewardSettled(space.charId, water, transactionId);
      const totalCoins = Math.max(0, Number(gardenData.totalCoins) || 0);
      const treeDelta = Math.max(0, knownRewardTotal + reward.amount - totalCoins);
      candidates.push({
        charId: space.charId,
        waterId: water.id || null,
        waterIndex: index,
        createdAt: createdAt.getTime(),
        author: water.author,
        content: String(water.content || ''),
        existingAmount: Number.isFinite(existingAmount) ? existingAmount : null,
        amount: reward.amount,
        special: reward.special,
        description: reward.description,
        transactionId,
        walletDelta: settled ? 0 : reward.amount,
        treeDelta,
        settled
      });
    }
  }
  return candidates;
}

async function countCoupleSpaceGardenRepairCandidates() {
  return (await getCoupleSpaceGardenRepairCandidates()).length;
}

function closeCoupleSpaceGardenRepairPreview() {
  const modal = document.getElementById('garden-repair-modal');
  modal?.classList.remove('visible');
  modal?.setAttribute('aria-hidden', 'true');
}

function bindCoupleSpaceGardenRepairPreview() {
  const modal = document.getElementById('garden-repair-modal');
  if (!modal || modal.dataset.repairBound === '1') return;
  modal.dataset.repairBound = '1';
  document.getElementById('garden-repair-close-btn')?.addEventListener('click', closeCoupleSpaceGardenRepairPreview);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeCoupleSpaceGardenRepairPreview();
  });
}

async function openCoupleSpaceGardenRepairPreview() {
  bindCoupleSpaceGardenRepairPreview();
  const modal = document.getElementById('garden-repair-modal');
  const list = document.getElementById('garden-repair-list');
  const summary = document.getElementById('garden-repair-summary');
  if (!modal || !list || !summary) return;
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
  list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">正在检查历史记录…</p>';
  const candidates = await getCoupleSpaceGardenRepairCandidates();
  summary.textContent = candidates.length
    ? `发现 ${candidates.length} 条金额缺失记录。不会自动修改；每次只处理你确认的这一条。`
    : '未发现需要修复的历史浇水奖励记录。';
  list.innerHTML = '';
  if (candidates.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px 0;">当前记录无需处理</p>';
    return;
  }
  candidates.forEach((candidate, candidateIndex) => {
    const chat = state.chats[candidate.charId];
    const item = document.createElement('article');
    item.className = 'garden-repair-item';
    const title = document.createElement('div');
    title.className = 'garden-repair-item-title';
    title.textContent = `${chat?.name || '未知角色'} · ${candidate.author === 'user' ? '我的浇水' : '角色浇水'}`;
    const meta = document.createElement('div');
    meta.className = 'garden-repair-item-meta';
    const specialText = candidate.special?.name ? `（${candidate.special.name}）` : '';
    meta.textContent = `${new Date(candidate.createdAt).toLocaleString()} · 原金额 ${candidate.existingAmount ?? '缺失'} · 建议 ¥${candidate.amount.toFixed(2)}${specialText} · 钱包 +¥${candidate.walletDelta.toFixed(2)} · 树累计 +¥${candidate.treeDelta.toFixed(2)}`;
    const content = document.createElement('div');
    content.className = 'garden-repair-item-content';
    content.textContent = candidate.content || '（无浇水文字）';
    const actions = document.createElement('div');
    actions.className = 'garden-repair-item-actions';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'garden-repair-confirm-btn';
    confirmButton.textContent = candidate.settled ? '确认修正记录' : '确认修正并补发';
    confirmButton.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm(
        '确认这一条奖励修复',
        `将这条浇水记录修正为 ¥${candidate.amount.toFixed(2)}。${candidate.walletDelta > 0 ? `对应钱包将补发 ¥${candidate.walletDelta.toFixed(2)}。` : '检测到已有到账凭据，不会重复补发钱包。'}${candidate.treeDelta > 0 ? `情侣树累计增加 ¥${candidate.treeDelta.toFixed(2)}。` : '情侣树累计无需重复增加。'}只处理这一条，是否继续？`
      );
      if (!confirmed) return;
      confirmButton.disabled = true;
      const success = await applyCoupleSpaceGardenRepairCandidate(candidate);
      if (success) {
        showToast('这条历史浇水奖励已修复', 'success');
        await openCoupleSpaceGardenRepairPreview();
      } else {
        confirmButton.disabled = false;
        showToast('修复未完成，请重新打开清单核对到账状态', 'error');
      }
    });
    actions.appendChild(confirmButton);
    item.append(title, meta, content, actions);
    list.appendChild(item);
  });
}

async function applyCoupleSpaceGardenRepairCandidate(candidate) {
  let gardenData;
  try { gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + candidate.charId) || '{}'); }
  catch (_) { return false; }
  const waterLogs = Array.isArray(gardenData.waterLogs) ? gardenData.waterLogs : [];
  const water = candidate.waterId
    ? waterLogs.find(item => item.id === candidate.waterId)
    : waterLogs[candidate.waterIndex];
  if (!water || Number(water.createdAt) !== candidate.createdAt || water.author !== candidate.author) return false;
  const currentAmount = Number(water.coinsEarned);
  if (Number.isFinite(currentAmount) && currentAmount > 0) return true;
  const settled = await isCoupleSpaceGardenRewardSettled(candidate.charId, water, candidate.transactionId);
  if (!settled) {
    const rewardSuccess = await applyCoupleSpaceGardenReward({
      charId: candidate.charId,
      author: candidate.author,
      amount: candidate.amount,
      description: candidate.description,
      transactionId: candidate.transactionId
    });
    if (!rewardSuccess) return false;
  }
  water.coinsEarned = candidate.amount;
  water.specialDate = candidate.special;
  water.rewardTransactionId = candidate.transactionId;
  water.rewardSettled = true;
  const knownRewardTotal = waterLogs.reduce((sum, item) => {
    const amount = Number(item.coinsEarned);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  gardenData.totalCoins = Math.max(Number(gardenData.totalCoins) || 0, knownRewardTotal);
  try {
    localStorage.setItem('coupleGarden_' + candidate.charId, JSON.stringify(gardenData));
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe?.contentWindow && localStorage.getItem('coupleSpaceLastId') === candidate.charId) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceGardenRepairApplied',
        charId: candidate.charId,
        waterId: water.id || ''
      }, '*');
    }
    return true;
  } catch (error) {
    console.error('[情侣树] 保存历史奖励修复失败:', error);
    return false;
  }
}

window.openCoupleSpaceGardenRepairPreview = openCoupleSpaceGardenRepairPreview;
window.countCoupleSpaceGardenRepairCandidates = countCoupleSpaceGardenRepairCandidates;

async function handleCoupleSpaceGardenAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceGardenAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenAiResult',
      content: result.content
    }, '*');
  } catch(err) {
    console.error('Garden AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceGardenCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceGardenComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenCommentResult',
      waterId: data.waterId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Garden comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
  }
}

async function handleCoupleSpaceGardenHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给你们的情侣树浇了水，写了："${data.waterContent || ''}"，并点了爱心。
你会不会也想给这条浇水记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenHeartResult',
      waterId: data.waterId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Garden heart AI error:', e);
  }
}

async function generateCoupleSpaceGardenAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const gardenSettings = data.gardenSettings || {};
  const maxCharVisible = gardenSettings.visibleCharWaters ?? 10;
  const maxUserVisible = gardenSettings.visibleUserWaters ?? 10;
  const items = data.existingWaters || [];
  const charWaters = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userWaters = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharWatersText = '';
  if (charWaters.length > 0) {
    existingCharWatersText = charWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  let existingUserWatersText = '';
  if (userWaters.length > 0) {
    existingUserWatersText = userWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  const treeStatus = data.treeStatus || '';

  let systemPrompt;
  if (gardenSettings.enableCustomPrompt && gardenSettings.customPrompt) {
    systemPrompt = gardenSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharWaters\}\}/g, existingCharWatersText ? '# 你之前的浇水记录\n' + existingCharWatersText : '')
      .replace(/\{\{existingUserWaters\}\}/g, existingUserWatersText ? '# 伴侣的浇水记录\n' + existingUserWatersText : '')
      .replace(/\{\{treeStatus\}\}/g, treeStatus ? '# 树的状态\n' + treeStatus : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要给情侣空间里你们共同种的树浇水。
浇水就是写一段话挂在树上，像给树系上的小纸条。

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

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.gardenContext ? '# 情侣树\n' + ctx.gardenContext : ''}

${existingCharWatersText ? '# 你之前的浇水记录（避免重复）\n' + existingCharWatersText : ''}

${existingUserWatersText ? '# 伴侣的浇水记录（参考）\n' + existingUserWatersText : ''}

${treeStatus ? '# 树的状态\n' + treeStatus : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"content": "浇水文字"}

# 写作要求
- 浇水文字在10-200字之间
- 像给树挂上一张小纸条，写给对方或写给这棵树
- 可以是对伴侣的想念、感悟、期待、鼓励、撒娇
- 语气符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和之前的浇水记录不要重复
- 可以提到树的成长状态，表达对未来的期待
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请给树浇水吧。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return parseCoupleSpaceJson(raw);
}

async function generateCoupleSpaceGardenComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"给你们的情侣树浇了水，写了一段话，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 浇水内容
${data.waterContent || '(无文字)'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论一样自然
- 字数在10-80字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条浇水记录。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8, top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0, presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0, frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Garden Scheduler ==========
let coupleSpaceGardenTimers = {};

function setupCoupleSpaceGardenAutoTimer() {
  Object.values(coupleSpaceGardenTimers).forEach(t => clearInterval(t));
  coupleSpaceGardenTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 浇水 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleGardenAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 浇水 的自动生成`);
          return triggerAutoGardenWater(space.charId, true);
        });
        scheduleGardenAutoWater(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleGardenAutoWater(charId, timeStr) {
  coupleSpaceGardenTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleGardenAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 浇水 的自动生成`);
      return triggerAutoGardenWater(charId, true);
    });
  }, 60000);
}

async function triggerAutoGardenWater(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 浇水记录...`);
  try {
    const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + charId) || '{}');
    const waterLogs = gardenData.waterLogs || [];
    const result = await generateCoupleSpaceGardenAi(chat, {
      charId,
      existingWaters: waterLogs,
      gardenSettings: settings,
      treeStatus: ''
    });
    gardenData.charId = charId;
    const reward = calculateCoupleSpaceGardenReward(gardenData);
    const newWater = {
      id: 'water_auto_' + charId + '_' + getCoupleSpaceLocalDateKey(),
      content: result.content,
      author: 'char',
      createdAt: Date.now(),
      coinsEarned: reward.amount,
      specialDate: reward.special,
      rewardTransactionId: '',
      rewardSettled: false,
      hearts: { char: true },
      comments: []
    };
    newWater.rewardTransactionId = 'garden-water-' + newWater.id;
    const rewardSaved = await applyCoupleSpaceGardenReward({
      charId,
      author: 'char',
      amount: reward.amount,
      description: reward.description,
      transactionId: newWater.rewardTransactionId
    });
    if (!rewardSaved) throw new Error('自动浇水奖励入账失败');
    newWater.rewardSettled = true;

    gardenData.waterLogs = waterLogs;
    gardenData.waterLogs.push(newWater);
    gardenData.totalCoins = (Number(gardenData.totalCoins) || 0) + reward.amount;
    localStorage.setItem('coupleGarden_' + charId, JSON.stringify(gardenData));

    const iframe = document.getElementById('couple-space-iframe');
    const isIframeOpenForThisChar = iframe && iframe.src && iframe.src.includes(COUPLE_SPACE_IFRAME_PATH) && localStorage.getItem('coupleSpaceLastId') === charId;
    
    if (isIframeOpenForThisChar && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAutoResult', item: newWater }, '*');
    }
    return true;
  } catch(err) {
    console.error('Auto garden water failed:', err);
    return false;
  }
}

// Initialize garden timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceGardenAutoTimer, 10000);
}

