  function openSelectionModal(type) {
    return new Promise(resolve => {
      const modalId = `werewolf-${type}-modal`;
      const listId = `werewolf-${type}-selection-list`;
      let confirmBtnId = '';
      if (type === 'prophet') confirmBtnId = 'confirm-prophet-check-btn';
      if (type === 'hunter') confirmBtnId = 'confirm-hunter-shot-btn';
      if (type === 'vote') confirmBtnId = 'confirm-vote-btn';

      const modal = document.getElementById(modalId);
      const listEl = document.getElementById(listId);
      const confirmBtn = document.getElementById(confirmBtnId);

      listEl.innerHTML = '';
      let selectedId = null;


      const potentialTargets = werewolfGameState.players.filter(p =>
        p.isAlive && (type === 'hunter' || type === 'vote' || p.id !== 'user')
      );
      potentialTargets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'werewolf-selection-item';
        item.dataset.id = p.id;
        item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
        item.onclick = () => {
          listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedId = p.id;
        };
        listEl.appendChild(item);
      });

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.onclick = () => {
        if (selectedId) {
          modal.classList.remove('visible');
          resolve(selectedId);
        } else {
          alert('请选择一个目标。');
        }
      };

      modal.classList.add('visible');
    });
  }


  function openWolfKillModal() {
    return new Promise(resolve => {
      const modal = document.getElementById('werewolf-kill-modal');
      const listEl = document.getElementById('werewolf-kill-selection-list');
      const confirmBtn = document.getElementById('confirm-wolf-kill-btn');
      const header = modal.querySelector('.modal-header span');

      const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
      const teammates = wolves.filter(w => w.id !== 'user').map(w => w.name).join('、');

      if (teammates) {
        header.innerHTML = `狼人请选择刀人对象<br><small style="font-weight:normal; font-size: 13px;">你的队友是: ${teammates}</small>`;
      } else {
        header.textContent = '狼人请选择刀人对象';
      }

      listEl.innerHTML = '';
      let selectedId = null;

      const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');
      potentialTargets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'werewolf-selection-item';
        item.dataset.id = p.id;
        item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
        item.onclick = () => {
          listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedId = p.id;
        };
        listEl.appendChild(item);
      });

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.onclick = () => {
        if (selectedId) {
          modal.classList.remove('visible');
          resolve(selectedId);
        } else {
          alert('请选择一个目标。');
        }
      };

      modal.classList.add('visible');
    });
  }


  function handleUserWerewolfSpeech() {
    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    if (!myPlayer || !myPlayer.isAlive) return;

    const userInput = document.getElementById('werewolf-user-input');
    const speech = userInput.value.trim();

    if (speech) {
      addDialogueLog(myPlayer.name, speech);
      renderWerewolfScreen();
    }


    document.getElementById('werewolf-action-bar').style.display = 'none';
    userInput.value = '';

    startVotingPhase();
  }

  async function handleAiContinueDiscussion() {
    addGameLog('你让大家继续讨论...');
    renderWerewolfScreen();


    const continueBtn = document.getElementById('werewolf-wait-reply-btn');
    if (continueBtn) continueBtn.disabled = true;



    await showCustomAlert("请稍候", "正在等待AI角色们继续讨论...");

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

    try {
      let isGemini = proxyUrl.includes('generativelanguage');

      let messagesForApi = [{
        role: 'user',
        content: '请AI角色们继续进行讨论。'
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
            temperature: state.globalSettings.apiTemperature || 0.9,
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
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const dialogues = JSON.parse(jsonMatch[0]);

      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }
    } catch (error) {
      console.error("狼人杀AI回应生成失败:", error);
      await showCustomAlert("AI 发言失败", `错误: ${error.message}`);
    } finally {

      if (continueBtn) continueBtn.disabled = false;
    }
  }


  async function handleWerewolfWaitReply() {
    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    if (!myPlayer || !myPlayer.isAlive) {
      console.warn("handleWerewolfWaitReply 被调用，但用户已死亡。操作被忽略。");
      return;
    }


    const userInput = document.getElementById('werewolf-user-input');
    const speech = userInput.value.trim();

    if (!speech) {
      alert("请先输入你的发言内容。");
      return;
    }

    addDialogueLog(myPlayer.name, speech);
    renderWerewolfScreen();
    userInput.value = '';

    await showCustomAlert("请稍候", "正在等待AI角色们对你的发言做出回应...");

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

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: `现在，请所有AI角色针对刚刚的发言（特别是'${myPlayer.name}'的发言）继续进行讨论。`
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
            temperature: state.globalSettings.apiTemperature || 0.9,
          })
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 错误: ${errorData.error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);



      let dialogues;
      try {

        let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        const startIndex = cleanedJsonString.indexOf('[');
        const endIndex = cleanedJsonString.lastIndexOf(']');

        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
          throw new Error("AI返回的内容中未找到有效的JSON数组结构 (`[...]`)。");
        }

        const jsonArrayString = cleanedJsonString.substring(startIndex, endIndex + 1);


        dialogues = JSON.parse(jsonArrayString);

      } catch (e) {

        if (e.message.includes("Bad control character")) {
          console.warn("检测到JSON中的非法控制字符，尝试清理并重试...");


          const sanitizeJsonString = (str) => {
            let inString = false;
            let escaped = false;
            let result = '';
            for (let i = 0; i < str.length; i++) {
              const char = str[i];

              if (escaped) {
                result += char;
                escaped = false;
                continue;
              }
              if (char === '\\') {
                result += char;
                escaped = true;
                continue;
              }
              if (char === '"') {
                result += char;
                inString = !inString;
                continue;
              }

              if (inString) {

                if (char === '\n') result += '\\n';
                else if (char === '\r') result += '\\r';
                else if (char === '\t') result += '\\t';

                else if (char.charCodeAt(0) < 32) continue;
                else result += char;
              } else {

                result += char;
              }
            }
            return result;
          };


          let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();


          const sanitizedString = sanitizeJsonString(cleanedJsonString);

          const jsonMatch = sanitizedString.match(/(\[[\s\S]*\])/);
          if (!jsonMatch) throw new Error("清理后仍未找到JSON数组。");

          dialogues = JSON.parse(jsonMatch[0]);

        } else {

          throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
        }
      }


      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }
    } catch (error) {
      console.error("狼人杀AI回应生成失败:", error);
      await showCustomAlert("AI 发言失败", `错误: ${error.message}`);
    }
  }


