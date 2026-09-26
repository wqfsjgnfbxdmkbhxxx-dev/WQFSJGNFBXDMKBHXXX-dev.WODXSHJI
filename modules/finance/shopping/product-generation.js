  async function handleGenerateShoppingItems() {

    if (!state.activeChatId) {
      await showCustomAlert("操作失败", "请先进入一个聊天页面，再返回购物中心进行生成，以便AI了解要为哪个角色生成商品。");
      return;
    }
    const chat = state.chats[state.activeChatId];

    const confirmed = await showCustomConfirm(
      `为"${chat.name}"生成商品？`,
      '此操作将使用AI生成新的商品和分类，并【添加】到现有列表中。确定要继续吗？', {
      confirmText: '确认生成'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在根据"${chat.name}"的特点生成专属商品...`);


    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useSecondaryApi
        ?
        {
          proxyUrl: state.apiConfig.secondaryProxyUrl,
          apiKey: state.apiConfig.secondaryApiKey,
          model: state.apiConfig.secondaryModel
        } :
        state.apiConfig;

    if (!proxyUrl || !apiKey || !model) {
      await showCustomAlert("API未配置", "请先在API设置中配置好（主或副）API。");
      return;
    }

    const categoryCount = state.globalSettings.shoppingCategoryCount || 3;
    const productCount = state.globalSettings.shoppingProductCount || 8;

    const existingCategories = await db.shoppingCategories.toArray();
    let existingCategoriesContext = "";
    if (existingCategories.length > 0) {
      existingCategoriesContext = `
# 【分类复用铁律 (最高优先级！)】
在为新商品指定分类时，你【必须】首先检查下面的"已有分类列表"。
-   如果一个新商品可以被归入某个【已存在的分类】，你【必须】复用那个分类的名称，而不是创造一个相似的新分类！
-   只有当你确定商品【绝对】不属于任何一个已有分类时，你才能创造一个新的分类名称。
-   **已有分类列表**: [${existingCategories.map(c => `"${c.name}"`).join(', ')}]
`;
    }

    const userNickname = state.qzoneSettings.nickname || '我';
    const longTermMemoryContext = getMemoryContextForPrompt(chat) || '无';
    const recentHistoryContext = chat.history.slice(-10).map(msg =>
      `${msg.role === 'user' ? userNickname : chat.name}: ${String(msg.content).substring(0, 30)}...`
    ).join('\n');

    let worldBookContext = '';
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });

    if (allWorldBookIds.length > 0) {
      const linkedContents = allWorldBookIds.map(bookId => {
        const worldBook = state.worldBooks.find(wb => wb.id === bookId);
        if (!worldBook || !Array.isArray(worldBook.content)) return '';
        const enabledEntries = worldBook.content
          .filter(entry => entry.enabled !== false)
          .map(entry => `- ${entry.content}`)
          .join('\n');
        return enabledEntries ? `\n## 来自《${worldBook.name}》:\n${enabledEntries}` : '';
      }).filter(Boolean).join('');

      if (linkedContents) {
        worldBookContext = `\n# 世界观设定 (必须参考)\n${linkedContents}\n`;
      }
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟的、极具创造力的商品规划师。你的任务是为下面的角色"${chat.name}"量身打造一个专属的商品列表。

# 核心规则
1.  **【角色定制(最高优先级)】**: 你生成的所有商品和分类【必须】深度绑定角色的性格、记忆和最近的对话。它们应该是角色会真正感兴趣、购买或制作的东西。
2.  **创造性与合理性**: 商品和分类必须合理且多样化。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个【单一的JSON对象】。
    - 你的回复必须以 \`{\` 开始，并以 \`}\` 结束。
    - 【绝对禁止】在JSON对象前后添加任何多余的文字、解释或 markdown 标记。
    - 格式【必须】如下:
    \`\`\`json
    {
      "categories": [
        {
          "name": "分类名称1",
          "products": [
            {
              "name": "商品名称1",
              "price": 99.80,
              "description": "这是商品的详细描述，不少于50字...",
              "variations": [
                { "name": "款式1", "price": 108.80, "image_prompt": "款式1的图片【英文】关键词..." },
                { "name": "款式2", "price": 118.80, "image_prompt": "款式2的图片【英文】关键词..." }
              ],
              "image_prompt": "商品主图的【英文】关键词, 风格为 realistic product photo, high quality, on a clean white background"
            }
          ]
        }
      ]
    }
    \`\`\`
    - **categories**: 生成 ${categoryCount} 个分类。
    - **products**: 每个分类下生成 ${productCount} 个商品。
    - **variations**: 每个商品【必须】包含【2到4个】不同的款式。

# 角色与上下文 (你的灵感来源)
- **角色名称**: ${chat.name}
- **角色人设**: ${chat.settings.aiPersona}
- **长期记忆**: ${longTermMemoryContext}
- **世界书设定**: ${worldBookContext}
${existingCategoriesContext}
- **最近对话摘要**:
${recentHistoryContext}

现在，请根据以上【所有上下文信息】，开始为"${chat.name}"生成这组【与角色高度相关】的商品数据。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据以上设定，生成商品数据。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');

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
            ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
            ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
            ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
            ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error("AI返回的内容中未找到有效的JSON对象。");
      const generatedData = JSON.parse(jsonMatch[0]);

      if (!generatedData.categories || !Array.isArray(generatedData.categories)) {
        throw new Error("AI返回的JSON格式不正确，缺少 'categories' 数组。");
      }


      await db.transaction('rw', db.shoppingProducts, db.shoppingCategories, async () => {
        for (const category of generatedData.categories) {
          let categoryId;
          const existingCategory = await db.shoppingCategories.where('name').equalsIgnoreCase(category.name).first();
          if (existingCategory) {
            categoryId = existingCategory.id;
          } else {
            categoryId = await db.shoppingCategories.add({
              name: category.name
            });
          }
          const productsToAdd = category.products.map(product => {
            return {
              name: product.name,
              price: product.price || 0,
              description: product.description || '',
              imageUrl: getPollinationsImageUrl(product.image_prompt),
              variations: (product.variations || []).map(v => ({
                ...v,
                imageUrl: getPollinationsImageUrl(v.image_prompt)
              })),
              categoryId: categoryId
            };
          });
          if (productsToAdd.length > 0) {
            await db.shoppingProducts.bulkAdd(productsToAdd);
          }
        }
      });

      activeShoppingCategoryId = 'all';
      await renderShoppingProducts();
      await showCustomAlert('生成成功！', `为"${chat.name}"量身定制的商品已上架！`);

    } catch (error) {
      console.error("生成购物中心商品失败:", error);
      await showCustomAlert("生成失败", `无法生成商品，请检查(主/副)API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  // 检查是否有待处理的购物车清空通知（来源：script.js 第 20898~20931 行）
