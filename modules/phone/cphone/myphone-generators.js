  async function handleGenerateMyPhoneQQ() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    // 获取与该角色的对话历史，了解用户特征
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的性格、兴趣和社交圈，然后生成我的QQ聊天记录。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！请确保聊天记录的时间是在今天或最近的过去。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成3-5个我可能会聊天的联系人及其对话内容。这些对话应该反映出我的性格、兴趣和生活状态。

请返回JSON格式：
[
  {
    "name": "联系人名字",
    "avatar": "",
    "lastMessage": "最后一条消息预览",
    "messages": [
      {"role": "user", "content": "我发送的消息", "timestamp": "符合ISO 8601格式的近期时间"},
      {"role": "assistant", "content": "对方的回复", "timestamp": "符合ISO 8601格式的近期时间"}
    ]
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

      let reqBody = {
          model: model,
          messages: messagesForApi,
          temperature: 0.8
      };
      if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
      if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
      if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
      if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(reqBody)
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const conversations = JSON.parse(cleanedJson);

      chat.myPhoneSimulatedQQConversations = conversations;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone QQ失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAlbum() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活、兴趣和审美，然后生成我相册中的照片。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后描述我相册中的5-8张照片。这些照片应该反映出我的生活状态、兴趣爱好和审美偏好。

返回JSON格式：
[
  {
    "description": "照片的中文描述（从我的视角描述）",
    "image_prompt": "英文图像生成提示词"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const photos = JSON.parse(cleanedJson);

      chat.myPhoneAlbum = photos;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone相册失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneBrowserHistory() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的兴趣和关注点，然后生成我的浏览器历史记录。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条浏览器历史记录。这些记录应该反映出我的兴趣爱好、关注的话题和信息需求。

返回JSON格式：
[
  {
    "title": "网页标题",
    "url": "网址",
    "content": "网页内容摘要（100-200字）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const history = JSON.parse(cleanedJson);

      chat.myPhoneBrowserHistory = history;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone浏览记录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneTaobao() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活需求和消费习惯，然后生成我的淘宝购物记录。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！购买日期必须是今天或最近的过去。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条淘宝购物记录。这些记录应该反映出我的生活状态、需求和消费偏好。

返回JSON格式：
[
  {
    "name": "商品名称",
    "price": "价格（数字）",
    "date": "购买日期（例如：${new Date().toLocaleDateString('zh-CN')}）",
    "reason": "购买理由（简短描述为什么买这个商品）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const items = JSON.parse(cleanedJson);

      chat.myPhoneTaobaoHistory = items;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone淘宝记录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneMemos() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活状态和待办事项，然后生成我的备忘录。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！记录日期必须是今天或最近的过去。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的3-5条备忘录。这些备忘录应该反映出我的生活安排、待办事项和关注点。

返回JSON格式：
[
  {
    "title": "备忘录标题",
    "content": "备忘录内容",
    "date": "日期（例如：${new Date().toLocaleDateString('zh-CN')}）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const memos = JSON.parse(cleanedJson);

      chat.myPhoneMemos = memos;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone备忘录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneDiaries() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的内心世界和生活感受，然后生成我的日记。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！日记日期必须是今天或最近的过去。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的3-5篇日记。这些日记应该反映出我的情感状态、生活感悟和内心想法。

返回JSON格式：
[
  {
    "title": "日记标题",
    "content": "日记内容（100-200字，第一人称）",
    "date": "日期（例如：${new Date().toLocaleDateString('zh-CN')}）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const diaries = JSON.parse(cleanedJson);

      chat.myPhoneDiaries = diaries;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone日记失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAmap() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的活动范围和生活轨迹，然后生成我的足迹记录。

# 核心规则
1. **【时间铁律 (最高优先级)】**: 今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。绝对禁止生成任何未来的日期！访问时间必须是今天或最近的过去。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条足迹记录。这些记录应该反映出我的生活区域、活动习惯和去过的地方。

返回JSON格式：
[
  {
    "name": "地点名称",
    "address": "详细地址",
    "time": "访问时间（例如：${new Date().toLocaleDateString('zh-CN')} 14:30）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const locations = JSON.parse(cleanedJson);

      chat.myPhoneAmapHistory = locations;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone足迹失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAppUsage() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    // 生成模拟的使用记录，格式与手动添加一致
    const apps = [
      { name: 'QQ', category: '社交' },
      { name: '相册', category: '工具' },
      { name: '浏览器', category: '工具' },
      { name: '淘宝', category: '购物' },
      { name: '备忘录', category: '工具' },
      { name: '日记', category: '生活' },
      { name: '高德地图', category: '出行' },
      { name: '网易云音乐', category: '娱乐' },
      { name: 'B站', category: '娱乐' },
      { name: '微博', category: '社交' },
      { name: '抖音', category: '娱乐' },
      { name: '小红书', category: '生活' }
    ];
    const usageLog = [];

    for (let i = 0; i < 15; i++) {
      const app = apps[Math.floor(Math.random() * apps.length)];
      const date = Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000;
      usageLog.push({
        appName: app.name,
        category: app.category,
        usageTimeMinutes: Math.floor(Math.random() * 180) + 5, // 5-185分钟
        iconUrl: '', // 可以后续添加图标URL
        timestamp: date
      });
    }

    chat.myPhoneAppUsage = usageLog.sort((a, b) => b.timestamp - a.timestamp);
    await db.chats.put(chat);
  }

  async function handleGenerateMyPhoneMusic() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的音乐品味和情感状态，然后生成我的音乐歌单。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的音乐歌单（5-8首歌）。这些歌曲应该反映出我的音乐偏好、情感状态和审美品味。

返回JSON格式：
[
  {
    "title": "歌曲名",
    "artist": "歌手名"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

        let reqBody = {
            model: model,
            messages: messagesForApi,
            temperature: 0.8
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        const response = isGemini ?
          await fetch(geminiConfig.url, geminiConfig.data) :
          await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(reqBody)
          });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const playlist = JSON.parse(cleanedJson);

      chat.myPhoneMusicPlaylist = playlist;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone音乐失败:", error);
      throw error;
    }
  }

