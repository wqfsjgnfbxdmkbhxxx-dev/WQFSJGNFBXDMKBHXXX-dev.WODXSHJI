  async function openProductEditor(productId = null) {
    editingProductId = productId;
    const modal = document.getElementById('product-editor-modal');
    const title = document.getElementById('product-editor-title');
    const nameInput = document.getElementById('product-name-input');
    const priceInput = document.getElementById('product-price-input');
    const descInput = document.getElementById('product-description-input');
    const imagePreview = document.getElementById('product-image-preview');
    const categorySelect = document.getElementById('product-category-select');
    const variationsContainer = document.getElementById('product-variations-container');


    variationsContainer.innerHTML = '';


    categorySelect.innerHTML = '<option value="">-- 未分类 --</option>';
    const categories = await db.shoppingCategories.toArray();
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });

    if (productId) {
      title.textContent = '编辑商品';
      const product = await db.shoppingProducts.get(productId);
      nameInput.value = product.name;
      priceInput.value = product.price;
      descInput.value = product.description || '';
      imagePreview.src = product.imageUrl;
      categorySelect.value = product.categoryId || '';


      if (product.variations && product.variations.length > 0) {
        product.variations.forEach(v => addProductVariationInput(v));
      }

    } else {
      title.textContent = '添加商品';
      nameInput.value = '';
      priceInput.value = '';
      descInput.value = '';
      imagePreview.src = 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756206115802_qdqqd_0c99bh.jpeg';
      categorySelect.value = '';
    }
    modal.classList.add('visible');
  }
  async function saveProduct() {
    const name = document.getElementById('product-name-input').value.trim();
    const price = parseFloat(document.getElementById('product-price-input').value);
    const description = document.getElementById('product-description-input').value.trim();
    const imageUrl = document.getElementById('product-image-preview').src;
    const categoryId = parseInt(document.getElementById('product-category-select').value) || null;

    if (!name) {
      alert('商品名称不能为空！');
      return;
    }
    if (isNaN(price) || price < 0) {
      alert('请输入有效的默认价格！');
      return;
    }


    const variations = [];
    document.querySelectorAll('.variation-block').forEach(block => {
      const varName = block.querySelector('.variation-name-input').value.trim();
      const varPrice = parseFloat(block.querySelector('.variation-price-input').value);
      const varImageUrl = block.querySelector('.variation-image-preview').src;

      if (varName && !isNaN(varPrice) && varPrice >= 0) {
        variations.push({
          name: varName,
          price: varPrice,
          imageUrl: varImageUrl.includes('placeholder.png') ? null : varImageUrl
        });
      }
    });

    const productData = {
      name,
      price,
      description,
      imageUrl,
      categoryId,
      variations
    };

    if (editingProductId) {
      await db.shoppingProducts.update(editingProductId, productData);
    } else {
      await db.shoppingProducts.add(productData);
    }
    document.getElementById('product-editor-modal').classList.remove('visible');
    await renderShoppingProducts();
  }


  async function openProductCategoryManager() {
    await renderProductCategoriesInManager();
    document.getElementById('product-category-manager-modal').classList.add('visible');
  }


  async function renderProductCategoriesInManager() {
    const listEl = document.getElementById('existing-product-categories-list');
    const categories = await db.shoppingCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
      return;
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
            <span class="group-name">${cat.name}</span>
            <span class="delete-group-btn" data-id="${cat.id}">×</span>
        `;
      listEl.appendChild(item);
    });
  }


  async function addNewProductCategory() {
    const input = document.getElementById('new-product-category-name-input');
    const name = input.value.trim();
    if (!name) return alert('分类名不能为空！');
    const existing = await db.shoppingCategories.where('name').equals(name).first();
    if (existing) return alert(`分类 "${name}" 已经存在了！`);

    await db.shoppingCategories.add({
      name
    });
    input.value = '';
    await renderProductCategoriesInManager();
  }


  async function deleteProductCategory(categoryId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分类后，该分类下的所有商品将变为"未分类"。确定吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.shoppingCategories.delete(categoryId);
      await db.shoppingProducts.where('categoryId').equals(categoryId).modify({
        categoryId: null
      });
      await renderProductCategoriesInManager();
    }
  }


  function addProductVariationInput(variation = {}) {
    const container = document.getElementById('product-variations-container');
    const block = document.createElement('div');
    block.className = 'message-editor-block variation-block'; // 复用样式
    block.innerHTML = `
        <button class="delete-block-btn" title="删除此款式">×</button>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
                <label style="font-size: 0.8em;">款式名称</label>
                <input type="text" class="variation-name-input" placeholder="例如: 红色" value="${variation.name || ''}">
            </div>
            <div class="form-group">
                <label style="font-size: 0.8em;">价格 (元)</label>
                <input type="number" class="variation-price-input" min="0" step="0.01" value="${variation.price || ''}">
            </div>
        </div>
        <div class="form-group">
            <label style="font-size: 0.8em;">款式图片 (可选)</label>
            <div class="avatar-upload">
                <img class="variation-image-preview" src="${variation.imageUrl || 'https://i.postimg.cc/PqYp5T5M/image.png'}">
                <button type="button" class="form-button-secondary upload-variation-image-btn" style="margin: 0; padding: 8px 12px;">上传</button>
                <input type="file" class="variation-image-input" accept="image/*" hidden>
            </div>
        </div>
    `;

    block.querySelector('.delete-block-btn').addEventListener('click', () => block.remove());
    block.querySelector('.upload-variation-image-btn').addEventListener('click', () => {
      block.querySelector('.variation-image-input').click();
    });
    block.querySelector('.variation-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          block.querySelector('.variation-image-preview').src = re.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    container.appendChild(block);
    return block;
  }

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
      radio.type = 'radio';
      radio.name = 'variation-select';
      radio.id = `var-${productId}-${index}`;
      radio.value = index;
      radio.style.display = 'none';
      if (index === 0) radio.checked = true;

      const label = document.createElement('label');
      label.htmlFor = `var-${productId}-${index}`;
      label.textContent = variation.name;
      label.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #ccc;
            border-radius: 15px;
            cursor: pointer;
            transition: all 0.2s;
        `;

      optionsContainer.appendChild(radio);
      optionsContainer.appendChild(label);
    });

    const updateSelectionUI = () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      optionsContainer.querySelectorAll('label').forEach(lbl => {
        lbl.style.borderColor = '#ccc';
        lbl.style.color = '#333';
        lbl.style.backgroundColor = 'white';
      });
      if (selectedRadio) {
        const selectedLabel = optionsContainer.querySelector(`label[for="${selectedRadio.id}"]`);
        selectedLabel.style.borderColor = 'var(--accent-color)';
        selectedLabel.style.color = 'var(--accent-color)';
        selectedLabel.style.backgroundColor = '#e7f3ff';

        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        document.getElementById('variation-selected-price').textContent = `¥${selectedVariation.price.toFixed(2)}`;
        if (selectedVariation.imageUrl) {
          document.getElementById('variation-product-image').src = selectedVariation.imageUrl;
        } else {
          document.getElementById('variation-product-image').src = product.imageUrl;
        }
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


  function openShoppingSettingsModal() {
    const modal = document.getElementById('shopping-settings-modal');

    // 从全局设置中读取已保存的值，如果没有就使用默认值
    document.getElementById('shopping-category-count-input').value = state.globalSettings.shoppingCategoryCount || 3;
    document.getElementById('shopping-product-count-input').value = state.globalSettings.shoppingProductCount || 8;

    modal.classList.add('visible');
  }


  async function saveShoppingSettings() {
    const categoryInput = document.getElementById('shopping-category-count-input');
    const productInput = document.getElementById('shopping-product-count-input');

    const categoryCount = parseInt(categoryInput.value);
    const productCount = parseInt(productInput.value);


    if (isNaN(categoryCount) || isNaN(productCount) || categoryCount < 1 || productCount < 1) {
      alert("请输入有效的正整数！");
      return;
    }


    state.globalSettings.shoppingCategoryCount = categoryCount;
    state.globalSettings.shoppingProductCount = productCount;
    await db.globalSettings.put(state.globalSettings);


    document.getElementById('shopping-settings-modal').classList.remove('visible');
    await showCustomAlert('保存成功', '购物中心生成设置已更新！');
  }


