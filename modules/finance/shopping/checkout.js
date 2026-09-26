  async function handleCheckout() {
    const chat = state.chats[state.activeChatId];
    const selectedItems = shoppingCart.filter(item =>
      document.querySelector(`.cart-item-checkbox[data-id="${item.productId}"]:checked`)
    );

    if (selectedItems.length === 0) {
      alert("请先在购物车中选择要结算的商品。");
      return;
    }

    // 计算总价
    const productIds = selectedItems.map(item => item.productId);
    const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
    const productMap = new Map(products.map(p => [p.id, p]));

    let totalCost = 0;
    selectedItems.forEach(cartItem => {
      const product = productMap.get(cartItem.productId);
      if (product) {
        const price = cartItem.variation ? cartItem.variation.price : product.price;
        totalCost += price * cartItem.quantity;
      }
    });

    // 1. 准备支付选项
    const wallet = await db.userWallet.get('main') || { balance: 0, kinshipCards: [] };
    const balance = wallet.balance || 0;
    const kinshipCards = wallet.kinshipCards || [];

    const iconWallet = `<div class="pay-opt-icon" style="background:#1677ff; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">支</div>`;
    const iconKinship = `<div class="pay-opt-icon" style="background:linear-gradient(135deg, #ff5252, #ff1744); display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">亲</div>`;

    const paymentOptions = [];

    if (balance >= totalCost) {
      paymentOptions.push({
        text: `<div class="pay-opt-left">${iconWallet}<div class="pay-opt-info"><span class="pay-opt-title">账户余额</span><span class="pay-opt-desc">剩余 ¥${balance.toFixed(2)}</span></div></div>`,
        value: 'balance'
      });
    }

    kinshipCards.forEach(card => {
      const providerChat = state.chats[card.chatId];
      const name = providerChat ? providerChat.name : '未知';
      const remaining = card.limit - (card.spent || 0);

      if (remaining >= totalCost) {
        paymentOptions.push({
          text: `<div class="pay-opt-left">${iconKinship}<div class="pay-opt-info"><span class="pay-opt-title">亲属卡 - ${name}</span><span class="pay-opt-desc">剩余额度 ¥${remaining.toFixed(2)}</span></div></div>`,
          value: `kinship_${card.chatId}`
        });
      }
    });

    if (paymentOptions.length === 0) {
      await showCustomAlert('支付失败', `余额或亲属卡额度不足！\n需要: ¥${totalCost.toFixed(2)}`);
      return;
    }

    // 2. 弹出支付选择
    const paymentMethod = await showChoiceModal(`支付 ¥${totalCost.toFixed(2)}`, paymentOptions);
    if (!paymentMethod) return;

    let transactionDesc = selectedItems.length === 1 ? `购买-${productMap.get(selectedItems[0].productId).name}` : `购买-${selectedItems.length}件商品`;

    // 3. 执行扣款和记账
    if (paymentMethod === 'balance') {
      const success = await processTransaction(totalCost, 'expense', transactionDesc);
      if (!success) return;
    } else if (paymentMethod.startsWith('kinship_')) {
      const cardChatId = paymentMethod.replace('kinship_', '');
      const cardIndex = wallet.kinshipCards.findIndex(c => c.chatId === cardChatId);

      if (cardIndex > -1) {
        // A. 扣额度
        wallet.kinshipCards[cardIndex].spent = (wallet.kinshipCards[cardIndex].spent || 0) + totalCost;
        await db.userWallet.put(wallet);

        // B. 记账
        await db.userTransactions.add({
          timestamp: Date.now(),
          type: 'expense',
          amount: totalCost,
          description: `亲属卡-${transactionDesc}`
        });

        // C. 通知金主 (生成可见的系统通知，方便删除)
        const providerChat = state.chats[cardChatId];
        if (providerChat) {
          const itemNames = selectedItems.map(i => productMap.get(i.productId).name).join('、');
          const remaining = wallet.kinshipCards[cardIndex].limit - wallet.kinshipCards[cardIndex].spent;

          const notifyMsg = {
            role: 'system',
            type: 'pat_message', // 【修改】使用灰色系统消息样式
            content: `你使用亲属卡消费 ¥${totalCost.toFixed(2)} 购买了：${itemNames} (余 ¥${remaining.toFixed(2)})`,
            timestamp: Date.now()
            // 【修改】移除 isHidden: true，使其可见
          };
          providerChat.history.push(notifyMsg);
          await db.chats.put(providerChat);

          // 如果当前就在该聊天，立即显示
          if (state.activeChatId === cardChatId) {
            appendMessage(notifyMsg, providerChat);
          }
        }
      } else {
        alert("系统错误：找不到对应的亲属卡记录，支付取消。");
        return;
      }
    }

    // 4. 后续逻辑：选择用途 (送礼 vs 自用)
    if (chat.isGroup) {
      // 群聊逻辑保持不变：选择群友赠送
      openGiftRecipientPicker();
    } else {
      // 单聊逻辑：增加选择弹窗
      const usageChoice = await showChoiceModal('购买成功！请选择用途', [
        { text: '🎁 送给 TA', value: 'gift' },
        { text: '🛍️ 留给自己', value: 'self' }
      ]);

      if (usageChoice === 'gift') {
        // 送礼流程 (sendGiftMessage 内部会处理购物车清理和跳转)
        await sendGiftMessage(selectedItems);
      } else {
        // 自用流程
        // 1. 从购物车移除商品
        shoppingCart = shoppingCart.filter(item => !selectedItems.some(sent => sent.productId === item.productId));
        updateCartCount();
        saveShoppingCart(); // 保存购物车

        // 2. 如果是余额支付，也补一条可见通知 (亲属卡刚才已经发过了)
        if (paymentMethod === 'balance') {
          const itemNames = selectedItems.map(i => productMap.get(i.productId).name).join('、');
          const selfBuyMsg = {
            role: 'system',
            type: 'pat_message',
            content: `你购买了：${itemNames}`,
            timestamp: Date.now()
          };
          chat.history.push(selfBuyMsg);
          await db.chats.put(chat);
        }

        // 3. 返回聊天界面
        showScreen('chat-interface-screen');
        // 如果刚才有新消息推入（余额支付通知），刷新一下界面
        if (paymentMethod === 'balance') {
          renderChatInterface(state.activeChatId);
        }
      }
    }
  }


  async function sendGiftMessage(itemsToSend, recipients = null) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];

    const productIds = itemsToSend.map(item => item.productId);
    const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
    const productMap = new Map(products.map(p => [p.id, p]));

    const itemsForMessage = itemsToSend.map(cartItem => {
      const product = productMap.get(cartItem.productId);
      if (cartItem.variation) {

        return {
          name: `${product.name} - ${cartItem.variation.name}`,
          price: cartItem.variation.price,
          imageUrl: cartItem.variation.imageUrl || product.imageUrl,
          quantity: cartItem.quantity
        };
      } else {

        return {
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: cartItem.quantity
        };
      }
    });
    const giftMessage = {
      role: 'user',
      type: 'gift',
      timestamp: Date.now(),
      items: itemsForMessage,
      total: itemsForMessage.reduce((sum, item) => sum + item.price * item.quantity, 0),
      recipients: recipients
    };

    chat.history.push(giftMessage);


    if (recipients && recipients.length > 0) {
      const recipientDisplayNames = recipients.map(originalName => getDisplayNameInGroup(chat, originalName)).join('、');
      const hiddenMessage = {
        role: 'system',
        content: `[系统提示：用户 (${chat.settings.myNickname || '我'}) 送出了一份礼物，收礼人是：${recipientDisplayNames}。请收礼的角色表示感谢，其他角色可以自由发挥。]`,
        timestamp: Date.now() + 1,
        isHidden: true
      };
      chat.history.push(hiddenMessage);
    }

    await db.chats.put(chat);

    appendMessage(giftMessage, chat);
    renderChatList();


    shoppingCart = shoppingCart.filter(item => !itemsToSend.some(sent => sent.productId === item.productId));
    updateCartCount();
    saveShoppingCart(); // 保存购物车
    showScreen('chat-interface-screen');

    await showCustomAlert('成功', '礼物已成功送出！');
  }


  function showGiftReceipt(timestamp) {

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestamp);
    if (!message || message.type !== 'gift') return;
    const receiptBody = document.getElementById('gift-receipt-body');
    let itemsHtml = '';
    message.items.forEach(item => {
      itemsHtml += `<tr><td class="item-name">${item.name}</td><td class="item-qty">${item.quantity}</td><td class="item-price">¥${item.price.toFixed(2)}</td><td class="item-subtotal">¥${(item.price * item.quantity).toFixed(2)}</td></tr>`;
    });
    receiptBody.innerHTML = `<div class="receipt-header"><h3>购物中心</h3><p>交易时间: ${new Date(message.timestamp).toLocaleString()}</p></div><table class="receipt-items-table"><thead><tr><th class="item-name">商品</th><th class="item-qty">数量</th><th class="item-price">单价</th><th class="item-subtotal">小计</th></tr></thead><tbody>${itemsHtml}</tbody></table><div class="receipt-total">总计: ¥${message.total.toFixed(2)}</div><div class="receipt-footer">感谢您的惠顾，欢迎再次光临！</div>`;
    document.getElementById('gift-receipt-modal').classList.add('visible');
  }


