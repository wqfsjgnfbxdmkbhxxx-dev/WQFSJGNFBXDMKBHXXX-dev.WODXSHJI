  async function checkPendingCartNotifications() {
    try {
      const allChats = Object.values(state.chats);
      
      for (const chat of allChats) {
        if (chat.pendingCartClearNotification && !chat.isGroup) {
          const notification = chat.pendingCartClearNotification;
          const itemCount = notification.items.reduce((sum, item) => sum + item.quantity, 0);
          
          // 构建物品列表
          const itemsList = notification.items.map(item => 
            `${item.name} x${item.quantity} (¥${(item.price * item.quantity).toFixed(2)})`
          ).join('\n');
          
          await showCustomAlert(
            `${chat.name} 帮你清空了购物车！`,
            `${chat.name} 已经用自己的钱帮你购买了购物车中的所有商品！\n\n共 ${itemCount} 件商品，总价 ¥${notification.totalCost.toFixed(2)}\n\n${itemsList}\n\n所有物品都在路上啦~`
          );
          
          // 清除通知标记
          delete chat.pendingCartClearNotification;
          await db.chats.put(chat);
          
          // 只显示第一个通知，避免一次性弹出太多
          break;
        }
      }
    } catch (error) {
      console.error("检查待处理通知失败:", error);
    }
  }

  // 检查角色是否可以帮助用户清空购物车
  async function checkAndClearShoppingCart(chatId) {
    try {
      const chat = state.chats[chatId];
      
      // 检查是否启用了自动清空购物车功能
      if (!chat || !chat.settings.enableAutoCartClear) {
        return;
      }
      
      // 检查购物车是否为空
      if (!shoppingCart || shoppingCart.length === 0) {
        return;
      }
      
      // 检查是否已经有待处理的通知（避免重复通知）
      if (chat.pendingCartClearNotification) {
        return;
      }
      
      // 获取角色的钱包余额
      const taobaoHistory = chat.simulatedTaobaoHistory || {};
      const characterBalance = taobaoHistory.totalBalance || 0;
      
      // 计算购物车总价
      const productIds = shoppingCart.map(item => item.productId);
      const products = await db.products.bulkGet(productIds);
      const productMap = new Map(products.filter(p => p).map(p => [p.id, p]));
      
      let totalCost = 0;
      shoppingCart.forEach(cartItem => {
        const product = productMap.get(cartItem.productId);
        if (product) {
          const price = cartItem.variation ? cartItem.variation.price : product.price;
          totalCost += price * cartItem.quantity;
        }
      });
      
      // 检查余额是否足够
      if (characterBalance < totalCost) {
        return;
      }
      
      // 随机决定是否执行（避免每次都触发）
      if (Math.random() > 0.3) {
        return;
      }
      
      console.log(`角色 "${chat.name}" 准备帮助清空购物车，总价: ¥${totalCost.toFixed(2)}, 余额: ¥${characterBalance.toFixed(2)}`);
      
      // 扣除角色余额
      if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
      if (!chat.simulatedTaobaoHistory.purchases) chat.simulatedTaobaoHistory.purchases = [];
      
      chat.simulatedTaobaoHistory.totalBalance -= totalCost;
      
      // 记录购买记录
      const purchaseItems = [];
      shoppingCart.forEach(cartItem => {
        const product = productMap.get(cartItem.productId);
        if (product) {
          const price = cartItem.variation ? cartItem.variation.price : product.price;
          const itemName = cartItem.variation ? `${product.name} - ${cartItem.variation.name}` : product.name;
          
          chat.simulatedTaobaoHistory.purchases.unshift({
            itemName: itemName,
            price: price * cartItem.quantity,
            quantity: cartItem.quantity,
            status: '已发货',
            reason: '帮你清空购物车',
            image_prompt: `${itemName}, product photography`,
            timestamp: Date.now()
          });
          
          purchaseItems.push({
            name: itemName,
            quantity: cartItem.quantity,
            price: price
          });
        }
      });
      
      // 保存角色数据
      await db.chats.put(chat);
      
      // 清空购物车
      const clearedItems = [...shoppingCart];
      shoppingCart = [];
      updateCartCount();
      saveShoppingCart(); // 保存购物车
      
      // 如果用户正在查看购物车页面，刷新页面
      const cartScreen = document.getElementById('cart-screen');
      if (cartScreen && cartScreen.classList.contains('active')) {
        renderCartItems();
      }
      
      // 标记有待处理的通知
      chat.pendingCartClearNotification = {
        items: purchaseItems,
        totalCost: totalCost,
        timestamp: Date.now()
      };
      await db.chats.put(chat);
      
      console.log(`✅ 角色 "${chat.name}" 已清空购物车，总价: ¥${totalCost.toFixed(2)}`);
      
    } catch (error) {
      console.error("检查和清空购物车失败:", error);
    }
  }

  // ========== 全局暴露 ==========
  window.openShoppingScreen = openShoppingScreen;
  window.openCartScreen = openCartScreen;
  window.openProductCategoryManager = openProductCategoryManager;
  window.openShoppingSettingsModal = openShoppingSettingsModal;
  window.renderShoppingProducts = renderShoppingProducts;
  window.renderCartItems = renderCartItems;
  window.saveProduct = saveProduct;
  window.addNewProductCategory = addNewProductCategory;
  window.deleteProductCategory = deleteProductCategory;
  window.saveShoppingCart = saveShoppingCart;
  window.saveShoppingSettings = saveShoppingSettings;
  window.switchShoppingCategory = switchShoppingCategory;
  window.handleCheckout = handleCheckout;
  window.openProductEditor = openProductEditor;
  window.addToCart = addToCart;
  window.updateCartItemQuantity = updateCartItemQuantity;
  window.updateCartCount = updateCartCount;
  window.updateCartTotal = updateCartTotal;
  window.loadShoppingCart = loadShoppingCart;
  window.handleGenerateShoppingItems = handleGenerateShoppingItems;

  // ========== 从 script.js 迁移：openVariationSelector, handlePaymentButtonClick ==========
  async function openVariationSelector(productId) {
    const product = await db.shoppingProducts.get(productId);
    if (!product || !product.variations || product.variations.length === 0) return;
    const modal = document.getElementById('variation-selection-modal');
    document.getElementById('variation-product-image').src = product.imageUrl;
    document.getElementById('variation-product-name').textContent = product.name;
    const optionsContainer = document.getElementById('variation-options-container');
    optionsContainer.innerHTML = '';
    product.variations.forEach((variation, index) => {
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'variation-select'; radio.id = `var-${productId}-${index}`; radio.value = index; radio.style.display = 'none';
      if (index === 0) radio.checked = true;
      const label = document.createElement('label');
      label.htmlFor = `var-${productId}-${index}`;
      label.textContent = variation.name;
      label.style.cssText = 'padding: 6px 12px; border: 1px solid #ccc; border-radius: 15px; cursor: pointer; transition: all 0.2s;';
      optionsContainer.appendChild(radio);
      optionsContainer.appendChild(label);
    });
    const updateSelectionUI = () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      optionsContainer.querySelectorAll('label').forEach(lbl => { lbl.style.borderColor = '#ccc'; lbl.style.color = '#333'; lbl.style.backgroundColor = 'white'; });
      if (selectedRadio) {
        const selectedLabel = optionsContainer.querySelector(`label[for="${selectedRadio.id}"]`);
        selectedLabel.style.borderColor = 'var(--accent-color)'; selectedLabel.style.color = 'var(--accent-color)'; selectedLabel.style.backgroundColor = '#e7f3ff';
        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        document.getElementById('variation-selected-price').textContent = `¥${selectedVariation.price.toFixed(2)}`;
        if (selectedVariation.imageUrl) document.getElementById('variation-product-image').src = selectedVariation.imageUrl;
        else document.getElementById('variation-product-image').src = product.imageUrl;
      }
    };
    optionsContainer.addEventListener('change', updateSelectionUI);
    updateSelectionUI();
    document.getElementById('variation-quantity-display').textContent = '1';
    const confirmBtn = document.getElementById('confirm-variation-selection-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', async () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      const quantity = parseInt(document.getElementById('variation-quantity-display').textContent);
      if (selectedRadio) {
        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        await addToCart(productId, quantity, selectedVariation);
        modal.classList.remove('visible');
        await showCustomAlert('成功', '已成功加入购物车！');
      }
    });
    modal.classList.add('visible');
  }

  async function handlePaymentButtonClick() {
    const amountInput = document.getElementById('transfer-amount-input');
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) { await showCustomAlert('错误', '请输入有效的转账金额'); return; }
    if (typeof processPayment === 'function') await processPayment(amount);
    else await showCustomAlert('提示', '支付功能暂未实现');
  }

  window.openVariationSelector = openVariationSelector;
  window.handlePaymentButtonClick = handlePaymentButtonClick;
