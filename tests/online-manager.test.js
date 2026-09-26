const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('服务器快照恢复多人、多角色与离线消息', () => {
    const values = new Map();
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value))
    };
    const document = {
        readyState: 'loading',
        addEventListener() {},
        getElementById() { return null; },
        createElement() { return { textContent: '', innerHTML: '' }; }
    };
    const context = vm.createContext({
        document, localStorage, window: { state: { chats: {}, worldBooks: [] } },
        console, setTimeout() { return 1; }, clearTimeout() {},
        setInterval() { return 1; }, clearInterval() {},
        requestAnimationFrame() {}, navigator: {}, alert() {}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/online/manager.js'), 'utf8'), context);
    const manager = vm.runInContext('onlineChatManager', context);
    manager.userId = 'u_me';
    manager.isConnected = true;
    manager.isAiHost = true;
    manager.onSyncSnapshot({
        friends: [{ userId: 'u_friend', nickname: '朋友', avatar: '' }],
        requests: [],
        direct: {
            'u_friend:u_me': [{ id: 'd1', fromUserId: 'u_friend', toUserId: 'u_me',
                message: '离线私聊', timestamp: 10 }]
        },
        groups: [{
            id: 'group-1', name: '多人群', creatorId: 'u_me',
            members: [{ userId: 'u_me', nickname: '我' }, { userId: 'u_friend', nickname: '朋友' }],
            characters: [
                { characterId: 'role-1', sourceId: 'main-1', ownerUserId: 'u_me', originalName: '甲角色' },
                { characterId: 'role-2', sourceId: 'main-2', ownerUserId: 'u_me', originalName: '乙角色' },
                { characterId: 'role-3', sourceId: 'main-3', ownerUserId: 'u_friend', originalName: '朋友角色' }
            ],
            settings: { aiEnabled: true, autoReply: false, aiContextSize: 30 },
            messages: [
                { id: 'g1', seq: 1, fromUserId: 'u_friend', fromNickname: '朋友',
                    message: '离线群聊', timestamp: 11, isAiCharacter: false },
                { id: 'g2', seq: 2, fromUserId: 'role-3', ownerUserId: 'u_friend',
                    fromNickname: '朋友角色', message: '收到', timestamp: 12, isAiCharacter: true }
            ]
        }]
    });
    assert.equal(manager.chats['online_u_friend'].history[0].content, '离线私聊');
    assert.equal(manager.chats['group-1'].members.length, 5);
    assert.equal(manager.chats['group-1'].history[1].senderNickname, '朋友角色');
    assert.equal(manager.aiCharactersInGroup['group-1'].filter(c => c.ownerUserId === 'u_me').length, 2);
    assert.equal(manager.chats['group-1'].aiContextSize, 30);
});
