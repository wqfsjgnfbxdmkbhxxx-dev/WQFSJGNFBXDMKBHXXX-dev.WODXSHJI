// ============================================================
// data-management.js — 数据管理模块
// 从 script.js 拆分而来
// 包含：数据清理、数据分布统计、字体管理、图片压缩、更新检查等
// ============================================================

// ========== 冗余数据清理 ==========

async function cleanupRedundantData() {
    const confirmed = await showCustomConfirm(
      '确认清理冗余数据？',
      '此操作将扫描数据库，移除所有与已删除角色相关的孤立数据（如动态、评论、记忆等）。<br><br><strong>此操作不可撤销，但通常是安全的。NPC数据不会被删除。</strong><br><br>建议在操作前先导出数据备份。', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认清理'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在开始清理冗余数据，请不要关闭页面...");
    console.log("冗余数据清理流程已启动...");

    let cleanupCounts = {
      posts: 0,
      likes: 0,
      comments: 0,
      memories: 0,
      callRecords: 0,
      renderingRules: 0,
      groupMembers: 0,
      chatLinks: 0,
    };

    try {
      await db.transaction('rw', db.tables, async () => {

        const allChats = await db.chats.toArray();
        const allNpcs = await db.npcs.toArray();

        const existingChatIds = new Set(allChats.map(c => c.id));
        const existingNpcIds = new Set(allNpcs.map(n => `npc_${n.id}`));

        const existingOriginalNames = new Set(allChats.filter(c => !c.isGroup).map(c => c.originalName));
        existingOriginalNames.add(state.qzoneSettings.nickname || '{{user}}');

        allNpcs.forEach(npc => existingOriginalNames.add(npc.name));


        for (const chat of allChats) {
          let chatModified = false;
          if (chat.isGroup && chat.members) {
            const originalMemberCount = chat.members.length;


            chat.members = chat.members.filter(member =>
              existingChatIds.has(member.id) || existingNpcIds.has(member.id)
            );

            if (chat.members.length < originalMemberCount) {
              cleanupCounts.groupMembers += (originalMemberCount - chat.members.length);
              chatModified = true;
            }
          }

          if (chat.settings?.linkedMemoryChatIds?.length > 0) {
            const originalLinkCount = chat.settings.linkedMemoryChatIds.length;
            chat.settings.linkedMemoryChatIds = chat.settings.linkedMemoryChatIds.filter(id => existingChatIds.has(id));
            if (chat.settings.linkedMemoryChatIds.length < originalLinkCount) {
              cleanupCounts.chatLinks += (originalLinkCount - chat.settings.linkedMemoryChatIds.length);
              chatModified = true;
            }
          }
          if (chatModified) {
            await db.chats.put(chat);
          }
        }


        const allPosts = await db.qzonePosts.toArray();
        for (const post of allPosts) {
          let postModified = false;



          const isAuthorValid = post.authorId === 'user' || existingChatIds.has(post.authorId) || existingNpcIds.has(post.authorId);

          if (!isAuthorValid) {
            await db.qzonePosts.delete(post.id);
            cleanupCounts.posts++;
            continue;
          }

          if (post.likes && post.likes.length > 0) {
            const originalLikeCount = post.likes.length;
            post.likes = post.likes.filter(name => existingOriginalNames.has(name));
            if (post.likes.length < originalLikeCount) {
              cleanupCounts.likes += (originalLikeCount - post.likes.length);
              postModified = true;
            }
          }
          if (post.comments && post.comments.length > 0) {
            const originalCommentCount = post.comments.length;
            post.comments = post.comments.filter(comment => {
              if (typeof comment === 'object' && comment.commenterName) {
                return existingOriginalNames.has(comment.commenterName);
              }
              return true;
            });
            if (post.comments.length < originalCommentCount) {
              cleanupCounts.comments += (originalCommentCount - post.comments.length);
              postModified = true;
            }
          }
          if (postModified) {
            await db.qzonePosts.put(post);
          }
        }


        await db.memories.where('chatId').noneOf([...existingChatIds]).delete().then(c => cleanupCounts.memories += c);
        await db.callRecords.where('chatId').noneOf([...existingChatIds]).delete().then(c => cleanupCounts.callRecords += c);
        const allRules = await db.renderingRules.toArray();
        for (const rule of allRules) {
          const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];
          // 如果规则绑定了 'global'，则保留
          if (scope.includes('global')) continue;
          // 如果规则绑定的所有 chatId 都不存在了，才删除
          const hasValidChat = scope.some(id => existingChatIds.has(id));
          if (!hasValidChat) {
            await db.renderingRules.delete(rule.id);
            cleanupCounts.renderingRules++;
          }
        }
      });

      let summary = "✅ 清理完成！\n\n";
      let cleanedSomething = false;
      Object.entries(cleanupCounts).forEach(([key, value]) => {
        if (value > 0) {
          const keyMap = {
            posts: '动态',
            likes: '点赞',
            comments: '评论',
            memories: '记忆',
            callRecords: '通话记录',
            renderingRules: '渲染规则',
            groupMembers: '群成员',
            chatLinks: '记忆链接'
          };
          summary += `- 清理了 ${value} 条无效的${keyMap[key] || key}。\n`;
          cleanedSomething = true;
        }
      });
      if (!cleanedSomething) {
        summary = "✅ 检查完成，未发现任何冗余数据。";
      }
      summary += "\n建议刷新页面以确保所有更改生效。";

      await showCustomAlert("操作成功", summary);

      const confirmedReload = await showCustomConfirm("刷新页面？", "为了确保所有数据同步，建议立即刷新页面。");
      if (confirmedReload) {
        location.reload();
      }

    } catch (error) {
      console.error("清理冗余数据时出错:", error);
      await showCustomAlert('清理失败', `发生了一个错误: ${error.message}`);
    }
  }


  // ========== 清理指定数据表 ==========

  // 清理指定数据表
  async function cleanupTableData(tableName, statElem) {
    // 不可清理的核心表
    const protectedTables = ['apiConfig', 'globalSettings', 'userWallet'];
    
    if (protectedTables.includes(tableName)) {
      await showCustomAlert("无法清理", "此数据表为系统核心配置，不可清理。");
      return false;
    }

    const confirmed = await showCustomConfirm(
      "确认清理数据",
      `即将清空 <strong>${statElem.dataset.tableCnName}</strong> 的所有数据。<br><br>⚠️ <strong>此操作不可撤销！</strong><br>建议在清理前先备份数据。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清理'
      }
    );

    if (!confirmed) return false;

    try {
      // 执行清理
      await db.table(tableName).clear();
      return true;
    } catch (error) {
      console.error(`清理表 ${tableName} 失败:`, error);
      await showCustomAlert("清理失败", `发生错误: ${error.message}`);
      return false;
    }
  }

  // ========== 数据分布统计 ==========

  // 查看数据分布统计（改为显示全屏界面）
  async function viewDataDistribution() {
    // 显示数据分析统计界面
    showScreen('data-distribution-screen');
    
    // 获取容器并渲染数据
    const container = document.getElementById('data-distribution-container');
    await renderDistributionData(container);
  }

  // 渲染数据分布内容
  async function renderDistributionData(container) {
    container.innerHTML = '<p style="text-align: center; padding: 40px 0;">正在统计数据...</p>';

    try {
      // 数据表的中文名称映射
      const tableNameMap = {
        chats: '聊天记录',
        worldBooks: '世界书',
        userStickers: '表情包',
        apiConfig: 'API配置',
        globalSettings: '全局设置',
        personaPresets: '人设预设',
        musicLibrary: '音乐库',
        qzoneSettings: '空间设置',
        qzonePosts: '空间动态',
        qzoneAlbums: '相册',
        qzonePhotos: '相片',
        favorites: '收藏',
        qzoneGroups: '分组',
        memories: '记忆',
        worldBookCategories: '世界书分类',
        apiPresets: 'API预设',
        soundPresets: '声音预设',
        shoppingProducts: '商品',
        callRecords: '通话记录',
        renderingRules: '渲染规则',
        doubanPosts: '豆瓣帖子',
        stickerCategories: '表情包分类',
        appearancePresets: '外观预设',
        presets: '预设',
        presetCategories: '预设分类',
        npcs: 'NPC',
        stickerVisionCache: '表情识别缓存',
        shoppingCategories: '商品分类',
        customAvatarFrames: '自定义头像框',
        readingLibrary: '阅读库',
        quickReplies: '快捷回复',
        quickReplyCategories: '快捷回复分类',
        npcGroups: 'NPC分组',
        naiPresets: 'NAI预设',
        grAuthors: '绿江作者',
        grStories: '绿江故事',
        userWallet: '钱包',
        userTransactions: '交易记录',
        funds: '基金',
        auctions: '拍卖',
        inventory: '背包',
        emails: '邮件',
        watchTogetherPlaylist: '观影播放列表'
      };

      // 统计各表数据
      const stats = [];
      let totalRecords = 0;
      let totalSize = 0;

      for (const table of db.tables) {
        const tableName = table.name;
        const count = await table.count();
        
        if (count > 0) {
          // 获取表数据并计算大小
          const data = await table.toArray();
          const dataStr = JSON.stringify(data);
          const sizeBytes = new Blob([dataStr]).size;
          const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
          
          stats.push({
            name: tableNameMap[tableName] || tableName,
            tableName: tableName,
            count: count,
            size: sizeBytes,
            sizeMB: sizeMB
          });
          
          totalRecords += count;
          totalSize += sizeBytes;
        }
      }

      // 按数据量大小排序
      stats.sort((a, b) => b.size - a.size);

      // 计算总大小
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

      // 生成HTML显示
      let html = `
        <div style="text-align: left;">
          <div style="background: var(--bg-secondary, #f5f5f5); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
            <h3 style="margin: 0 0 10px 0; color: var(--text-primary);">📊 数据总览</h3>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>总记录数：</strong><span style="color: #007bff;">${totalRecords.toLocaleString()}</span> 条
            </p>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>总数据量：</strong><span style="color: #28a745;">${totalSizeMB}</span> MB
            </p>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>包含表数：</strong><span style="color: #6c757d;">${stats.length}</span> 个
            </p>
          </div>

          <div style="background: var(--bg-primary, #fff); border-radius: 10px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background: var(--bg-secondary, #f5f5f5); position: sticky; top: 0;">
                <tr>
                  <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--border-color, #ddd); min-width: 140px;">数据类型</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 90px;">记录数</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 80px;">大小(MB)</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 150px;">占比</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border-color, #ddd); width: 80px;">操作</th>
                </tr>
              </thead>
              <tbody>
      `;

      stats.forEach((stat, index) => {
        const percentage = ((stat.size / totalSize) * 100).toFixed(1);
        const bgColor = index % 2 === 0 ? 'transparent' : 'var(--bg-secondary, #f9f9f9)';
        const canClean = !['apiConfig', 'globalSettings', 'userWallet'].includes(stat.tableName);
        
        html += `
          <tr class="stat-row" data-table-name="${stat.tableName}" data-table-cn-name="${stat.name}" style="background: ${bgColor};">
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #eee);">
              <div style="font-weight: 500;">${stat.name}</div>
              <div style="font-size: 11px; color: var(--text-secondary, #999);">${stat.tableName}</div>
            </td>
            <td class="stat-count" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee); color: #007bff;">
              ${stat.count.toLocaleString()}
            </td>
            <td class="stat-size" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee); color: #28a745;">
              ${stat.sizeMB}
            </td>
            <td class="stat-percentage" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee);">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px;">
                <div style="width: 60px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
                  <div class="percentage-bar" style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #007bff, #0056b3); border-radius: 4px;"></div>
                </div>
                <span class="percentage-text" style="font-size: 12px; color: var(--text-secondary); min-width: 45px;">${percentage}%</span>
              </div>
            </td>
            <td style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border-color, #eee);">
              ${canClean ? `
                <button class="cleanup-btn" data-table="${stat.tableName}" style="
                  background: #ff3b30;
                  color: white;
                  border: none;
                  padding: 5px 12px;
                  border-radius: 5px;
                  font-size: 12px;
                  cursor: pointer;
                  transition: all 0.2s;
                " onmouseover="this.style.background='#d32f2f'" onmouseout="this.style.background='#ff3b30'">
                  清理
                </button>
              ` : `<span style="font-size: 11px; color: #999;">不可清理</span>`}
            </td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>

          <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 12px; color: #856404;">
              💡 <strong>提示：</strong>点击"清理"按钮可以清空对应数据表。清理后数据将实时更新。<strong>清理前请务必备份！</strong>
            </p>
          </div>
        </div>
      `;

      container.innerHTML = html;

      // 绑定清理按钮事件
      container.querySelectorAll('.cleanup-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tableName = btn.dataset.table;
          const row = btn.closest('.stat-row');
          
          // 执行清理
          const success = await cleanupTableData(tableName, row);
          
          if (success) {
            // 清理成功，刷新显示
            showToast('数据已清理，正在刷新统计...', 'success');
            await renderDistributionData(container);
          }
        });
      });

    } catch (error) {
      console.error("统计数据分布时出错:", error);
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: #ff3b30; font-size: 16px; margin-bottom: 10px;">⚠️ 统计失败</p>
          <p style="color: #666; font-size: 14px;">${error.message}</p>
        </div>
      `;
    }
  }


