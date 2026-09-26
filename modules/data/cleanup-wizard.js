  // ========== 高级数据清理向导 ==========

  let selectedCharsForClear = [];
  let selectedTypesForClear = [];

  function openDataClearWizard() {
    const modal = document.getElementById('data-clear-wizard-modal');
    selectedCharsForClear = [];
    selectedTypesForClear = [];


    renderClearWizardStep1();


    document.getElementById('data-clear-step-1').style.display = 'flex';
    document.getElementById('data-clear-step-2').style.display = 'none';

    modal.classList.add('visible');
  }


  function renderClearWizardStep1() {
    const listEl = document.getElementById('data-clear-char-list');
    listEl.innerHTML = '';


    const userItem = document.createElement('div');
    userItem.className = 'clear-posts-item';
    userItem.dataset.charId = 'user';
    userItem.innerHTML = `
        <div class="checkbox"></div>
        <span class="name">${state.qzoneSettings.nickname || '我'} (用户)</span>
    `;
    listEl.appendChild(userItem);


    Object.values(state.chats).forEach(chat => {
      if (!chat.isGroup) {
        const charItem = document.createElement('div');
        charItem.className = 'clear-posts-item';
        charItem.dataset.charId = chat.id;
        charItem.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${chat.name} (角色)</span>
            `;
        listEl.appendChild(charItem);
      } else {
        const groupItem = document.createElement('div');
        groupItem.className = 'clear-posts-item';
        groupItem.dataset.charId = chat.id;
        groupItem.dataset.isGroup = 'true';
        const memberCount = chat.members ? chat.members.length : 0;
        groupItem.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${chat.name} (群聊 - ${memberCount}人)</span>
            `;
        listEl.appendChild(groupItem);
      }
    });
  }


  function renderClearWizardStep2() {
    const listEl = document.getElementById('data-clear-type-list');
    listEl.innerHTML = '';

    const dataTypes = [{
      id: 'chat',
      name: '聊天记录',
      description: '将清空选定角色/群聊的所有对话消息。对于角色，还会清空曾用备注和你的昵称。'
    },
    {
      id: 'qzone',
      name: '动态与互动',
      description: '将清空选定角色的所有动态、评论和点赞。(不适用于群聊)'
    },
    {
      id: 'calls',
      name: '通话记录',
      description: '将清空选定角色的所有通话记录。(不适用于群聊)'
    },
    {
      id: 'thoughts',
      name: '心声',
      description: '将清空选定角色的心声和散记历史。(不适用于群聊)'
    },
    {
      id: 'memories',
      name: '长期记忆',
      description: '将清空选定角色的所有长期记忆。(不适用于群聊)'
    },
    {
      id: 'structured_memory',
      name: '结构化记忆',
      description: '将清空选定角色的所有结构化记忆数据及总结时间戳。(不适用于群聊)'
    },
    {
      id: 'status',
      name: '在线状态',
      description: '将重置选定角色的在线状态为默认值"在线"。(不适用于群聊)'
    },
    {
      id: 'countdown_memories',
      name: '倒计时/约定',
      description: '将清空与该角色的所有倒计时和约定。(不适用于群聊)'
    },
    {
      id: 'ai_memories',
      name: 'AI回忆',
      description: '将清空该角色创建的所有AI回忆记录。(不适用于群聊)'
    },
    {
      id: 'favorites',
      name: '收藏',
      description: '将清空收藏夹中所有与该角色相关的内容（如聊天、动态、日记等）。(不适用于群聊)'
    },
    {
      id: 'cphone',
      name: 'Cphone数据 (CPhone)',
      description: '将清空角色的相册、QQ、浏览器、淘宝、日记、备忘录等所有模拟手机数据。(不适用于群聊)'
    },
    {
      id: 'myphone',
      name: 'MyPhone数据 (MyPhone)',
      description: '将清空绑定角色的MyPhone所有数据，包括QQ联系人、相册、浏览器、淘宝、日记、备忘录、地图、APP记录、音乐等。(不适用于群聊)'
    },
    {
      id: 'todo',
      name: '待办事项 (To-Do)',
      description: '将清空选定角色的待办事项清单。(若第一步选"我"，则清除所有角色中由"我"创建的待办)'
    },
    {
      id: 'alipay_bills',
      name: '支付宝账单 (Alipay)',
      description: '将清空支付宝的所有交易流水、转账记录和基金买卖记录。(仅在第一步选择"我"时生效)'
    }
    ];

    dataTypes.forEach(type => {
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.typeId = type.id;
      item.innerHTML = `
                    <div class="checkbox"></div>
                    <div>
                        <span class="name">${type.name}</span>
                        <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${type.description}</p>
                    </div>
                `;
      listEl.appendChild(item);
    });
  }



  function handleDataClearNext() {
    const selectedItems = document.querySelectorAll('#data-clear-char-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要清理的角色或群聊。");
      return;
    }

    selectedCharsForClear = Array.from(selectedItems).map(item => item.dataset.charId);


    renderClearWizardStep2();
    document.getElementById('data-clear-step-1').style.display = 'none';
    document.getElementById('data-clear-step-2').style.display = 'flex';
  }


  function handleDataClearBack() {
    document.getElementById('data-clear-step-2').style.display = 'none';
    document.getElementById('data-clear-step-1').style.display = 'flex';

    document.querySelectorAll('#data-clear-char-list .clear-posts-item').forEach(item => {
      if (selectedCharsForClear.includes(item.dataset.charId)) {
        item.classList.add('selected');
      }
    });
  }


  async function handleConfirmDataClear() {
    const selectedItems = document.querySelectorAll('#data-clear-type-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一种要清理的数据类型。");
      return;
    }

    selectedTypesForClear = Array.from(selectedItems).map(item => item.dataset.typeId);

    const confirmed = await showCustomConfirm(
      '最后确认！',
      '此操作将永久删除您选择的所有数据，且无法恢复！确定要继续吗？', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行清理操作，请不要关闭页面...");

    try {
      await db.transaction('rw', db.tables, async () => {
        for (const charId of selectedCharsForClear) {
          for (const type of selectedTypesForClear) {
            if (type === 'todo') {
              if (charId === 'user') {
                // 如果第一步选的是"我 (用户)"，则遍历所有聊天，只删除 creator 为 'user' 的待办
                const allChats = await db.chats.toArray();
                for (const chat of allChats) {
                  if (chat.todoList && chat.todoList.length > 0) {
                    const originalLength = chat.todoList.length;
                    // 过滤掉用户创建的，保留AI创建的
                    chat.todoList = chat.todoList.filter(t => t.creator !== 'user');

                    if (chat.todoList.length < originalLength) {
                      await db.chats.put(chat);
                    }
                  }
                }
                console.log("已清理所有由用户创建的待办事项");
              } else {
                // 如果选的是具体角色或群聊，直接清空该对象的待办列表 (todoList)
                const chat = await db.chats.get(charId);
                if (chat) {
                  if (chat.isGroup) {
                    console.log(`跳过群聊 ${chat.name} 的待办事项清理（群聊不适用）`);
                    continue;
                  }
                  chat.todoList = []; // 直接置空
                  await db.chats.put(chat);
                  console.log(`已清空角色 ${chat.name} 的待办事项`);
                }
              }
            }
            if (type === 'alipay_bills') {
              // 只有当第一步选择了"我(用户)"时，才执行清空，防止误操作
              if (charId === 'user') {
                await db.userTransactions.clear(); // 清空账单表
                console.log("支付宝账单已全部清空");

                // 可选：如果你还想重置钱包余额和基金持仓，可以解开下面注释
                /*
                const wallet = await db.userWallet.get('main');
                if(wallet) {
                    wallet.balance = 0; // 重置余额
                    wallet.fundHoldings = []; // 重置基金
                    await db.userWallet.put(wallet);
                }
                */
              } else {
                // 如果选择了某个角色，尝试删除该角色名字相关的账单(模糊匹配)
                // 注意：这依赖于description包含角色名，可能不完全准确，建议只用上面的清空全部
                const chat = await db.chats.get(charId);
                if (chat) {
                  const nameKeys = [chat.name, chat.originalName];
                  // 这是一个比较耗时的过滤删除，但对于清理特定角色流水很有用
                  await db.userTransactions
                    .filter(t => nameKeys.some(k => t.description && t.description.includes(k)))
                    .delete();
                }
              }
            }
            if (type === 'chat') {
              if (charId === 'user') {
                const allChats = await db.chats.toArray();
                for (const chat of allChats) {
                  chat.history = chat.history.filter(msg => msg.role !== 'user');
                  await db.chats.put(chat);
                }
              } else {
                const chat = await db.chats.get(charId);
                if (chat) {
                  // 如果是群聊，只清空聊天记录，保留其他信息
                  if (chat.isGroup) {
                    chat.history = [];
                    // 保留群设置、成员等信息
                    await db.chats.put(chat);
                    console.log(`已清空群聊 ${chat.name} 的聊天记录`);
                  } else {
                    // 单聊的处理逻辑（清空更多信息）
                    chat.history = [];
                    chat.heartfeltVoice = '...';
                    chat.randomJottings = '...';
                    chat.customThoughts = {};
                    if (Array.isArray(chat.nameHistory)) {
                      chat.nameHistory = [];
                    }
                    if (chat.settings) {
                      chat.settings.myNickname = '我';
                    }
                    await db.chats.put(chat);
                  }
                }
              }
            }

            if (type === 'qzone') {
              // 群聊不适用于动态清理
              if (charId !== 'user') {
                const chat = await db.chats.get(charId);
                if (chat && chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的动态清理（群聊不适用）`);
                  continue;
                }
              }
              const authorId = (charId === 'user') ? 'user' : charId;
              await db.qzonePosts.where('authorId').equals(authorId).delete();
            }

            if (type === 'calls' && charId !== 'user') {
              // 检查是否为群聊
              const chat = await db.chats.get(charId);
              if (chat && chat.isGroup) {
                console.log(`跳过群聊 ${chat.name} 的通话记录清理（群聊不适用）`);
                continue;
              }
              await db.callRecords.where('chatId').equals(charId).delete();
            }

            if (type === 'thoughts' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的心声清理（群聊不适用）`);
                  continue;
                }
                chat.thoughtsHistory = [];
                chat.heartfeltVoice = '...';
                chat.randomJottings = '...';
                chat.customThoughts = {};
                await db.chats.put(chat);
              }
            }

            if (type === 'memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的长期记忆清理（群聊不适用）`);
                  continue;
                }
                chat.longTermMemory = [];
                await db.chats.put(chat);
              }
            }

            if (type === 'structured_memory' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的结构化记忆清理（群聊不适用）`);
                  continue;
                }
                chat.structuredMemory = null;
                chat.lastStructuredMemoryTimestamp = 0;
                await db.chats.put(chat);
              }
            }

            if (type === 'status' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的在线状态重置（群聊不适用）`);
                  continue;
                }
                chat.status = { text: '在线', isBusy: false, lastUpdate: Date.now() };
                await db.chats.put(chat);
              }
            }

            if (type === 'countdown_memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的倒计时清理（群聊不适用）`);
                  continue;
                }
                // 删除该角色的所有倒计时/约定
                await db.memories.where('chatId').equals(charId).and(m => m.type === 'countdown').delete();
                console.log(`已清空角色 ${chat.name} 的所有倒计时/约定`);
              }
            }

            if (type === 'ai_memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的AI回忆清理（群聊不适用）`);
                  continue;
                }
                // 删除该角色的所有AI生成的回忆
                await db.memories.where('chatId').equals(charId).and(m => m.type === 'ai_generated').delete();
                console.log(`已清空角色 ${chat.name} 的所有AI回忆`);
              }
            }


            if (type === 'favorites') {
              if (charId === 'user') {

                await db.favorites.where('type').equals('qzone_post').filter(fav => fav.content.authorId === 'user').delete();

                await db.favorites.where('type').equals('chat_message').filter(fav => fav.content.role === 'user').delete();
              } else {
                // 检查是否为群聊
                const chat = await db.chats.get(charId);
                if (chat && chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的收藏清理（群聊不适用）`);
                  continue;
                }

                await db.favorites.where('type').equals('chat_message').and(fav => fav.chatId === charId).delete();

                await db.favorites.where('type').equals('qzone_post').filter(fav => fav.content.authorId === charId).delete();

                await db.favorites.where('type').equals('char_diary').filter(fav => fav.content.characterId === charId).delete();
                await db.favorites.where('type').equals('char_browser_article').filter(fav => fav.content.characterId === charId).delete();
                await db.favorites.where('type').equals('char_memo').filter(fav => fav.content.characterId === charId).delete();
              }
            }


            if (type === 'cphone' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的CPhone数据清理（群聊不适用）`);
                  continue;
                }
                chat.simulatedAlbum = [];
                chat.simulatedConversations = [];
                chat.simulatedBrowserHistory = [];
                chat.simulatedTaobaoHistory = null;
                chat.simulatedAmapHistory = [];
                chat.simulatedAppUsage = [];
                chat.simulatedMusicPlaylist = [];
                chat.diary = [];
                chat.memos = [];
                await db.chats.put(chat);
              }
            }

            if (type === 'myphone' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的MyPhone数据清理（群聊不适用）`);
                  continue;
                }
                chat.myPhoneSimulatedQQConversations = [];
                chat.myPhoneAlbum = [];
                chat.myPhoneBrowserHistory = [];
                chat.myPhoneTaobaoHistory = [];
                chat.myPhoneAmapHistory = [];
                chat.myPhoneAppUsage = [];
                chat.myPhoneMusicPlaylist = [];
                chat.myPhoneDiaries = [];
                chat.myPhoneMemos = [];
                await db.chats.put(chat);
              }
            }
          }
        }
      });

      await loadAllDataFromDB();
      await renderChatList();
      const alipayScreen = document.getElementById('alipay-screen');
      if (alipayScreen && alipayScreen.classList.contains('active')) {
        // 如果你之前定义了 loadBills 函数
        if (typeof loadBills === 'function') {
          await loadBills(true); // true 代表重置并重新加载
        }
        // 同时更新余额显示（如果刚才解开了重置余额的注释）
        if (window.userBalance !== undefined) {
          const wallet = await db.userWallet.get('main');
          if (wallet) {
            window.userBalance = wallet.balance;
            document.getElementById('alipay-balance-display').textContent = window.userBalance.toFixed(2);
          }
        }
      }
      document.getElementById('data-clear-wizard-modal').classList.remove('visible');
      await showCustomAlert("清理完成", "指定的数据已成功清除。");

    } catch (error) {
      console.error("高级数据清理失败:", error);
      await showCustomAlert("清理失败", `操作失败: ${error.message}`);
    }
  }


