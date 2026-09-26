// ========== 购物中心模块 ==========
// 来源：script.js 第 2846~2877 行（购物车变量与持久化）
//        + 第 20932~21040 行（checkAndClearShoppingCart）
//        + 第 34505~35224 行（商品展示、购物车、结算、送礼、商品编辑）
//        + 第 53978~54415 行（分类管理、款式、AI生成商品、购物设置）

// 闭包变量，挂载到 window 以便其他模块访问
let shoppingCart = [];
window.shoppingCart = shoppingCart;
let editingProductId = null;
let activeProductId = null;
let selectedProducts = new Set();
let isProductManagementMode = false;
let activeShoppingCategoryId = 'all';

// ========== 购物车持久化功能 ==========
// 保存购物车到localStorage
function saveShoppingCart() {
  try {
    localStorage.setItem('shoppingCart', JSON.stringify(shoppingCart));
    console.log('购物车已保存', shoppingCart.length, '件商品');
  } catch (error) {
    console.error('保存购物车失败:', error);
  }
}

// 从localStorage加载购物车
function loadShoppingCart() {
  try {
    const saved = localStorage.getItem('shoppingCart');
    if (saved) {
      shoppingCart = JSON.parse(saved);
      window.shoppingCart = shoppingCart;
      console.log('购物车已恢复', shoppingCart.length, '件商品');
      updateCartCount();
    }
  } catch (error) {
    console.error('加载购物车失败:', error);
    shoppingCart = [];
    window.shoppingCart = shoppingCart;
  }
}
// ========== 购物车持久化功能结束 ==========

  // renderShoppingProducts 第一个版本已删除（管理按钮无条件渲染的旧版）
  // 保留下方的改进版（管理按钮仅在管理模式下渲染）

  function switchShoppingCategory(categoryId) {
    activeShoppingCategoryId = categoryId;
    renderShoppingProducts();
    updateDeleteCategoryButtonVisibility();
  }

  function updateDeleteCategoryButtonVisibility() {
    const deleteBtn = document.getElementById('delete-current-category-btn');
    if (!deleteBtn) return;




    const isVisible = isProductManagementMode && activeShoppingCategoryId !== 'all';
    deleteBtn.style.display = isVisible ? 'flex' : 'none';
  }


  async function handleDeleteCurrentCategory() {
    if (activeShoppingCategoryId === 'all') return;

    const categoryId = activeShoppingCategoryId;
    const category = await db.shoppingCategories.get(categoryId);
    if (!category) {
      alert("错误：找不到要删除的分类。");
      return;
    }

    const confirmMessage = `确定要永久删除分类 "${category.name}" 吗？\n\n此操作【不会】删除分类下的商品，它们将被移至"未分类"。`;
    const confirmed = await showCustomConfirm('确认删除分类', confirmMessage, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    });

    if (confirmed) {

      await deleteProductCategory(categoryId);


      activeShoppingCategoryId = 'all';
      await renderShoppingProducts();


      updateDeleteCategoryButtonVisibility();

      await showCustomAlert("成功", `分类 "${category.name}" 已被删除。`);
    }
  }



  async function openShoppingScreen() {
    activeShoppingCategoryId = 'all';
    await renderShoppingProducts();
    showScreen('shopping-screen');
    updateDeleteCategoryButtonVisibility();
  }


  async function renderShoppingProducts() {
    const gridEl = document.getElementById('product-grid');
    const tabsContainer = document.getElementById('product-category-tabs');
    const shoppingScreen = document.getElementById('shopping-screen');
    gridEl.innerHTML = '';
    tabsContainer.innerHTML = '';


    const [allProducts, allCategories] = await Promise.all([
      db.shoppingProducts.toArray(),
      db.shoppingCategories.orderBy('name').toArray()
    ]);

    shoppingScreen.classList.toggle('management-mode', isProductManagementMode);


    const allTab = document.createElement('button');
    allTab.className = 'product-category-tab';
    allTab.textContent = '全部';
    allTab.dataset.categoryId = 'all';
    if (activeShoppingCategoryId === 'all') allTab.classList.add('active');
    tabsContainer.appendChild(allTab);

    allCategories.forEach(cat => {
      const tab = document.createElement('button');
      tab.className = 'product-category-tab';
      tab.textContent = cat.name;
      tab.dataset.categoryId = cat.id;
      if (activeShoppingCategoryId === cat.id) tab.classList.add('active');
      tabsContainer.appendChild(tab);
    });


    let productsToShow;
    if (activeShoppingCategoryId === 'all') {
      productsToShow = allProducts;
    } else {
      productsToShow = allProducts.filter(p => p.categoryId === activeShoppingCategoryId);
    }


    if (productsToShow.length === 0) {
      const message = activeShoppingCategoryId === 'all' ?
        '商店空空如也，点击"管理"添加商品吧！' :
        '这个分类下还没有商品哦~';
      gridEl.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">${message}</p>`;
      return;
    }

    productsToShow.forEach(product => {
      const item = document.createElement('div');
      item.className = 'product-item';
      item.dataset.id = product.id;

      const managementControls = isProductManagementMode ? `
            <div class="product-management-overlay">
                <button class="edit-product-btn">编辑</button>
                <button class="delete-product-btn">删除</button>
            </div>
        ` : '';

      item.innerHTML = `
            ${managementControls}
            <img src="${product.imageUrl}" class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-footer">
                    <div class="product-price">${product.price.toFixed(2)}</div>
                    <button class="add-to-cart-btn">加入购物车</button>
                </div>
            </div>
        `;
      gridEl.appendChild(item);
    });
  }


  async function addToCart(productId, quantity = 1, variation = null) {

    const existingItem = variation ?
      shoppingCart.find(item => item.productId === productId && item.variation?.name === variation.name) :
      shoppingCart.find(item => item.productId === productId && !item.variation);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      const product = await db.shoppingProducts.get(productId);
      if (product) {
        shoppingCart.push({
          productId: product.id,
          quantity: quantity,
          variation: variation
        });
      }
    }
    updateCartCount();
    saveShoppingCart(); // 保存购物车
  }


  function updateCartItemQuantity(productId, change) {
    const itemIndex = shoppingCart.findIndex(item => item.productId === productId);
    if (itemIndex > -1) {
      shoppingCart[itemIndex].quantity += change;
      if (shoppingCart[itemIndex].quantity <= 0) {
        shoppingCart.splice(itemIndex, 1);
      }
      updateCartCount();
      renderCartItems();
      saveShoppingCart(); // 保存购物车
    }
  }


  function updateCartCount() {
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = totalItems;
    document.getElementById('cart-title').textContent = `购物车(${totalItems})`;
    document.getElementById('checkout-btn').textContent = `结算(${totalItems})`;
  }


  function openCartScreen() {
    renderCartItems();
    showScreen('cart-screen');
  }



  async function renderCartItems() {
    const listEl = document.getElementById('cart-items-list');
    listEl.innerHTML = '';
    let total = 0;

    if (shoppingCart.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 50px;">购物车是空的哦~</p>';
    } else {
      const productIds = shoppingCart.map(item => item.productId);
      const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      shoppingCart.forEach(item => {
        const product = productMap.get(item.productId);
        if (product) {
          const itemEl = document.createElement('div');
          itemEl.className = 'cart-item';


          const variationHtml = item.variation ?
            `<div class="cart-item-variation" style="font-size: 12px; color: #8a8a8a; margin-top: 4px;">款式: ${item.variation.name}</div>` :
            '';

          itemEl.innerHTML = `
                            <input type="checkbox" class="cart-item-checkbox" data-id="${product.id}" checked>
                            <img src="${item.variation?.imageUrl || product.imageUrl}" class="cart-item-image">
                            <div class="cart-item-info">
                                <div class="cart-item-name">${product.name}</div>
                                ${variationHtml}
                                <div class="cart-item-footer">
                                    <div class="cart-item-price">¥${(item.variation?.price || product.price).toFixed(2)}</div>
                                    <div class="quantity-control">
                                        <button class="quantity-btn decrease-qty-btn" data-id="${product.id}">-</button>
                                        <span class="quantity-display">${item.quantity}</span>
                                        <button class="quantity-btn increase-qty-btn" data-id="${product.id}">+</button>
                                    </div>
                                </div>
                            </div>
                        `;
          listEl.appendChild(itemEl);
        }
      });
    }
    updateCartTotal();
  }



  async function updateCartTotal() {
    let total = 0;
    const selectedCheckboxes = document.querySelectorAll('.cart-item-checkbox:checked');
    const selectedProductIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.id));

    if (selectedProductIds.length > 0) {
      const products = await db.shoppingProducts.where('id').anyOf(selectedProductIds).toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      shoppingCart.forEach(cartItem => {
        if (selectedProductIds.includes(cartItem.productId)) {
          const product = productMap.get(cartItem.productId);
          if (product) {

            const price = cartItem.variation ? cartItem.variation.price : product.price;
            total += price * cartItem.quantity;
          }
        }
      });
    }
    document.getElementById('cart-total').textContent = `合计: ¥${total.toFixed(2)}`;
  }


  async function openGiftRecipientPicker() {
    const chat = state.chats[state.activeChatId];
    if (!chat || !chat.isGroup) return;

    const modal = document.getElementById('gift-recipient-modal');
    const listEl = document.getElementById('gift-recipient-list');
    listEl.innerHTML = '';


    const myNickname = chat.settings.myNickname || '我';
    const members = chat.members.filter(m => m.groupNickname !== myNickname);

    members.forEach(member => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';

      item.dataset.recipientName = member.originalName;

      item.innerHTML = `
                    <div class="checkbox"></div>
                    <img src="${member.avatar || defaultGroupMemberAvatar}" class="avatar">
                    <span class="name">${member.groupNickname}</span>
                `;
      listEl.appendChild(item);
    });


    document.getElementById('select-all-recipients').checked = false;
    modal.classList.add('visible');
  }


  // --- 修复版V2：购物结算 (修复ID解析bug，确保扣款和记账) ---
