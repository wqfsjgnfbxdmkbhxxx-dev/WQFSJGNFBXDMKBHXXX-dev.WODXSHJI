// 联机状态由服务器统一保存。客户端只保存缓存与各自的私有角色配置。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

function createOnlineService(wss) {
    const dataDir = process.env.ONLINE_DATA_DIR || path.join(os.homedir(), '.ephone-online');
    fs.mkdirSync(dataDir, { recursive: true });
    const dataFile = path.join(dataDir, 'state.json');
    let state = { accounts: {}, requests: [], friends: {}, groups: {}, direct: {}, hiddenDirect: {} };
    if (fs.existsSync(dataFile)) {
        try {
            state = { ...state, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
        } catch (error) {
            throw new Error(`无法读取联机数据 ${dataFile}: ${error.message}`);
        }
    }
    const sockets = new Map();
    const send = (ws, message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };
    const persist = () => {
        const temporary = `${dataFile}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(state));
        fs.renameSync(temporary, dataFile);
    };
    const hash = value => crypto.createHash('sha256').update(value).digest('hex');
    const safeText = (value, max = 2000) => String(value || '').trim().slice(0, max);
    const safeAvatar = value => {
        const avatar = String(value || '');
        return avatar.length <= 100000 &&
            /^(https:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(avatar) ? avatar : '';
    };
    const friendPair = (a, b) => [a, b].sort().join(':');
    const socketsFor = id => sockets.get(id) || new Set();
    const deliver = (id, message) => socketsFor(id).forEach(ws => send(ws, message));
    const deliverGroup = (group, message, excludedId) =>
        group.members.forEach(id => { if (id !== excludedId) deliver(id, message); });
    const publicUser = id => {
        const account = state.accounts[id];
        return account && { userId: id, nickname: account.nickname, avatar: account.avatar };
    };
    const groupFor = (id, userId) => {
        const group = state.groups[id];
        return group && group.members.includes(userId) ? group : null;
    };
    const appendSystem = (group, message) => {
        group.messages.push({ id: crypto.randomUUID(), seq: ++group.seq,
            groupId: group.id, system: true, message, timestamp: Date.now() });
    };
    const publicCharacter = (character, viewerId) =>
        character.ownerUserId === viewerId ? character : {
            characterId: character.characterId, ownerUserId: character.ownerUserId,
            ownerNickname: character.ownerNickname, originalName: character.originalName,
            avatar: character.avatar
        };
    const groupPublic = (group, viewerId) => ({
        id: group.id, name: group.name, creatorId: group.creatorId,
        members: group.members.map(publicUser).filter(Boolean),
        characters: Object.values(group.characters || {}).map(character =>
            publicCharacter(character, viewerId)),
        settings: group.settings || {},
        seq: group.seq || 0,
        messages: (group.messages || []).filter(message =>
            message.seq > (group.joinedSeq?.[viewerId] || 0))
    });
    const deliverGroupState = group => group.members.forEach(id =>
        deliver(id, { type: 'group_state', group: groupPublic(group, id) }));
    const snapshot = userId => ({
        type: 'sync_snapshot',
        friends: (state.friends[userId] || []).map(publicUser).filter(Boolean),
        requests: state.requests.filter(r => r.toUserId === userId),
        groups: Object.values(state.groups).filter(g => g.members.includes(userId))
            .map(group => groupPublic(group, userId)),
        direct: Object.fromEntries(
            Object.entries(state.direct).filter(([key]) => key.split(':').includes(userId))
                .map(([key, messages]) => [key, messages.filter(message =>
                    message.timestamp > (state.hiddenDirect[userId]?.[key] || 0))])
        )
    });
    const fail = (ws, requestId, error) => send(ws, { type: 'operation_error', requestId, error });
    const acknowledge = (ws, requestId, extra = {}) =>
        send(ws, { type: 'operation_ack', requestId, ...extra });

    wss.on('connection', ws => {
        let userId = null;
        let requestWindowStart = Date.now();
        let requestCount = 0;
        ws.on('message', raw => {
            let data;
            try { data = JSON.parse(raw); } catch (_) { return fail(ws, null, '消息格式错误'); }
            const type = data?.type;
            const requestId = data?.requestId || null;
            if (Date.now() - requestWindowStart > 10000) {
                requestWindowStart = Date.now(); requestCount = 0;
            }
            if (type !== 'heartbeat' && ++requestCount > 60)
                return fail(ws, requestId, '操作过于频繁，请稍后再试');
            try {
                if (type === 'register') {
                    if (userId) {
                        const account = state.accounts[userId];
                        account.nickname = safeText(data.nickname, 20) || account.nickname;
                        account.avatar = safeAvatar(data.avatar) || account.avatar;
                        Object.values(state.groups).forEach(group => {
                            Object.values(group.characters || {}).forEach(character => {
                                if (character.ownerUserId === userId) character.ownerNickname = account.nickname;
                            });
                        });
                        persist();
                        send(ws, { type: 'register_success', userId });
                        (state.friends[userId] || []).forEach(id =>
                            deliver(id, { type: 'profile_updated', user: publicUser(userId) }));
                        Object.values(state.groups).filter(group => group.members.includes(userId))
                            .forEach(deliverGroupState);
                        return;
                    }
                    let accountId = safeText(data.userId, 40);
                    let account = accountId && state.accounts[accountId];
                    let credential = null;
                    if (sockets.size >= 200 && !sockets.has(accountId))
                        return send(ws, { type: 'register_error', error: '服务器已满' });
                    if (account) {
                        if (!data.credential || hash(data.credential) !== account.credentialHash) {
                            return send(ws, { type: 'register_error', error: '身份凭据无效；旧 ID 无法用于新联机身份' });
                        }
                    } else {
                        // 旧版自填 ID 不作为身份依据。新 ID 只能由服务器生成。
                        if (accountId || data.credential) {
                            return send(ws, { type: 'register_error', error: '请创建新的联机身份' });
                        }
                        do { accountId = `u_${crypto.randomBytes(8).toString('hex')}`; }
                        while (state.accounts[accountId]);
                        credential = crypto.randomBytes(32).toString('hex');
                        account = {
                            nickname: safeText(data.nickname, 20) || '联机用户',
                            avatar: safeAvatar(data.avatar),
                            credentialHash: hash(credential),
                            createdAt: Date.now()
                        };
                        state.accounts[accountId] = account;
                        state.friends[accountId] = [];
                        persist();
                    }
                    userId = accountId;
                    if (!sockets.has(userId)) sockets.set(userId, new Set());
                    sockets.get(userId).add(ws);
                    send(ws, { type: 'register_success', userId, credential, user: publicUser(userId) });
                    send(ws, { type: 'ai_host', active: sockets.get(userId).values().next().value === ws });
                    send(ws, snapshot(userId));
                    (state.friends[userId] || []).forEach(id => deliver(id, { type: 'presence', userId, online: true }));
                    return;
                }
                if (!userId) return fail(ws, requestId, '请先连接联机身份');
                if (type === 'heartbeat') return send(ws, { type: 'heartbeat_ack' });
                if (type === 'sync') return send(ws, snapshot(userId));
                if (type === 'search_user') {
                    const found = publicUser(safeText(data.searchId, 40));
                    return send(ws, { type: 'search_result', found: !!found, user: found || undefined });
                }
                if (type === 'friend_request') {
                    const targetId = safeText(data.toUserId, 40);
                    if (!state.accounts[targetId] || targetId === userId) return fail(ws, requestId, '好友 ID 无效');
                    if ((state.friends[userId] || []).includes(targetId)) return fail(ws, requestId, '已经是好友');
                    let request = state.requests.find(r => r.fromUserId === userId && r.toUserId === targetId);
                    if (!request) {
                        request = { id: crypto.randomUUID(), fromUserId: userId, toUserId: targetId,
                            fromNickname: state.accounts[userId].nickname, fromAvatar: state.accounts[userId].avatar,
                            timestamp: Date.now() };
                        state.requests.push(request);
                        persist();
                    }
                    deliver(targetId, { type: 'friend_request', ...request });
                    return acknowledge(ws, requestId);
                }
                if (type === 'accept_friend_request' || type === 'reject_friend_request') {
                    const index = state.requests.findIndex(r => r.fromUserId === data.fromUserId && r.toUserId === userId);
                    if (index < 0) return fail(ws, requestId, '好友申请不存在');
                    const request = state.requests.splice(index, 1)[0];
                    if (type === 'accept_friend_request') {
                        if (!state.friends[userId]) state.friends[userId] = [];
                        if (!state.friends[request.fromUserId]) state.friends[request.fromUserId] = [];
                        if (!state.friends[userId].includes(request.fromUserId)) state.friends[userId].push(request.fromUserId);
                        if (!state.friends[request.fromUserId].includes(userId)) state.friends[request.fromUserId].push(userId);
                        persist();
                        deliver(request.fromUserId, { type: 'friend_request_accepted', ...publicUser(userId),
                            fromUserId: userId, fromNickname: state.accounts[userId].nickname,
                            fromAvatar: state.accounts[userId].avatar });
                        deliver(userId, { type: 'friend_request_accepted_self', friend: publicUser(request.fromUserId) });
                    } else {
                        persist();
                        deliver(request.fromUserId, { type: 'friend_request_rejected', fromUserId: userId });
                    }
                    return acknowledge(ws, requestId);
                }
                if (type === 'delete_friend') {
                    const targetId = safeText(data.toUserId, 40);
                    state.friends[userId] = (state.friends[userId] || []).filter(id => id !== targetId);
                    state.friends[targetId] = (state.friends[targetId] || []).filter(id => id !== userId);
                    if (!state.hiddenDirect[userId]) state.hiddenDirect[userId] = {};
                    state.hiddenDirect[userId][friendPair(userId, targetId)] = Date.now();
                    persist();
                    deliver(targetId, { type: 'friend_removed', userId });
                    socketsFor(userId).forEach(client => {
                        if (client !== ws) send(client, { type: 'friend_removed_self', userId: targetId });
                    });
                    return acknowledge(ws, requestId);
                }
                if (type === 'send_message') {
                    const targetId = safeText(data.toUserId, 40);
                    if (!state.accounts[targetId]) return fail(ws, requestId, '收件人不存在');
                    if (!(state.friends[userId] || []).includes(targetId))
                        return fail(ws, requestId, '对方不是好友');
                    const content = safeText(data.message, 10000);
                    if (!content) return fail(ws, requestId, '消息为空');
                    const key = friendPair(userId, targetId);
                    const messages = state.direct[key] || (state.direct[key] = []);
                    let message = messages.find(m => m.id === requestId);
                    if (!message) {
                        message = { id: requestId || crypto.randomUUID(), fromUserId: userId, toUserId: targetId,
                            message: content, timestamp: Date.now() };
                        messages.push(message); persist();
                        deliver(targetId, { type: 'receive_message', ...message });
                        socketsFor(userId).forEach(client => {
                            if (client !== ws) send(client, { type: 'receive_message', ...message });
                        });
                    }
                    return acknowledge(ws, requestId, { message });
                }
                if (type === 'create_group') {
                    const invited = [...new Set((data.members || []).map(m => m.userId).filter(id =>
                        id && id !== userId && (state.friends[userId] || []).includes(id)))];
                    if (!invited.length) return fail(ws, requestId, '请至少选择一位好友');
                    const group = { id: crypto.randomUUID(), name: safeText(data.groupName, 60) || '群聊',
                        creatorId: userId, members: [userId, ...invited], characters: {},
                        joinedSeq: Object.fromEntries([userId, ...invited].map(id => [id, 0])),
                        settings: { aiEnabled: true, aiContextSize: 20, autoReply: false,
                            maxCharactersPerOwner: 6, announcement: '', allowMemberInvites: false },
                        seq: 0, messages: [], createdAt: Date.now() };
                    appendSystem(group, `群聊「${group.name}」已创建`);
                    state.groups[group.id] = group; persist();
                    group.members.forEach(id => {
                        if (id !== userId) deliver(id,
                            { type: 'receive_group_created', group: groupPublic(group, id) });
                    });
                    return acknowledge(ws, requestId, { group: groupPublic(group, userId) });
                }
                if (type === 'leave_group') {
                    const group = groupFor(data.groupId, userId);
                    if (!group) return fail(ws, requestId, '不在群聊中');
                    group.members = group.members.filter(id => id !== userId);
                    if (group.joinedSeq) delete group.joinedSeq[userId];
                    Object.keys(group.characters).forEach(id => {
                        if (group.characters[id].ownerUserId === userId) delete group.characters[id];
                    });
                    if (group.creatorId === userId && group.members.length) group.creatorId = group.members[0];
                    appendSystem(group, `${state.accounts[userId].nickname} 退出了群聊`);
                    if (!group.members.length) delete state.groups[group.id];
                    persist();
                    deliverGroupState(group);
                    return acknowledge(ws, requestId);
                }
                if (type === 'invite_group_member') {
                    const group = groupFor(data.groupId, userId);
                    if (!group) return fail(ws, requestId, '不在群聊中');
                    if (group.creatorId !== userId && !group.settings.allowMemberInvites)
                        return fail(ws, requestId, '没有邀请权限');
                    const targetId = safeText(data.toUserId, 40);
                    if (!(state.friends[userId] || []).includes(targetId) || group.members.includes(targetId))
                        return fail(ws, requestId, '好友已在群内或不可邀请');
                    group.members.push(targetId);
                    if (!group.joinedSeq) group.joinedSeq = {};
                    group.joinedSeq[targetId] = group.seq || 0;
                    appendSystem(group, `${state.accounts[targetId].nickname} 加入了群聊`);
                    persist();
                    deliver(targetId, { type: 'receive_group_created', group: groupPublic(group, targetId) });
                    deliverGroupState(group);
                    return acknowledge(ws, requestId);
                }
                if (type === 'remove_group_member') {
                    const group = groupFor(data.groupId, userId);
                    if (!group || group.creatorId !== userId) return fail(ws, requestId, '只有群主可以移除成员');
                    const targetId = safeText(data.toUserId, 40);
                    if (targetId === userId || !group.members.includes(targetId))
                        return fail(ws, requestId, '成员无效');
                    group.members = group.members.filter(id => id !== targetId);
                    if (group.joinedSeq) delete group.joinedSeq[targetId];
                    Object.keys(group.characters).forEach(id => {
                        if (group.characters[id].ownerUserId === targetId) delete group.characters[id];
                    });
                    appendSystem(group, `${state.accounts[targetId].nickname} 离开了群聊`);
                    persist();
                    deliver(targetId, { type: 'group_removed', groupId: group.id });
                    deliverGroupState(group);
                    return acknowledge(ws, requestId);
                }
                if (type === 'delete_group') {
                    const group = groupFor(data.groupId, userId);
                    if (!group || group.creatorId !== userId)
                        return fail(ws, requestId, '只有群主可以解散群聊');
                    delete state.groups[group.id];
                    persist();
                    group.members.forEach(id => deliver(id, { type: 'group_removed', groupId: group.id }));
                    return acknowledge(ws, requestId);
                }
                if (type === 'update_group_settings') {
                    const group = groupFor(data.groupId, userId);
                    if (!group) return fail(ws, requestId, '不在群聊中');
                    if (group.creatorId !== userId) return fail(ws, requestId, '只有群主可以修改群设置');
                    const settings = data.settings || {};
                    if (safeText(settings.name, 60)) group.name = safeText(settings.name, 60);
                    if (typeof settings.announcement === 'string')
                        group.settings.announcement = safeText(settings.announcement, 500);
                    if (typeof settings.allowMemberInvites === 'boolean')
                        group.settings.allowMemberInvites = settings.allowMemberInvites;
                    if (typeof settings.aiEnabled === 'boolean') group.settings.aiEnabled = settings.aiEnabled;
                    if (typeof settings.autoReply === 'boolean') group.settings.autoReply = settings.autoReply;
                    if (Number.isInteger(settings.aiContextSize) && settings.aiContextSize >= 5 && settings.aiContextSize <= 100)
                        group.settings.aiContextSize = settings.aiContextSize;
                    if (Number.isInteger(settings.maxCharactersPerOwner) && settings.maxCharactersPerOwner >= 1 &&
                        settings.maxCharactersPerOwner <= 20)
                        group.settings.maxCharactersPerOwner = settings.maxCharactersPerOwner;
                    persist();
                    deliverGroupState(group);
                    return acknowledge(ws, requestId);
                }
                if (type === 'ai_character_join') {
                    const group = groupFor(data.groupId, userId);
                    if (!group || !group.settings.aiEnabled) return fail(ws, requestId, '群聊不允许加入角色');
                    const owned = Object.values(group.characters).filter(c => c.ownerUserId === userId);
                    if (owned.length >= group.settings.maxCharactersPerOwner) return fail(ws, requestId, '已达到角色数量上限');
                    const sourceId = safeText(data.character?.mainChatId, 100);
                    if (!sourceId || owned.some(c => c.sourceId === sourceId)) return fail(ws, requestId, '角色已在群内或资料无效');
                    const character = { characterId: crypto.randomUUID(), sourceId, ownerUserId: userId,
                        ownerNickname: state.accounts[userId].nickname,
                        originalName: safeText(data.character?.originalName, 60) || '角色',
                        avatar: safeAvatar(data.character?.avatar) };
                    group.characters[character.characterId] = character;
                    appendSystem(group, `${character.originalName} 加入了群聊`);
                    persist();
                    group.members.forEach(id => deliver(id, {
                        type: 'ai_character_join', groupId: group.id,
                        character: publicCharacter(character, id)
                    }));
                    return acknowledge(ws, requestId, { character });
                }
                if (type === 'ai_character_leave') {
                    const group = groupFor(data.groupId, userId);
                    const character = group?.characters?.[data.characterId];
                    if (!character || (character.ownerUserId !== userId && group.creatorId !== userId))
                        return fail(ws, requestId, '无权移除角色');
                    delete group.characters[character.characterId];
                    appendSystem(group, `${character.originalName} 离开了群聊`);
                    persist();
                    deliverGroup(group, { type: 'ai_character_leave', groupId: group.id,
                        characterId: character.characterId, characterName: character.originalName });
                    return acknowledge(ws, requestId);
                }
                if (type === 'send_group_message') {
                    const group = groupFor(data.groupId, userId);
                    if (!group) return fail(ws, requestId, '不在群聊中');
                    const content = safeText(data.message, 10000);
                    if (!content) return fail(ws, requestId, '消息为空');
                    const character = data.characterId && group.characters[data.characterId];
                    if (data.characterId && (!character || character.ownerUserId !== userId || !group.settings.aiEnabled))
                        return fail(ws, requestId, '无权代表这个角色发言');
                    let message = group.messages.find(m => m.id === requestId);
                    if (!message) {
                        message = { id: requestId || crypto.randomUUID(), seq: ++group.seq, groupId: group.id,
                            fromUserId: character ? character.characterId : userId, ownerUserId: userId,
                            fromNickname: character ? character.originalName : state.accounts[userId].nickname,
                            fromAvatar: character ? character.avatar : state.accounts[userId].avatar,
                            isAiCharacter: !!character, message: content, timestamp: Date.now() };
                        group.messages.push(message); persist();
                        deliverGroup(group, { type: 'receive_group_message', ...message }, userId);
                        socketsFor(userId).forEach(client => {
                            if (client !== ws) send(client, { type: 'receive_group_message', ...message });
                        });
                    }
                    return acknowledge(ws, requestId, { message });
                }
                fail(ws, requestId, '未知操作');
            } catch (error) {
                console.error('[联机操作失败]', error);
                fail(ws, requestId, '服务器处理失败');
            }
        });
        ws.on('close', () => {
            if (!userId) return;
            const connected = sockets.get(userId);
            connected?.delete(ws);
            if (connected && !connected.size) {
                sockets.delete(userId);
                (state.friends[userId] || []).forEach(id => deliver(id, { type: 'presence', userId, online: false }));
            } else if (connected) {
                const first = connected.values().next().value;
                send(first, { type: 'ai_host', active: true });
            }
        });
        ws.on('error', error => console.error('[WebSocket]', error.message));
    });
    return {
        dataDir,
        broadcastShutdown() {
            for (const connected of sockets.values()) for (const ws of connected) {
                send(ws, { type: 'server_shutdown', message: '服务器正在维护，请稍后重新连接' });
                ws.close();
            }
        }
    };
}
module.exports = { createOnlineService };
