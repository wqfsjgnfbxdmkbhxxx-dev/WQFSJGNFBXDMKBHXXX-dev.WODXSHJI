// ========== 情侣空间 ==========
const COUPLE_SPACE_STORAGE_KEY = 'coupleSpaces';
const COUPLE_SPACE_IFRAME_PATH = 'archive/330--main/index.html';
const coupleSpaceRunsInFlight = new Set();

// 获取情侣空间API配置（优先使用情侣空间专用API，否则回退到主API）
function getCoupleSpaceApiConfig() {
  const useCoupleSpaceApi = state.apiConfig.couplespaceProxyUrl &&
                            state.apiConfig.couplespaceModel;
  
  if (useCoupleSpaceApi) {
    return {
      proxyUrl: state.apiConfig.couplespaceProxyUrl,
      apiKey: state.apiConfig.couplespaceApiKey,
      model: state.apiConfig.couplespaceModel
    };
  } else {
    return {
      proxyUrl: state.apiConfig.proxyUrl,
      apiKey: state.apiConfig.apiKey,
      model: state.apiConfig.model
    };
  }
}

function getCoupleSpaceLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCoupleSpaceRequestHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function fetchCoupleSpaceWithTimeout(url, options, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('情侣空间 API 请求超时');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCoupleSpaceJson(rawText) {
  const text = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch (originalError) {
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    const starts = [objectStart, arrayStart].filter(index => index >= 0);
    if (starts.length === 0) throw originalError;
    const start = Math.min(...starts);
    const endToken = text[start] === '[' ? ']' : '}';
    const end = text.lastIndexOf(endToken);
    if (end <= start) throw originalError;
    return JSON.parse(text.slice(start, end + 1));
  }
}

function saveCoupleSpaceSettingsWithSchedule(data, settingsPrefix, lastKeys, scheduleFields) {
  const storageKey = settingsPrefix + data.charId;
  let previous = {};
  try { previous = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) {}
  const next = data.settings || {};
  const scheduleChanged = scheduleFields.some(field => previous[field] !== next[field]);
  localStorage.setItem(storageKey, JSON.stringify(next));
  if (scheduleChanged) {
    lastKeys.forEach(key => {
      localStorage.removeItem(key + data.charId);
      localStorage.removeItem(key + data.charId + '_status');
    });
  }
  return scheduleChanged;
}

function runCoupleSpaceOncePerDay(lastKey, callback) {
  const todayStr = getCoupleSpaceLocalDateKey();
  if (localStorage.getItem(lastKey) === todayStr || coupleSpaceRunsInFlight.has(lastKey)) {
    return Promise.resolve(false);
  }

  let previousStatus = {};
  try { previousStatus = JSON.parse(localStorage.getItem(lastKey + '_status') || '{}'); } catch(e) {}
  if (previousStatus.state === 'failed' && previousStatus.attemptedAt) {
    const retryCount = Math.max(1, Number(previousStatus.retryCount) || 1);
    const retryDelay = Math.min(60 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, retryCount - 1));
    if (Date.now() - previousStatus.attemptedAt < retryDelay) return Promise.resolve(false);
  }

  coupleSpaceRunsInFlight.add(lastKey);
  const retryCount = previousStatus.state === 'failed' ? (Number(previousStatus.retryCount) || 1) + 1 : 0;
  localStorage.setItem(lastKey + '_status', JSON.stringify({ state: 'running', attemptedAt: Date.now(), retryCount }));

  return Promise.resolve()
    .then(callback)
    .then(success => {
      if (success === false) {
        localStorage.setItem(lastKey + '_status', JSON.stringify({ state: 'failed', attemptedAt: Date.now(), retryCount: Math.max(1, retryCount) }));
        return false;
      }
      localStorage.setItem(lastKey, todayStr);
      localStorage.setItem(lastKey + '_status', JSON.stringify({ state: 'success', completedAt: Date.now() }));
      return true;
    })
    .catch(error => {
      console.error(`[情侣空间] 自动任务执行失败 (${lastKey})`, error);
      localStorage.setItem(lastKey + '_status', JSON.stringify({
        state: 'failed',
        attemptedAt: Date.now(),
        retryCount: Math.max(1, retryCount),
        message: error && error.message ? error.message : String(error)
      }));
      return false;
    })
    .finally(() => coupleSpaceRunsInFlight.delete(lastKey));
}

// 通用定时补执行工具：检查今天是否已过设定时间但还没执行过，如果是则立即补执行
// 通用情侣空间离线保存/推送工具
function sendOrSaveCoupleSpaceData(charId, msgObj, storageKey, itemToSave) {
  const iframe = document.getElementById('couple-space-iframe');
  const isIframeOpenForThisChar = iframe && iframe.src && iframe.src.includes(COUPLE_SPACE_IFRAME_PATH) && localStorage.getItem('coupleSpaceLastId') === charId;
  
  if (isIframeOpenForThisChar && iframe.contentWindow) {
    try {
      iframe.contentWindow.postMessage(msgObj, '*');
      console.log(`[情侣空间] 📥 已将数据 (${msgObj.type}) 推送到打开的页面`);
      return true;
    } catch(e) { console.error('Failed to notify iframe:', e); return false; }
  } else if (storageKey && itemToSave) {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey + charId) || '[]');
      items.push(itemToSave);
      localStorage.setItem(storageKey + charId, JSON.stringify(items));
      console.log(`[情侣空间] 💾 页面未打开，已将数据安全保存到本地离线存储 (${storageKey})`);
      
      // 检查是否开启了后台更新弹窗提醒
      const chat = state.chats[charId];
      if (chat && chat.settings && chat.settings.enableCoupleSpaceNotify) {
        let actionDesc = '留了点东西';
        if (msgObj.type === 'coupleSpaceDiaryAutoWritten') actionDesc = '写了一篇新日记';
        else if (msgObj.type === 'coupleSpaceAlbumAutoResult') actionDesc = '发了一张新照片';
        else if (msgObj.type === 'coupleSpaceAnnivAiCreated') actionDesc = '创建了一个纪念日';
        else if (msgObj.type === 'coupleSpaceChecklistAutoResult') actionDesc = '添加了一个愿望清单';
        else if (msgObj.type === 'coupleSpaceMessageAutoResult') actionDesc = '给你留了言';
        else if (msgObj.type === 'coupleSpaceMoodAutoResult') actionDesc = '更新了心情';
        else if (msgObj.type === 'coupleSpaceTimelineAutoResult') actionDesc = '记录了时光轴';
        else if (msgObj.type === 'coupleSpaceLetterAutoResult') actionDesc = '写了一封信';
        else if (msgObj.type === 'coupleSpaceGardenAutoResult') actionDesc = '给情侣树浇了水';
        else if (msgObj.type === 'coupleSpaceLocationAutoResult') actionDesc = '分享了新定位';
        else if (msgObj.type === 'coupleSpaceSleepAutoResult') {
          if (msgObj.phase === 'sleep') actionDesc = '记录了入睡';
          else if (msgObj.phase === 'wake') actionDesc = '记录了起床';
        }
        else if (msgObj.type === 'coupleSpaceFinanceAutoResult') actionDesc = '记了一笔账';
        
        const notificationText = `“${chat.name || 'TA'}”好像在情侣空间里${actionDesc}哦～`;
        
        if (typeof showToast === 'function') {
          showToast(notificationText, 'info', 5000);
        } else if (typeof showNotification === 'function') {
          showNotification(charId, notificationText);
        } else {
          console.log(`[情侣空间提醒] ${notificationText}`);
        }
      }
      return true;
    } catch(e) { console.error('Failed to save offline or notify:', e); return false; }
  }
  return false;
}

// 通用定时补执行工具：检查今天是否已过设定时间但还没执行过，如果是则立即补执行
function checkAndRunMissed(timeStr, lastKey, callback) {
  try {
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return Promise.resolve(false);
    const todayStr = getCoupleSpaceLocalDateKey(now);
    const lastDate = localStorage.getItem(lastKey);
    if (lastDate === todayStr) return Promise.resolve(false); // 今天已经执行过
    // 当前时间已经过了设定时间，说明错过了，立即补执行
    if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
      return runCoupleSpaceOncePerDay(lastKey, callback);
    }
  } catch(e) { console.error('checkAndRunMissed error:', e); }
  return Promise.resolve(false);
}

// ========== AI 自主决定模式 - 事件驱动触发 ==========
// 通过聊天消息或后台活动触发，而非固定定时
// source: 'chat' = 聊天消息后触发, 'background' = 后台活动触发
function triggerCoupleSpaceAiDecide(charId, source) {
  const spaces = getCoupleSpaces();
  if (!spaces.find(s => s.charId === charId)) return;

  const featureConfigs = [
    { settingsKey: 'coupleDiarySettings_', lastKey: 'coupleDiaryAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoDiaryWrite },
    { settingsKey: 'coupleAlbumSettings_', lastKey: 'coupleAlbumAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoAlbumPost },
    { settingsKey: 'coupleChecklistSettings_', lastKey: 'coupleChecklistAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoChecklistRecommend },
    { settingsKey: 'coupleMessageSettings_', lastKey: 'coupleMessageAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoMessagePost },
    { settingsKey: 'coupleMoodSettings_', lastKey: 'coupleMoodAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoMoodPost },
    { settingsKey: 'coupleTimelineSettings_', lastKey: 'coupleTimelineAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoTimelinePost },
    { settingsKey: 'coupleLetterSettings_', lastKey: 'coupleLetterAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoLetterPost },
    { settingsKey: 'coupleGardenSettings_', lastKey: 'coupleGardenAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoGardenWater },
    { settingsKey: 'coupleLocSettings_', lastKey: 'coupleLocAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoLocationPost },
    { settingsKey: 'coupleFinanceSettings_', lastKey: 'coupleFinanceAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoFinancePost },
  ];

  const todayStr = getCoupleSpaceLocalDateKey();

  featureConfigs.forEach(cfg => {
    try {
      const settings = JSON.parse(localStorage.getItem(cfg.settingsKey + charId) || '{}');
      if (!settings.aiDecide) return;

      // 今天已经执行过随机触发就跳过（与定时触发Key隔离）
      const randomLastKey = cfg.lastKey + 'random_' + charId;
      const lastDate = localStorage.getItem(randomLastKey);
      if (lastDate === todayStr) return;

      // 根据来源取对应概率（默认聊天15%，后台5%）
      const prob = source === 'chat'
        ? (settings[cfg.chatProb] ?? 15) / 100
        : (settings[cfg.bgProb] ?? 5) / 100;

      if (Math.random() < prob) {
        console.log(`[情侣空间] 🎲 随机模式：AI决定触发 ${cfg.settingsKey} (${source}, 概率${(prob*100).toFixed(0)}%)`);
        runCoupleSpaceOncePerDay(randomLastKey, () => cfg.trigger(charId));
      }
    } catch(e) { console.error('aiDecide trigger error:', e); }
  });

  // 睡眠单独处理（有sleep/wake两个phase）
  try {
    const sleepSettings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + charId) || '{}');
    if (sleepSettings.aiDecide) {
      const prob = source === 'chat'
        ? (sleepSettings.aiDecideChatProb ?? 15) / 100
        : (sleepSettings.aiDecideBgProb ?? 5) / 100;

      ['sleep', 'wake'].forEach(phase => {
        const lastKey = 'coupleSleepAuto_' + phase + '_random_' + charId;
        const lastDate = localStorage.getItem(lastKey);
        if (lastDate === todayStr) return;
        if (Math.random() < prob) {
          console.log(`[情侣空间] 🎲 随机模式：AI决定触发 sleep-${phase} (${source})`);
          runCoupleSpaceOncePerDay(lastKey, () => triggerAutoSleepPost(charId, phase));
        }
      });
    }
  } catch(e) {}
}

function getCoupleSpaces() {
  try { return JSON.parse(localStorage.getItem(COUPLE_SPACE_STORAGE_KEY)) || []; }
  catch(e) { return []; }
}
function saveCoupleSpaces(spaces) {
  localStorage.setItem(COUPLE_SPACE_STORAGE_KEY, JSON.stringify(spaces));
}
function getLastCoupleSpace() {
  const last = localStorage.getItem('coupleSpaceLastId');
  const spaces = getCoupleSpaces();
  if (last && spaces.find(s => s.charId === last)) return last;
  return spaces.length > 0 ? spaces[0].charId : null;
}

function openCoupleSpace() {
  const lastId = getLastCoupleSpace();
  if (lastId) {
    enterCoupleSpace(lastId);
  } else {
    showCoupleSpaceSelect('invite');
  }
}

function showCoupleSpaceSelect(mode) {
  const container = document.getElementById('couple-space-select-content');
  container.innerHTML = '';
  const spaces = getCoupleSpaces();
  const characters = Object.values(state.chats).filter(c => !c.isGroup);

  if (mode === 'list') {
    // 已有空间列表
    if (spaces.length > 0) {
      spaces.forEach(sp => {
        const chat = state.chats[sp.charId];
        if (!chat) return;
        const item = document.createElement('div');
        item.className = 'character-select-item';
        item.innerHTML = `
          <img src="${chat.settings.aiAvatar || defaultAvatar}" class="avatar">
          <span class="name">${chat.name}</span>
          <div style="margin-left:auto; display:flex; align-items:center; gap:10px;">
            <span style="font-size:12px;color:#999;">已绑定</span>
            <button style="font-size:12px;padding:2px 8px;border-radius:4px;background:#ff4d4f;color:white;border:none;cursor:pointer;" onclick="event.stopPropagation(); unbindCoupleSpace('${sp.charId}');">解除</button>
          </div>`;
        item.addEventListener('click', () => enterCoupleSpace(sp.charId));
        container.appendChild(item);
      });
    }
    const repairBtn = document.createElement('div');
    repairBtn.className = 'character-select-item garden-repair-entry';
    repairBtn.innerHTML = '<span class="name" style="color:inherit;">检查历史浇水奖励</span><span class="garden-repair-entry-count" hidden></span>';
    repairBtn.addEventListener('click', () => openCoupleSpaceGardenRepairPreview());
    container.appendChild(repairBtn);
    countCoupleSpaceGardenRepairCandidates().then(count => {
      if (!repairBtn.isConnected || count <= 0) return;
      const badge = repairBtn.querySelector('.garden-repair-entry-count');
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    }).catch(error => console.error('[情侣树] 统计历史奖励修复项失败:', error));
    // 新建入口
    const addBtn = document.createElement('div');
    addBtn.className = 'character-select-item';
    addBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);';
    addBtn.innerHTML = `<span style="font-size:22px;margin-right:8px;">+</span><span class="name" style="color:inherit;">开启新空间</span>`;
    addBtn.addEventListener('click', () => showCoupleSpaceSelect('invite'));
    container.appendChild(addBtn);
  } else {
    // 邀请模式 - 选择角色
    const bound = new Set(spaces.map(s => s.charId));
    const available = characters.filter(c => !bound.has(c.id));
    if (available.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:50px 0;">没有可邀请的角色了~</p>';
      if (spaces.length > 0) {
        const backBtn = document.createElement('div');
        backBtn.className = 'character-select-item';
        backBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);margin-top:10px;';
        backBtn.innerHTML = '<span class="name" style="color:inherit;">返回空间列表</span>';
        backBtn.addEventListener('click', () => showCoupleSpaceSelect('list'));
        container.appendChild(backBtn);
      }
      return;
    }
    // 提示文字已移除，直接展示角色列表

    available.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.innerHTML = `
        <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
        <span class="name">${char.name}</span>`;
      item.addEventListener('click', () => inviteToCoupleSpace(char));
      container.appendChild(item);
    });

    if (spaces.length > 0) {
      const backBtn = document.createElement('div');
      backBtn.className = 'character-select-item';
      backBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);margin-top:10px;';
      backBtn.innerHTML = '<span class="name" style="color:inherit;">返回空间列表</span>';
      backBtn.addEventListener('click', () => showCoupleSpaceSelect('list'));
      container.appendChild(backBtn);
    }
  }
  showScreen('couple-space-select-screen');
}

function inviteToCoupleSpace(char) {
  // 不再直接创建空间，而是发送邀请卡片到聊天中
  const chat = state.chats[char.id];
  if (!chat) return;

  const myNickname = chat.settings.myNickname || '我';

  const inviteMsg = {
    role: 'user',
    type: 'couple_invite',
    status: 'pending',
    senderName: myNickname,
    receiverName: chat.name,
    timestamp: Date.now()
  };
  chat.history.push(inviteMsg);
  db.chats.put(chat);

  // 关闭选择界面，跳转到聊天界面
  state.activeChatId = char.id;
  showScreen('chat-interface-screen');
  renderChatInterface(char.id);
  renderChatList();
}

// 当角色接受邀请后，真正创建情侣空间
function confirmCoupleSpace(charId) {
  const spaces = getCoupleSpaces();
  if (spaces.find(s => s.charId === charId)) return; // 已存在
  const chat = state.chats[charId];
  spaces.push({
    charId: charId,
    charName: chat ? chat.name : '',
    createdAt: Date.now()
  });
  saveCoupleSpaces(spaces);
  setupAllCoupleSpaceAutoTimers();
}

function setupAllCoupleSpaceAutoTimers() {
  [
    'setupCoupleSpaceDiaryAutoTimer', 'setupCoupleSpaceAlbumAutoTimer',
    'setupCoupleSpaceChecklistAutoTimer', 'setupCoupleSpaceMessageAutoTimer',
    'setupCoupleSpaceMoodAutoTimer', 'setupCoupleSpaceTimelineAutoTimer',
    'setupCoupleSpaceLetterAutoTimer', 'setupCoupleSpaceGardenAutoTimer',
    'setupCoupleSpaceLocationAutoTimer', 'setupCoupleSpaceSleepAutoTimer',
    'setupCoupleSpaceFinanceAutoTimer'
  ].forEach(name => {
    if (typeof window[name] === 'function') window[name]();
  });
}

async function unbindCoupleSpace(charId) {
  if (!confirm('确定要解除与该角色的情侣空间绑定吗？解除后可以重新绑定。')) {
    return;
  }

  const clearData = confirm('是否同时清除与该角色的所有情侣空间数据（日记、相册、纪念日等）？\n注意：清除后无法恢复！如果不清除，重新绑定后数据将恢复。');
  if (clearData) {
    const keysToRemove = [
      'coupleDiaries_' + charId, 'coupleDiarySettings_' + charId, 'coupleDiaryAutoLast_' + charId,
      'coupleAlbum_' + charId, 'coupleAlbumSettings_' + charId, 'coupleAlbumAutoLast_' + charId,
      'coupleAnniv_' + charId, 'coupleAnnivSettings_' + charId,
      'coupleChecklist_' + charId, 'coupleChecklistSettings_' + charId, 'coupleChecklistAutoLast_' + charId,
      'coupleMessages_' + charId, 'coupleMessageSettings_' + charId, 'coupleMessageAutoLast_' + charId,
      'coupleMoods_' + charId, 'coupleMoodSettings_' + charId, 'coupleMoodAutoLast_' + charId,
      'coupleTimeline_' + charId, 'coupleTimelineSettings_' + charId, 'coupleTimelineAutoLast_' + charId,
      'coupleLetters_' + charId, 'coupleLetterSettings_' + charId, 'coupleLetterAutoLast_' + charId,
      'coupleGarden_' + charId, 'coupleGardenSettings_' + charId, 'coupleGardenAutoLast_' + charId,
      'coupleLocations_' + charId, 'coupleLocSettings_' + charId, 'coupleLocAutoLast_' + charId,
      'coupleSleep_' + charId, 'coupleSleepSettings_' + charId, 'coupleSleepAuto_sleep_' + charId, 'coupleSleepAuto_wake_' + charId,
      'coupleFinance_' + charId, 'coupleFinanceSettings_' + charId, 'coupleFinanceAutoLast_' + charId, 'coupleCustomFinCats_' + charId
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    const relatedKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('couple') && (key.endsWith(charId) || key.endsWith(charId + '_status'))) {
        relatedKeys.push(key);
      }
    }
    relatedKeys.forEach(key => localStorage.removeItem(key));
    try {
      const ledger = JSON.parse(localStorage.getItem('coupleGardenRewardLedger') || '{}');
      Object.keys(ledger).forEach(transactionId => {
        if (ledger[transactionId] && ledger[transactionId].charId === charId) delete ledger[transactionId];
      });
      localStorage.setItem('coupleGardenRewardLedger', JSON.stringify(ledger));
    } catch(e) {}
  }
  
  const spaces = getCoupleSpaces();
  const newSpaces = spaces.filter(s => s.charId !== charId);
  saveCoupleSpaces(newSpaces);
  
  if (localStorage.getItem('coupleSpaceLastId') === charId) {
    localStorage.removeItem('coupleSpaceLastId');
  }
  
  // 检查是否开启了基本感知
  const chat = state.chats[charId];
  if (chat && chat.settings.enableCoupleSpacePrompt) {
    const myNickname = chat.settings.myNickname || '我';
    const charName = chat.name || '';
    const unbindMsg = {
      role: 'system',
      type: 'system_notification',
      content: `[系统提示："${myNickname}"刚刚解除了与"${charName}"的情侣空间绑定。]`,
      isHidden: true,
      timestamp: Date.now()
    };
    chat.history.push(unbindMsg);
    if (typeof db !== 'undefined' && db.chats) {
      await db.chats.put(chat);
    }
  }
  
  showCoupleSpaceSelect('list');
}

function enterCoupleSpace(charId) {
  localStorage.setItem('coupleSpaceLastId', charId);
  const chat = state.chats[charId];
  const charName = chat ? chat.name : '';
  const charAvatar = chat ? (chat.settings.aiAvatar || defaultAvatar) : '';
  const userNickname = chat ? (chat.settings.myNickname || '我') : '我';
  const userAvatar = chat ? (chat.settings.myAvatar || state.qzoneSettings.avatar || defaultAvatar) : defaultAvatar;
  const previousIframe = document.getElementById('couple-space-iframe');
  const iframe = previousIframe.cloneNode(false);
  previousIframe.replaceWith(iframe);
  iframe.src = COUPLE_SPACE_IFRAME_PATH;
  iframe.onload = function() {
    const spaces = getCoupleSpaces();
    const space = spaces.find(s => s.charId === charId);
    
    const syncData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        syncData[key] = localStorage.getItem(key);
      }
    }

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceInit',
      charId: charId,
      charName: charName,
      charAvatar: charAvatar,
      userName: userNickname,
      userAvatar: userAvatar,
      createdAt: space ? space.createdAt : Date.now(),
      syncData: syncData
    }, '*');
  };
  showScreen('couple-space-screen');
}

function closeCoupleSpace() {
  showScreen('home-screen');
  document.getElementById('couple-space-iframe').src = '';
}

window.addEventListener('message', function(e) {
  const coupleIframe = document.getElementById('couple-space-iframe');
  const isCoupleFrame = coupleIframe && e.source === coupleIframe.contentWindow;
  const isCoupleMessage = e.data === 'closeCoupleSpace' || e.data === 'coupleSpaceSwitchPartner' ||
    (e.data && typeof e.data.type === 'string' && e.data.type.startsWith('coupleSpace'));
  if (isCoupleMessage && !isCoupleFrame) return;
  if (e.data === 'closeCoupleSpace') closeCoupleSpace();
  if (e.data === 'coupleSpaceSwitchPartner') showCoupleSpaceSelect('list');

  // --- Storage Sync ---
  if (e.data && e.data.type === 'coupleSpaceSyncStorageSet') {
    try { localStorage.setItem(e.data.key, e.data.value); } catch(err) {}
  }
  if (e.data && e.data.type === 'coupleSpaceSyncStorageRemove') {
    try { localStorage.removeItem(e.data.key); } catch(err) {}
  }

  // --- Diary AI requests ---
  if (e.data && e.data.type === 'coupleSpaceDiaryAiRequest') {
    handleCoupleSpaceDiaryAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiaryCommentRequest') {
    handleCoupleSpaceDiaryCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiarySettingsChanged') {
    handleCoupleSpaceDiarySettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiarySummaryRequest') {
    handleCoupleSpaceDiarySummaryRequest(e.data);
  }

  // --- Album requests ---
  if (e.data && e.data.type === 'coupleSpaceAlbumAiRequest') {
    handleCoupleSpaceAlbumAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAlbumSettingsChanged') {
    handleCoupleSpaceAlbumSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAlbumRecognize') {
    handleCoupleSpaceAlbumRecognize(e.data);
  }

  // --- Album comment requests ---
  if (e.data && e.data.type === 'coupleSpaceAlbumCommentRequest') {
    handleCoupleSpaceAlbumCommentRequest(e.data);
  }

  // --- Anniversary requests ---
  if (e.data && e.data.type === 'coupleSpaceAnnivHeartRequest') {
    handleCoupleSpaceAnnivHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivChanged') {
    handleCoupleSpaceAnnivChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivCreateRequest') {
    handleCoupleSpaceAnnivCreateRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivSettingsChanged') {
    handleCoupleSpaceAnnivSettingsChanged(e.data);
  }

  // --- Screenshot requests ---
  if (e.data && e.data.type === 'coupleSpaceScreenshotRequest') {
    handleCoupleSpaceScreenshotRequest(e.data);
  }

  // --- Checklist requests ---
  if (e.data && e.data.type === 'coupleSpaceChecklistAiRequest') {
    handleCoupleSpaceChecklistAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistCommentRequest') {
    handleCoupleSpaceChecklistCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistSettingsChanged') {
    handleCoupleSpaceChecklistSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistHeartRequest') {
    handleCoupleSpaceChecklistHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistChanged') {
    handleCoupleSpaceChecklistChanged(e.data);
  }

  // --- Message Board requests ---
  if (e.data && e.data.type === 'coupleSpaceMessageAiRequest') {
    handleCoupleSpaceMessageAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageReplyRequest') {
    handleCoupleSpaceMessageReplyRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageHeartRequest') {
    handleCoupleSpaceMessageHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageSettingsChanged') {
    handleCoupleSpaceMessageSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageChanged') {
    handleCoupleSpaceMessageChanged(e.data);
  }

  // --- Mood requests ---
  if (e.data && e.data.type === 'coupleSpaceMoodAiRequest') {
    handleCoupleSpaceMoodAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodCommentRequest') {
    handleCoupleSpaceMoodCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodHeartRequest') {
    handleCoupleSpaceMoodHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodSettingsChanged') {
    handleCoupleSpaceMoodSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodChanged') {
    handleCoupleSpaceMoodChanged(e.data);
  }

  // --- Letter requests ---
  if (e.data && e.data.type === 'coupleSpaceLetterAiRequest') {
    handleCoupleSpaceLetterAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterReplyRequest') {
    handleCoupleSpaceLetterReplyRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterCommentRequest') {
    handleCoupleSpaceLetterCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterHeartRequest') {
    handleCoupleSpaceLetterHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterSettingsChanged') {
    handleCoupleSpaceLetterSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterChanged') {
    handleCoupleSpaceLetterChanged(e.data);
  }

  // --- Timeline requests ---
  if (e.data && e.data.type === 'coupleSpaceTimelineAiRequest') {
    handleCoupleSpaceTimelineAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineCommentRequest') {
    handleCoupleSpaceTimelineCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineHeartRequest') {
    handleCoupleSpaceTimelineHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineSettingsChanged') {
    handleCoupleSpaceTimelineSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineChanged') {
    handleCoupleSpaceTimelineChanged(e.data);
  }

  // --- Garden (Tree) requests ---
  if (e.data && e.data.type === 'coupleSpaceGardenAiRequest') {
    handleCoupleSpaceGardenAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenCommentRequest') {
    handleCoupleSpaceGardenCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenHeartRequest') {
    handleCoupleSpaceGardenHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenSettingsChanged') {
    handleCoupleSpaceGardenSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenChanged') {
    handleCoupleSpaceGardenChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenWaterReward') {
    handleCoupleSpaceGardenWaterReward(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenRepairPreviewRequest') {
    openCoupleSpaceGardenRepairPreview();
  }

  // --- Location requests ---
  if (e.data && e.data.type === 'coupleSpaceLocationAiRequest') {
    handleCoupleSpaceLocationAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationCommentRequest') {
    handleCoupleSpaceLocationCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationHeartRequest') {
    handleCoupleSpaceLocationHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationSettingsChanged') {
    handleCoupleSpaceLocationSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationChanged') {
    handleCoupleSpaceLocationChanged(e.data);
  }

  // --- Sleep requests ---
  if (e.data && e.data.type === 'coupleSpaceSleepAiRequest') {
    handleCoupleSpaceSleepAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepCommentRequest') {
    handleCoupleSpaceSleepCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepHeartRequest') {
    handleCoupleSpaceSleepHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepSettingsChanged') {
    handleCoupleSpaceSleepSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepChanged') {
    handleCoupleSpaceSleepChanged(e.data);
  }

  // --- Finance requests ---
  if (e.data && e.data.type === 'coupleSpaceFinanceAiRequest') {
    handleCoupleSpaceFinanceAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceCommentRequest') {
    handleCoupleSpaceFinanceCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceHeartRequest') {
    handleCoupleSpaceFinanceHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceSettingsChanged') {
    handleCoupleSpaceFinanceSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceChanged') {
    handleCoupleSpaceFinanceChanged(e.data);
  }
});

