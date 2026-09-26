const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

// 协议测试使用内存 socket，不启动用户正在使用的端口或浏览器。
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ws') return { OPEN: 1 };
    return originalLoad.call(this, request, parent, isMain);
};
const { createOnlineService } = require('../online-service');
Module._load = originalLoad;

class Socket extends EventEmitter {
    constructor(server) {
        super();
        this.readyState = 1;
        this.received = [];
        server.emit('connection', this);
    }
    send(raw) { this.received.push(JSON.parse(raw)); }
    request(message) { this.emit('message', JSON.stringify(message)); }
    last(type) { return [...this.received].reverse().find(message => message.type === type); }
    close() { this.readyState = 3; this.emit('close'); }
}

test('新身份、离线同步、多个角色及群权限', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ephone-online-test-'));
    const previousDirectory = process.env.ONLINE_DATA_DIR;
    process.env.ONLINE_DATA_DIR = directory;
    try {
        const server = new EventEmitter();
        createOnlineService(server);
        const alice = new Socket(server);
        alice.request({ type: 'register', nickname: '甲' });
        const a = alice.last('register_success');
        assert.match(a.userId, /^u_/);
        assert.ok(a.credential);

        const bob = new Socket(server);
        bob.request({ type: 'register', nickname: '乙' });
        const b = bob.last('register_success');
        const legacy = new Socket(server);
        legacy.request({ type: 'register', userId: 'old-id', nickname: '旧用户' });
        assert.equal(legacy.last('register_error').type, 'register_error');

        alice.request({ type: 'friend_request', toUserId: b.userId, requestId: 'friend-1' });
        bob.request({ type: 'accept_friend_request', fromUserId: a.userId, requestId: 'accept-1' });
        alice.request({ type: 'send_message', toUserId: b.userId, message: '旧私聊', requestId: 'dm-1' });
        alice.request({ type: 'create_group', groupName: '测试群',
            members: [{ userId: b.userId }], requestId: 'group-1' });
        const group = alice.last('operation_ack').group;
        assert.equal(group.members.length, 2);

        alice.request({ type: 'ai_character_join', groupId: group.id,
            character: { mainChatId: 'main-1', originalName: '角色一' }, requestId: 'role-1' });
        const role1 = alice.last('operation_ack').character;
        alice.request({ type: 'ai_character_join', groupId: group.id,
            character: { mainChatId: 'main-2', originalName: '角色二' }, requestId: 'role-2' });
        assert.notEqual(role1.characterId, alice.last('operation_ack').character.characterId);
        bob.request({ type: 'send_group_message', groupId: group.id, characterId: role1.characterId,
            message: '冒充', requestId: 'spoof-1' });
        assert.match(bob.last('operation_error').error, /无权/);

        bob.close();
        alice.request({ type: 'send_group_message', groupId: group.id,
            message: '离线消息', requestId: 'offline-1' });
        const bobBack = new Socket(server);
        bobBack.request({ type: 'register', userId: b.userId, credential: b.credential });
        const restored = bobBack.last('sync_snapshot');
        const restoredGroup = restored.groups.find(item => item.id === group.id);
        assert.equal(restoredGroup.characters.length, 2);
        assert.equal(restoredGroup.messages.at(-1).message, '离线消息');

        const charlie = new Socket(server);
        charlie.request({ type: 'register', nickname: '丙' });
        const c = charlie.last('register_success');
        alice.request({ type: 'friend_request', toUserId: c.userId, requestId: 'friend-2' });
        charlie.request({ type: 'accept_friend_request', fromUserId: a.userId, requestId: 'accept-2' });
        alice.request({ type: 'invite_group_member', groupId: group.id,
            toUserId: c.userId, requestId: 'invite-1' });
        charlie.request({ type: 'sync' });
        const invitedGroup = charlie.last('sync_snapshot').groups.find(item => item.id === group.id);
        assert.equal(invitedGroup.messages.length, 1);
        assert.match(invitedGroup.messages[0].message, /加入了群聊/);
        assert.equal(invitedGroup.characters[0].sourceId, undefined);

        const duplicate = new Socket(server);
        duplicate.request({ type: 'register', userId: a.userId, credential: a.credential });
        alice.close();
        bobBack.request({ type: 'search_user', searchId: a.userId });
        assert.equal(bobBack.last('search_result').found, true);
        duplicate.request({ type: 'sync' });
        assert.equal(duplicate.last('sync_snapshot').groups.length, 1);
        bobBack.request({ type: 'delete_friend', toUserId: a.userId, requestId: 'delete-friend-1' });
        bobBack.request({ type: 'sync' });
        assert.equal(bobBack.last('sync_snapshot').direct[
            [a.userId, b.userId].sort().join(':')].length, 0);
        duplicate.request({ type: 'sync' });
        assert.equal(duplicate.last('sync_snapshot').direct[
            [a.userId, b.userId].sort().join(':')].length, 1);
        duplicate.request({ type: 'delete_group', groupId: group.id, requestId: 'delete-group-1' });
        assert.equal(bobBack.last('group_removed').groupId, group.id);
    } finally {
        if (previousDirectory === undefined) delete process.env.ONLINE_DATA_DIR;
        else process.env.ONLINE_DATA_DIR = previousDirectory;
        if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    }
});
