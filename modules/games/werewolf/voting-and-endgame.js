  async function startVotingPhase() {
    addGameLog('发言结束，现在开始投票。');
    renderWerewolfScreen();


    werewolfGameState.votes = {};

    let aiVotes = null;
    werewolfGameState.lastFailedAction = 'getVotes';
    try {

      aiVotes = await getAiVotes();
      if (aiVotes) {
        aiVotes.forEach(vote => {
          const voter = werewolfGameState.players.find(p => p.name === vote.voter_name);
          const target = werewolfGameState.players.find(p => p.name === vote.vote_for_name);
          if (voter && voter.isAlive && target) {
            werewolfGameState.votes[voter.name] = target.name;
          }
        });
      }
      werewolfGameState.lastFailedAction = null;
    } catch (error) {
      console.error("AI投票决策API失败:", error);

      await showCustomAlert("操作失败", `AI角色无法完成投票，游戏暂停。请点击右上角的"重试"按钮继续。\n错误: ${error.message}`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }



    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');
    if (myPlayer && myPlayer.isAlive) {
      addGameLog('请你投票。');
      renderWerewolfScreen();
      const userVoteTargetId = await openSelectionModal('vote');
      const targetPlayer = werewolfGameState.players.find(p => p.id === userVoteTargetId);
      if (targetPlayer) {

        werewolfGameState.votes[myPlayer.name] = targetPlayer.name;
      }
    }


    handleVotingResults();
  }


  async function getAiVotes() {
    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return null;

    const aliveAiPlayers = werewolfGameState.players.filter(p => p.isAlive && p.id !== 'user');
    const potentialTargets = werewolfGameState.players.filter(p => p.isAlive).map(p => p.name);

    let systemPrompt = buildWerewolfPrompt();
    systemPrompt += `
# 【【【最终投票指令 (最高优先级)】】】
现在是投票环节。请你扮演【每一个存活的AI角色】，根据以上所有信息（特别是刚刚的讨论环节），为他们各自决定要投票放逐哪一位玩家。
- **投票依据**: 你的投票【必须】基于逻辑分析和你的身份。狼人可能会投给好人，好人需要找出狼人。
- **格式铁律**: 你的回复【必须且只能】是一个JSON数组，格式如下：
\`\`\`json
[
  {"voter_name": "角色A的名字", "vote_for_name": "角色A投票的玩家名字"},
  {"voter_name": "角色B的名字", "vote_for_name": "角色B投票的玩家名字"}
]
\`\`\`
- **可投票的玩家列表**: ${potentialTargets.join(', ')}

现在，请为所有存活的AI角色生成他们的投票决定。`;

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请所有AI角色开始投票。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.8,
          })
        });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();


      const startIndex = cleanedJsonString.indexOf('[');
      const endIndex = cleanedJsonString.lastIndexOf(']');


      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("AI返回的投票结果中未找到有效的JSON数组结构 (`[...]`)。");
      }



      const jsonArrayString = cleanedJsonString.substring(startIndex, endIndex + 1);


      try {

        const matches = jsonArrayString.match(/(\[[\s\S]*?\])/g);
        if (matches && matches.length > 0) {
          return JSON.parse(matches[matches.length - 1]);
        }
        return JSON.parse(jsonArrayString);
      } catch (e) {

        throw new Error(`解析AI返回的投票JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


    } catch (error) {
      console.error("获取AI投票失败:", error);
      throw new Error(`获取AI投票决策失败: ${error.message}`);
    }
  }


  function handleVotingResults() {
    const voteCounts = {};
    const voteDetails = {};


    for (const voterName in werewolfGameState.votes) {
      const targetName = werewolfGameState.votes[voterName];

      voteCounts[targetName] = (voteCounts[targetName] || 0) + 1;

      if (!voteDetails[targetName]) {
        voteDetails[targetName] = [];
      }
      voteDetails[targetName].push(voterName);
    }

    let maxVotes = 0;
    let mostVotedPlayers = [];


    for (const playerName in voteCounts) {
      const count = voteCounts[playerName];
      if (count > maxVotes) {
        maxVotes = count;
        mostVotedPlayers = [playerName];
      } else if (count === maxVotes) {
        mostVotedPlayers.push(playerName);
      }
    }


    addGameLog('投票结果：');
    for (const playerName in voteDetails) {
      addGameLog(`${playerName} (${voteDetails[playerName].length}票): ${voteDetails[playerName].join('、 ')}`);
    }


    if (mostVotedPlayers.length === 1 && maxVotes > 0) {
      const playerToEliminate = werewolfGameState.players.find(p => p.name === mostVotedPlayers[0]);
      if (playerToEliminate) {
        playerToEliminate.isAlive = false;
        addGameLog(`${playerToEliminate.name} 被投票放逐。`);


        if (playerToEliminate.role === '猎人') {

        }
      }
    } else {
      addGameLog('平票或无人投票，此轮无人出局。');
    }

    renderWerewolfScreen();

    if (checkGameOver()) return;


    werewolfGameState.currentDay++;
    executeNightPhase();
  }


  async function getAiWolfKillTarget() {
    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return null;

    const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
    const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');

    const systemPrompt = `
# 你的任务
你现在是狼人团队的指挥官。你的任务是分析当前局势，并为狼人团队选择一个最佳的刀人目标。
# 核心规则
1.  **目标**: 优先刀掉预言家、女巫等神职人员。如果没有明确的神职信息，可以根据发言来判断谁的逻辑清晰、威胁最大。
2.  **格式铁律**: 你的回复【必须且只能】是一个JSON对象，格式如下:
    \`{"target_name": "你决定要刀的玩家名字"}\`

# 游戏状态
- **你的狼队友是**: ${wolves.map(w => w.name).join('、 ')}
- **可以刀的玩家列表**: ${potentialTargets.map(p => p.name).join('、 ')}
- **讨论摘要**: 
${werewolfGameState.discussionLog.map(d => `${d.speaker}: ${d.content}`).join('\n')}

现在，请做出你的决定。`;

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请选择今晚的目标。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.8,
          })
        });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const jsonMatch = aiResponseContent.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error("AI返回的刀人目标格式不正确。");
      const decision = JSON.parse(jsonMatch[0]);

      const targetPlayer = werewolfGameState.players.find(p => p.name === decision.target_name);
      return targetPlayer ? targetPlayer.id : null;

    } catch (error) {
      console.error("获取AI狼人目标失败:", error);

      return potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
    }
  }


  function openWitchActionModal(killedPlayer, witchPlayer) {
    return new Promise(resolve => {
      const modal = document.getElementById('werewolf-witch-modal');
      const listEl = document.getElementById('werewolf-witch-selection-list');
      const titleEl = document.getElementById('witch-modal-title');


      const poisonBtn = document.getElementById('confirm-witch-poison-btn');
      const doNothingBtn = document.getElementById('witch-do-nothing-btn');
      listEl.innerHTML = '';


      const newPoisonBtn = poisonBtn.cloneNode(true);
      poisonBtn.parentNode.replaceChild(newPoisonBtn, poisonBtn);
      const newDoNothingBtn = doNothingBtn.cloneNode(true);
      doNothingBtn.parentNode.replaceChild(newDoNothingBtn, doNothingBtn);


      newPoisonBtn.style.display = 'block';
      newPoisonBtn.disabled = true;

      let action = {
        save: false,
        poison: null
      };
      let selectedPoisonTarget = null;


      if (killedPlayer && !witchPlayer.antidoteUsed) {
        titleEl.textContent = `昨晚 ${killedPlayer.name} 被刀了`;
        const saveBtn = document.createElement('button');
        saveBtn.className = 'form-button';
        saveBtn.textContent = '使用解药救TA';
        saveBtn.style.margin = '20px';
        saveBtn.onclick = () => {
          action.save = true;
          modal.classList.remove('visible');
          resolve(action);
        };
        listEl.appendChild(saveBtn);
      } else if (killedPlayer) {
        titleEl.textContent = `昨晚 ${killedPlayer.name} 被刀了 (你没有解药了)`;
      } else {
        titleEl.textContent = '昨晚是平安夜';
      }


      if (!witchPlayer.poisonUsed) {
        const poisonTitle = document.createElement('p');
        poisonTitle.textContent = '是否要使用毒药？';
        poisonTitle.style.textAlign = 'center';
        poisonTitle.style.marginTop = '20px';
        listEl.appendChild(poisonTitle);

        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== killedPlayer?.id);
        potentialTargets.forEach(p => {
          const item = document.createElement('div');
          item.className = 'werewolf-selection-item';
          item.dataset.id = p.id;
          item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
          item.onclick = () => {
            listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedPoisonTarget = p.id;


            newPoisonBtn.disabled = false;
          };
          listEl.appendChild(item);
        });
      }


      newPoisonBtn.onclick = () => {
        if (selectedPoisonTarget) {
          action.poison = selectedPoisonTarget;
          modal.classList.remove('visible');
          resolve(action);
        }
      };

      newDoNothingBtn.onclick = () => {
        modal.classList.remove('visible');
        resolve(action);
      };

      modal.classList.add('visible');
    });
  }




  async function handleWerewolfRetry() {
    const actionToRetry = werewolfGameState.lastFailedAction;
    if (!actionToRetry) return;

    document.getElementById('werewolf-retry-btn').style.display = 'none';
    await showCustomAlert("请稍候...", `正在重试"${actionToRetry}"操作...`);

    switch (actionToRetry) {
      case 'wolfKill':

        await executeNightPhase();
        break;
      case 'startDiscussion':

        await startDiscussionPhase();
        break;
      case 'getVotes':

        await startVotingPhase();
        break;

    }
  }





  function checkGameOver() {
    const alivePlayers = werewolfGameState.players.filter(p => p.isAlive);
    const aliveWolves = alivePlayers.filter(p => p.role === '狼人');
    const aliveGods = alivePlayers.filter(p => ['预言家', '女巫', '猎人', '守卫'].includes(p.role));
    const aliveVillagers = alivePlayers.filter(p => p.role === '平民');

    let winner = null;


    if (aliveWolves.length === 0) {
      winner = '好人';
    } else if (aliveWolves.length >= (aliveGods.length + aliveVillagers.length)) {
      winner = '狼人';
    } else if (werewolfGameState.gameMode === '12p') {

      if (aliveGods.length === 0 || aliveVillagers.length === 0) {
        winner = '狼人';
      }
    } else {

      if (aliveGods.length === 0 && aliveVillagers.length === 0) {
        winner = '狼人';
      }
    }


    if (winner) {

      endGame(winner);
      return true;
    }


    return false;
  }

  // ========== 从 script.js 迁移：handleSpectatorReroll ==========
  async function handleSpectatorReroll() {
    const chat = state.chats[state.activeChatId];
    if (!chat || !lastResponseTimestamps || lastResponseTimestamps.length === 0) {
      alert("没有可供重新生成的AI响应。");
      return;
    }

    chat.history = chat.history.filter(msg => !lastResponseTimestamps.includes(msg.timestamp));

    await db.chats.put(chat);
    await renderChatInterface(state.activeChatId);

    triggerSpectatorGroupAiAction();
  }

  // ========== 全局暴露 ==========
  window.werewolfGameState = werewolfGameState;
  window.openWerewolfLobby = openWerewolfLobby;
  window.initializeWerewolfGame = initializeWerewolfGame;
  window.handleWerewolfRetry = handleWerewolfRetry;
  window.handleManualWerewolfSummary = handleManualWerewolfSummary;
  window.executeNightPhase = executeNightPhase;
  window.handleSpectatorReroll = handleSpectatorReroll;
