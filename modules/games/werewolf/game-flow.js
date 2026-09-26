// ========================================
// 狼人杀功能模块
// 来源: script.js 第 50503 ~ 52375 行
// 包含: openWerewolfLobby, initializeWerewolfGame, renderWerewolfScreen, showMyRole,
//       executeNightPhase, executeDayPhase, startDiscussionPhase, buildWerewolfPrompt,
//       createWerewolfGameSummary, injectSummaryIntoMemories, handleManualWerewolfSummary,
//       endGame, addGameLog, addDialogueLog, openSelectionModal, openWolfKillModal,
//       handleUserWerewolfSpeech, handleAiContinueDiscussion, handleWerewolfWaitReply,
//       startVotingPhase, getAiVotes, handleVotingResults, getAiWolfKillTarget,
//       openWitchActionModal, handleWerewolfRetry, checkGameOver
// ========================================

  // 狼人杀游戏状态（从 script.js 补充）
  let werewolfGameState = {
    isActive: false,
    gameMode: null,
    chatId: null,
    players: [],
    currentDay: 1,
    currentPhase: 'setup',
    nightActions: {},
    gameLog: [],
    discussionLog: [],
    voteResults: {},
    electionInfo: {
      candidates: [],
      votes: {}
    },
    sheriffId: null,
    lastFailedAction: null,
  };

  async function openWerewolfLobby(mode) {
    const modal = document.getElementById('werewolf-lobby-modal');
    const listEl = document.getElementById('werewolf-player-selection-list');
    listEl.innerHTML = '';

    let potentialPlayers = [];

    if (mode === 'global') {
      const characters = Object.values(state.chats).filter(c => !c.isGroup);
      const npcs = await db.npcs.toArray();
      potentialPlayers = [

        {
          id: 'user',
          name: state.qzoneSettings.nickname || '我',
          originalName: state.qzoneSettings.nickname || '我',
          avatar: state.qzoneSettings.avatar,
          type: 'user'
        },

        ...characters.map(c => ({
          id: c.id,
          name: c.name,
          originalName: c.originalName,
          avatar: c.settings.aiAvatar,
          type: 'character'
        })),

        ...npcs.map(n => ({
          id: `npc_${n.id}`,
          name: n.name,
          originalName: n.name,
          avatar: n.avatar,
          type: 'npc'
        }))
      ];
      werewolfGameState.chatId = null;
    } else {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.isGroup) return;

      potentialPlayers = [

        {
          id: 'user',
          name: chat.settings.myNickname || '我',
          originalName: state.qzoneSettings.nickname || '我',
          avatar: chat.settings.myAvatar,
          type: 'user'
        },

        ...chat.members.map(m => {
          const char = state.chats[m.id];
          const memberAvatar = m.avatar || (char ? char.settings.aiAvatar : defaultGroupMemberAvatar);
          return {
            id: m.id,
            name: m.groupNickname,
            originalName: m.originalName,
            avatar: memberAvatar,
            type: m.isNpc ? 'npc' : 'character'
          };
        })
      ];
      werewolfGameState.chatId = state.activeChatId;
    }

    potentialPlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.innerHTML = `
            <input type="checkbox" class="werewolf-player-checkbox" data-player-json='${JSON.stringify(player)}' ${player.type === 'user' ? 'checked disabled' : 'checked'}>
            <img src="${player.avatar}" class="avatar">
            <span class="name">${player.name}</span>
        `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }


  async function initializeWerewolfGame() {
    const selectedCheckboxes = document.querySelectorAll('.werewolf-player-checkbox:checked');
    const playerCount = selectedCheckboxes.length;

    let roles = [];
    if (playerCount === 6) {
      werewolfGameState.gameMode = '6p';
      roles = ['狼人', '狼人', '平民', '平民', '预言家', '猎人'];
    } else if (playerCount === 9) {
      werewolfGameState.gameMode = '9p';
      roles = ['狼人', '狼人', '狼人', '平民', '平民', '平民', '预言家', '女巫', '猎人'];
    } else if (playerCount === 12) {
      werewolfGameState.gameMode = '12p';
      roles = ['狼人', '狼人', '狼人', '狼人', '平民', '平民', '平民', '平民', '预言家', '女巫', '猎人', '守卫'];
    } else {
      alert(`当前人数 ${playerCount} 不支持。请选择6、9或12人。`);
      return;
    }

    document.getElementById('werewolf-lobby-modal').classList.remove('visible');
    await showCustomAlert('正在发牌...', '游戏即将开始，正在为各位玩家分配身份...');

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const selectedPlayers = Array.from(selectedCheckboxes).map(cb => JSON.parse(cb.dataset.playerJson));
    werewolfGameState.players = [];

    for (let i = 0; i < selectedPlayers.length; i++) {
      const playerInfo = selectedPlayers[i];
      const role = roles[i];

      let character_persona = "一个普通玩家";
      if (playerInfo.type === 'character') {
        const char = state.chats[playerInfo.id];
        character_persona = char ? char.settings.aiPersona : '未知设定的角色';
      } else if (playerInfo.type === 'npc') {
        const npcs = await db.npcs.toArray();
        const npc = npcs.find(n => `npc_${n.id}` === playerInfo.id);
        character_persona = npc ? npc.persona : '未知设定的NPC';
      } else if (playerInfo.type === 'user') {
        const activeChat = werewolfGameState.chatId ? state.chats[werewolfGameState.chatId] : null;
        character_persona = activeChat ? activeChat.settings.myPersona : '我是谁呀。';
      }

      const playerObject = {
        ...playerInfo,
        role: role,
        isAlive: true,
        character_persona: character_persona
      };


      if (role === '女巫') {
        playerObject.antidoteUsed = false;
        playerObject.poisonUsed = false;
      }
      if (role === '守卫') {
        playerObject.lastGuardedId = null;
      }


      werewolfGameState.players.push(playerObject);
    }

    werewolfGameState.isActive = true;
    werewolfGameState.currentDay = 1;
    werewolfGameState.currentPhase = 'start';
    werewolfGameState.gameLog = [];
    werewolfGameState.discussionLog = [];

    const roleCounts = roles.reduce((acc, role) => {
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const roleSummary = Object.entries(roleCounts).map(([role, count]) => `${role} x${count}`).join('、');
    addGameLog(`游戏配置：${playerCount}人局，身份为 ${roleSummary}。`);

    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    renderWerewolfScreen();
    showScreen('werewolf-game-screen');

    showMyRole(myPlayer.role);
  }



  function renderWerewolfScreen() {
    const gridEl = document.getElementById('werewolf-player-grid');
    gridEl.innerHTML = '';
    const sortedPlayers = [...werewolfGameState.players].sort((a, b) => a.isAlive - b.isAlive);

    sortedPlayers.forEach((p, index) => {
      const playerIndex = werewolfGameState.players.findIndex(player => player.id === p.id) + 1;
      const avatarEl = document.createElement('div');
      avatarEl.className = 'werewolf-player-avatar';
      if (!p.isAlive) avatarEl.classList.add('dead');
      avatarEl.innerHTML = `
            <img src="${p.avatar}">
            <span class="player-name">${playerIndex}. ${p.name}</span>
        `;
      gridEl.appendChild(avatarEl);
    });

    const logEl = document.getElementById('werewolf-log');
    logEl.innerHTML = '';


    for (let day = 1; day <= werewolfGameState.currentDay; day++) {

      const logsThisDay = [
        ...werewolfGameState.gameLog.filter(entry => entry.day === day),
        ...werewolfGameState.discussionLog.filter(entry => entry.day === day)
      ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));


      if (logsThisDay.length > 0) {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'werewolf-log-entry system';
        dayHeader.textContent = `--- 第 ${day} 天 ---`;
        dayHeader.style.cssText = 'font-weight: bold; background: rgba(255, 193, 7, 0.2);';
        logEl.appendChild(dayHeader);


        logsThisDay.forEach(entry => {
          const entryEl = document.createElement('div');
          entryEl.className = `werewolf-log-entry ${entry.type}`;
          if (entry.type === 'dialogue') {
            entryEl.innerHTML = `<span class="speaker">${entry.speaker}:</span> ${entry.content}`;
          } else {
            entryEl.textContent = entry.content;
          }
          logEl.appendChild(entryEl);
        });
      }
    }


    logEl.scrollTop = logEl.scrollHeight;


    const phaseMap = {
      'start': '游戏开始',
      'night': `第${werewolfGameState.currentDay}天 - 夜晚`,
      'day': `第${werewolfGameState.currentDay}天 - 白天`,
      'discussion': `第${werewolfGameState.currentDay}天 - 讨论`,
      'voting': `第${werewolfGameState.currentDay}天 - 投票`,
      'gameover': '游戏结束'
    };
    document.getElementById('werewolf-game-title').textContent = `狼人杀 - ${phaseMap[werewolfGameState.currentPhase] || werewolfGameState.currentPhase}`;
  }



  function showMyRole(role) {
    const roleDescriptions = {
      '狼人': '你的目标是杀死所有好人。每晚可以和同伴一起刀一个玩家。',
      '平民': '你没有任何特殊能力，你的目标是通过投票放逐所有狼人。',
      '预言家': '每晚可以查验一个玩家的身份是好人还是狼人。',
      '猎人': '当你死亡时，你可以选择带走场上任意一名玩家。',
      '女巫': '你有一瓶解药和一瓶毒药，解药可以救活当晚被杀的玩家，毒药可以毒死任意一名玩家。',
      '守卫': '每晚可以守护一名玩家，使其免受狼人袭击。不能连续两晚守护同一个人。'
    };

    document.getElementById('werewolf-role-name').textContent = role;
    document.getElementById('werewolf-role-description').textContent = roleDescriptions[role] || '一个神秘的角色。';
    document.getElementById('werewolf-role-modal').classList.add('visible');
  }


  async function executeNightPhase() {
    werewolfGameState.currentPhase = `第${werewolfGameState.currentDay}天 - 夜晚`;
    werewolfGameState.nightActions = {};
    addGameLog('天黑请闭眼...');
    renderWerewolfScreen();

    document.getElementById('werewolf-action-bar').style.display = 'none';
    document.getElementById('werewolf-retry-btn').style.display = 'none';
    await new Promise(resolve => setTimeout(resolve, 1500));


    const guard = werewolfGameState.players.find(p => p.role === '守卫' && p.isAlive);
    if (guard) {
      addGameLog('守卫请睁眼，请选择要守护的玩家。');
      renderWerewolfScreen();
      let guardedId = null;
      if (guard.id === 'user') {
        guardedId = await openSelectionModal('guard', guard.lastGuardedId);
      } else {
        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== guard.lastGuardedId);
        if (potentialTargets.length > 0) {
          guardedId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
        }
      }
      if (guardedId) {
        werewolfGameState.nightActions.guardedId = guardedId;
        guard.lastGuardedId = guardedId;
      }
      addGameLog('守卫已行动，守卫请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }



    addGameLog('狼人请睁眼，请选择要刀的玩家。');
    renderWerewolfScreen();

    const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
    const userIsWolf = wolves.some(p => p.id === 'user');

    let wolfTargetId = null;


    werewolfGameState.lastFailedAction = 'wolfKill';
    try {
      if (userIsWolf) {
        addGameLog('你是狼人，请选择刀人目标。');
        renderWerewolfScreen();
        wolfTargetId = await openWolfKillModal();
      } else {

        if (werewolfGameState.currentDay === 1) {
          console.log("第一夜，执行本地随机刀人逻辑...");
          const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');
          if (potentialTargets.length > 0) {
            wolfTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
          }
        } else {

          wolfTargetId = await getAiWolfKillTarget();
        }
      }

      werewolfGameState.lastFailedAction = null;
    } catch (error) {
      console.error("狼人行动API失败:", error);
      await showCustomAlert("操作失败", `AI狼人团队无法决定目标，游戏暂停。请点击右上角的"重试"按钮继续。`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }

    werewolfGameState.nightActions.killedId = wolfTargetId;
    addGameLog('狼人已行动，狼人请闭眼。');
    renderWerewolfScreen();
    await new Promise(resolve => setTimeout(resolve, 1500));


    const witch = werewolfGameState.players.find(p => p.role === '女巫' && p.isAlive);
    if (witch) {
      addGameLog('女巫请睁眼。');
      renderWerewolfScreen();
      const killedPlayer = werewolfGameState.players.find(p => p.id === werewolfGameState.nightActions.killedId);


      const isGuarded = werewolfGameState.nightActions.guardedId === werewolfGameState.nightActions.killedId;


      const playerToShowWitch = (isGuarded || !killedPlayer) ? null : killedPlayer;

      if (witch.id === 'user') {
        let userWitchAction = await openWitchActionModal(playerToShowWitch, witch);
        if (userWitchAction.save) {
          werewolfGameState.nightActions.savedId = werewolfGameState.nightActions.killedId;
          witch.antidoteUsed = true;
        }
        if (userWitchAction.poison) {
          werewolfGameState.nightActions.poisonedId = userWitchAction.poison;
          witch.poisonUsed = true;
        }
      } else {

        if (!witch.antidoteUsed && playerToShowWitch) {
          let saveChance = 0;
          if (werewolfGameState.currentDay === 1) {

            saveChance = 0.3;
          } else {

            saveChance = 0.8;
          }

          console.log(`AI女巫决策：今天是第${werewolfGameState.currentDay}天，救人概率为 ${saveChance * 100}%`);

          if (Math.random() < saveChance) {
            console.log("AI女巫决定使用解药！");
            werewolfGameState.nightActions.savedId = werewolfGameState.nightActions.killedId;
            witch.antidoteUsed = true;
          } else {
            console.log("AI女巫决定保留解药。");
          }
        }


        if (!werewolfGameState.nightActions.savedId && !witch.poisonUsed && Math.random() < 0.5) {
          const poisonTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== werewolfGameState.nightActions.killedId);
          if (poisonTargets.length > 0) {
            const target = poisonTargets[Math.floor(Math.random() * poisonTargets.length)];
            werewolfGameState.nightActions.poisonedId = target.id;
            witch.poisonUsed = true;
            console.log(`AI女巫决定使用毒药，目标是: ${target.name}`);
          }
        }

      }
      addGameLog('女巫已行动，女巫请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }


    const prophet = werewolfGameState.players.find(p => p.role === '预言家' && p.isAlive);
    if (prophet) {
      addGameLog('预言家请睁眼，请选择要查验的玩家。');
      renderWerewolfScreen();

      if (prophet.id === 'user') {
        const targetId = await openSelectionModal('prophet');
        const targetPlayer = werewolfGameState.players.find(p => p.id === targetId);
        if (targetPlayer) {
          const isWolf = targetPlayer.role === '狼人';
          await showCustomAlert('查验结果', `你查验的玩家 ${targetPlayer.name} 的身份是：${isWolf ? '狼人' : '好人'}`);
          werewolfGameState.nightActions.prophetCheck = {
            target: targetId,
            result: isWolf ? '狼人' : '好人'
          };
        }
      } else {
        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== prophet.id);
        if (potentialTargets.length > 0) {
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
          werewolfGameState.nightActions.prophetCheck = {
            target: target.id,
            result: target.role === '狼人' ? '狼人' : '好人'
          };
        }
      }
      addGameLog('预言家已行动，预言家请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }


    executeDayPhase();
  }


  async function executeDayPhase() {
    werewolfGameState.currentPhase = `第${werewolfGameState.currentDay}天 - 白天`;
    werewolfGameState.voteResults = {};
    addGameLog('天亮了。');

    const {
      killedId,
      guardedId,
      savedId,
      poisonedId
    } = werewolfGameState.nightActions;
    const deathsThisNight = new Set();


    if (killedId && killedId !== guardedId && killedId !== savedId) {
      deathsThisNight.add(killedId);
    }


    if (poisonedId) {

      deathsThisNight.add(poisonedId);
    }


    if (deathsThisNight.size === 0) {
      addGameLog('昨晚是平安夜。');
    } else {
      for (const deadPlayerId of deathsThisNight) {
        const deadPlayer = werewolfGameState.players.find(p => p.id === deadPlayerId);
        if (deadPlayer && deadPlayer.isAlive) {
          deadPlayer.isAlive = false;
          addGameLog(`昨晚 ${deadPlayer.name} 死亡了。`);


          if (deadPlayer.role === '猎人') {
            addGameLog('猎人死亡，请选择一名玩家带走！');
            renderWerewolfScreen();
            let hunterTargetId = null;
            if (deadPlayer.id === 'user') {
              hunterTargetId = await openSelectionModal('hunter');
            } else {
              const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== deadPlayer.id);
              if (potentialTargets.length > 0) {
                hunterTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
              }
            }
            const targetPlayer = werewolfGameState.players.find(p => p.id === hunterTargetId);
            if (targetPlayer) {
              targetPlayer.isAlive = false;
              addGameLog(`猎人带走了 ${targetPlayer.name}。`);
            }
          }
        }
      }
    }

    renderWerewolfScreen();

    if (checkGameOver()) return;

    await startDiscussionPhase();
  }



  async function startDiscussionPhase() {



    addGameLog('现在开始讨论，请各位玩家依次发言。');
    renderWerewolfScreen();

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成对话。');
      return;
    }

    const systemPrompt = buildWerewolfPrompt();
    werewolfGameState.lastFailedAction = 'startDiscussion';
    try {
      await showCustomAlert("请稍候", "正在等待AI角色们进行激烈的讨论...");

      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请所有AI角色根据你们的身份和人设开始发言。'
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
            temperature: state.globalSettings.apiTemperature || 0.95,
          })
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 错误: ${errorData.error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error(`AI返回的讨论内容格式不正确。原始返回: ${aiResponseContent}`);
      }
      const dialogues = JSON.parse(jsonMatch[0]);

      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }

      werewolfGameState.lastFailedAction = null;

    } catch (error) {
      console.error("狼人杀AI讨论生成失败:", error);
      await showCustomAlert("AI 发言失败", `讨论无法开始，游戏暂停。请点击右上角的"重试"按钮继续。\n错误: ${error.message}`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }

    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');
    const actionBar = document.getElementById('werewolf-action-bar');
    const waitReplyBtn = document.getElementById('werewolf-wait-reply-btn');
    const finishSpeechBtn = document.getElementById('werewolf-finish-speech-btn');
    const userInput = document.getElementById('werewolf-user-input');

    actionBar.style.display = 'flex';

    if (myPlayer && myPlayer.isAlive) {
      waitReplyBtn.textContent = '等待回应';
      finishSpeechBtn.textContent = '结束发言';
      waitReplyBtn.style.display = 'block';
      finishSpeechBtn.style.display = 'block';
      userInput.disabled = false;
      userInput.placeholder = "轮到你发言了...";
      userInput.focus();

      const newWaitBtn = waitReplyBtn.cloneNode(true);
      waitReplyBtn.parentNode.replaceChild(newWaitBtn, waitReplyBtn);
      newWaitBtn.addEventListener('click', handleWerewolfWaitReply);

      const newFinishBtn = finishSpeechBtn.cloneNode(true);
      finishSpeechBtn.parentNode.replaceChild(newFinishBtn, finishSpeechBtn);
      newFinishBtn.addEventListener('click', handleUserWerewolfSpeech);

    } else {
      addGameLog('你已经死亡，无法发言。请等待其他玩家发言结束。');
      renderWerewolfScreen();

      waitReplyBtn.textContent = '继续讨论';
      finishSpeechBtn.textContent = '进入投票';
      waitReplyBtn.style.display = 'block';
      finishSpeechBtn.style.display = 'block';
      userInput.disabled = true;
      userInput.placeholder = "你已死亡，正在围观...";

      const newWaitBtn = waitReplyBtn.cloneNode(true);
      waitReplyBtn.parentNode.replaceChild(newWaitBtn, waitReplyBtn);
      newWaitBtn.addEventListener('click', handleAiContinueDiscussion);

      const newFinishBtn = finishSpeechBtn.cloneNode(true);
      finishSpeechBtn.parentNode.replaceChild(newFinishBtn, finishSpeechBtn);
      newFinishBtn.addEventListener('click', startVotingPhase);
    }
  }



