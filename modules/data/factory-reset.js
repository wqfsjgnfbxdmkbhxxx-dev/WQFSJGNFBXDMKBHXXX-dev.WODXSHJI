  // ========== 从 script.js 迁移：handleFactoryReset ==========
  async function handleFactoryReset() {
    const confirmed = await showCustomConfirm(
      "☠️ 严重警告：初始化应用",
      "此操作将【永久删除】本地存储的所有数据，包括：\n\n❌ 所有聊天记录和设定\n❌ 所有图片、表情包、预设\n❌ 所有API配置和外观设置\n❌ 所有联机数据（好友、服务器、头像）\n\n应用将变回刚安装时的样子。数据一旦删除无法恢复！\n\n确定要继续吗？",
      { confirmButtonClass: 'btn-danger', confirmText: '我明白，继续' }
    );
    if (!confirmed) return;

    const verificationText = "立即重置";
    const userInput = await showCustomPrompt(
      "最终确认",
      `为了确认这不是误操作，请在下方框中准确输入"${verificationText}"四个字：`,
      "", "text"
    );
    if (userInput !== verificationText) {
      await showCustomAlert("操作取消", "验证文字输入错误，初始化已取消。");
      return;
    }

    await showCustomAlert("正在重置...", "正在销毁所有数据，应用即将重启...");

    try {
      if (typeof onlineChatManager !== 'undefined' && onlineChatManager) {
        onlineChatManager.shouldAutoReconnect = false;
        if (onlineChatManager.isConnected && onlineChatManager.ws) {
          onlineChatManager.ws.close();
          onlineChatManager.ws = null;
          onlineChatManager.isConnected = false;
        }
        if (onlineChatManager.reconnectTimer) {
          clearTimeout(onlineChatManager.reconnectTimer);
          onlineChatManager.reconnectTimer = null;
        }
        if (onlineChatManager.heartbeatTimer) {
          clearInterval(onlineChatManager.heartbeatTimer);
          onlineChatManager.heartbeatTimer = null;
        }
      }

      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });

      localStorage.clear();

      setTimeout(() => {
        window.location.reload(true);
      }, 1000);

    } catch (error) {
      console.error("初始化失败:", error);
      await showCustomAlert("错误", `重置过程中发生错误: ${error.message}\n请尝试手动清除浏览器缓存。`);
    }
  }
  window.handleFactoryReset = handleFactoryReset;

