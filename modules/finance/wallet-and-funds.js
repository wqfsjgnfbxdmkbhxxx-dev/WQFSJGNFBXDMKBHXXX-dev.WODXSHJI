// ========== 钱包与基金初始化（从 script.js 补充拆分） ==========

  if (typeof window.userBalance === 'undefined') window.userBalance = 0;

  async function initUserWallet() {
    try {
      let wallet = await db.userWallet.get('main');

      // 如果没有钱包，或者余额变成了 NaN/null/undefined，强制修复
      if (!wallet || typeof wallet.balance !== 'number' || isNaN(wallet.balance)) {
        console.warn("检测到钱包数据异常 (NaN 或 不存在)，正在重置...");

        // 尝试保留旧的亲属卡数据，只重置余额
        const oldKinship = (wallet && wallet.kinshipCards) ? wallet.kinshipCards : [];

        wallet = {
          id: 'main',
          balance: 0, // 强制重置为 0
          kinshipCards: oldKinship,
          lastResetMonth: ''
        };

        await db.userWallet.put(wallet);
        window.userBalance = 0;
      } else {
        // 数据正常，读取余额
        window.userBalance = wallet.balance;

        // 补全可能缺失的字段
        if (!wallet.kinshipCards) {
          wallet.kinshipCards = [];
          await db.userWallet.put(wallet);
        }
      }

      // 每月自动重置亲属卡额度逻辑 (保持不变)
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      if (wallet.lastResetMonth !== currentMonthKey) {
        if (wallet.kinshipCards && wallet.kinshipCards.length > 0) {
          wallet.kinshipCards.forEach(card => { card.spent = 0; });
          await db.userWallet.put(wallet);
        }
        wallet.lastResetMonth = currentMonthKey;
        await db.userWallet.put(wallet);
      }

      console.log("用户钱包初始化完成，当前余额:", window.userBalance);

      // 立即更新界面上的显示（如果正在显示的话）
      const displayEl = document.getElementById('alipay-balance-display');
      if (displayEl) displayEl.textContent = window.userBalance.toFixed(2);

    } catch (e) {
      console.error("初始化钱包失败:", e);
      window.userBalance = 0;
    }
  }

  // 初始化基金数据
  async function initFunds() {
    const count = await db.funds.count();
    if (count === 0) {
      const initialFunds = [
        { id: 'f01', code: '001001', name: '招财进宝混合', riskLevel: 'medium', currentNav: 1.520, lastDayNav: 1.510, history: [] },
        { id: 'f02', code: '002088', name: '科技先锋成长', riskLevel: 'high', currentNav: 2.305, lastDayNav: 2.280, history: [] },
        { id: 'f03', code: '003099', name: '稳健债基A', riskLevel: 'low', currentNav: 1.050, lastDayNav: 1.049, history: [] },
        { id: 'f04', code: '005666', name: '新能源精选', riskLevel: 'high', currentNav: 3.100, lastDayNav: 3.200, history: [] },
        { id: 'f05', code: '008888', name: '消费红利指数', riskLevel: 'medium', currentNav: 1.880, lastDayNav: 1.885, history: [] },
        { id: 'f06', code: '110022', name: '全球医疗医药', riskLevel: 'high', currentNav: 0.950, lastDayNav: 0.940, history: [] }
      ];
      await db.funds.bulkAdd(initialFunds);
    }
    // 补全钱包字段
    const wallet = await db.userWallet.get('main');
    if (wallet && !wallet.fundHoldings) {
      wallet.fundHoldings = [];
      await db.userWallet.put(wallet);
    }
  }

// ========== 钱包交易处理（从 script.js 补充拆分，原第 60109~60165 行） ==========

  async function processTransaction(amount, type, description) {
    let safeAmount = parseFloat(amount);
    if (isNaN(safeAmount) || safeAmount <= 0) {
      console.error("记账失败：金额无效", amount);
      return false;
    }

    try {
      let wallet = await db.userWallet.get('main');
      if (!wallet) {
        wallet = { id: 'main', balance: 0, kinshipCards: [] };
      }

      if (typeof wallet.balance !== 'number') wallet.balance = 0;

      if (type === 'expense') {
        if (wallet.balance < safeAmount) {
          await showCustomAlert("支付失败", `余额不足！当前: ${wallet.balance.toFixed(2)}`);
          return false;
        }
        wallet.balance -= safeAmount;
      } else if (type === 'income') {
        wallet.balance += safeAmount;
      }

      await db.userWallet.put(wallet);
      window.userBalance = wallet.balance;

      const transaction = {
        timestamp: Date.now(),
        type: type,
        amount: safeAmount,
        description: description || '未知交易'
      };
      await db.userTransactions.add(transaction);

      console.log(`✅ [钱包] 交易成功: ${type} ¥${safeAmount.toFixed(2)}. 新余额: ${wallet.balance.toFixed(2)}`);
      return true;

    } catch (e) {
      console.error("写入钱包数据库失败:", e);
      alert("系统错误：账单写入失败，请检查控制台。");
      return false;
    }
  }

  // ========== 全局暴露 ==========
  window.openDataClearWizard = openDataClearWizard;
  window.openWorldBookDeletionModal = openWorldBookDeletionModal;
  window.openWorldBookEditor = openWorldBookEditor;
  window.handleDataClearBack = handleDataClearBack;
  window.handleDataClearNext = handleDataClearNext;
  window.handleConfirmDataClear = handleConfirmDataClear;
  window.handleConfirmWorldBookDeletion = handleConfirmWorldBookDeletion;
  window.checkForUpdates = checkForUpdates;
  window.checkAndFixData = checkAndFixData;
  window.cleanupRedundantData = cleanupRedundantData;
  window.compressAllLocalImages = compressAllLocalImages;
  window.applyCustomFont = applyCustomFont;
  window.initUserWallet = initUserWallet;
  window.initFunds = initFunds;

