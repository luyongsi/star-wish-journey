// tests/cloud-functions/pair.test.js — 贴贴云函数测试
const path = require('path');
const Module = require('module');

// 拦截 require('wx-server-sdk')，返回 mock
const mockSdk = require('../mock-wx-server-sdk');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'wx-server-sdk') return mockSdk;
  return originalRequire.apply(this, arguments);
};

const { describe, test, expect } = require('../test-harness');
// 在 mock 设置后加载云函数
const pairFn = require('../../cloudfunctions/pair/index.js');

// 辅助：设置测试数据
function setupTestUser(openid, coupleId) {
  const collections = mockSdk._getCollections();
  const userDoc = {
    _id: 'user_' + openid,
    openid,
    nickName: '用户' + openid.slice(-4),
    avatarUrl: '',
    coupleId: coupleId || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  collections.users.push(userDoc);
  return userDoc;
}

function setupTestCouple(userA, userB, status, pairCode) {
  const collections = mockSdk._getCollections();
  const coupleDoc = {
    _id: 'couple_test',
    userA,
    userB: userB || '',
    status: status || 'pending',
    pairCode: pairCode || '123456',
    anniversary: status === 'active' ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  collections.couples.push(coupleDoc);
  return coupleDoc;
}

describe('贴贴云函数 - create', () => {
  test('用户存在且未贴贴 → 成功生成贴贴码', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    setupTestUser(openid);
    mockSdk._setOpenid(openid);

    const res = await pairFn.main({ action: 'create' });

    expect(res.code).toBe(0);
    expect(res.data.pairCode).toBeDefined();
    expect(res.data.pairCode).toMatch(/^\d{6}$/);
    expect(res.data.couple.status).toBe('pending');
    expect(res.data.couple.userA).toBe(openid);
  });

  test('用户不存在 → 返回1003', async () => {
    mockSdk._resetData();
    mockSdk._setOpenid('nonexistent');

    const res = await pairFn.main({ action: 'create' });

    expect(res.code).toBe(1003);
    expect(res.message).toContain('用户不存在');
  });

  test('已处于active贴贴状态 → 返回1002', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    const couple = setupTestCouple(openid, 'userB002', 'active', '');
    setupTestUser(openid, couple._id);
    mockSdk._setOpenid(openid);

    const res = await pairFn.main({ action: 'create' });

    expect(res.code).toBe(1002);
    expect(res.message).toContain('已经贴贴');
  });

  test('有pending贴贴记录 → 允许重新创建', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    const couple = setupTestCouple(openid, '', 'pending', '654321');
    setupTestUser(openid, couple._id);
    mockSdk._setOpenid(openid);

    const res = await pairFn.main({ action: 'create' });

    expect(res.code).toBe(0);
    expect(res.data.pairCode).toMatch(/^\d{6}$/);
  });
});

describe('贴贴云函数 - join', () => {
  test('有效贴贴码 → 贴贴成功', async () => {
    mockSdk._resetData();
    const openidA = 'userA001';
    const openidB = 'userB002';
    setupTestUser(openidA);
    setupTestUser(openidB);
    const couple = setupTestCouple(openidA, '', 'pending', '888888');

    mockSdk._setOpenid(openidB);
    const res = await pairFn.main({ action: 'join', pairCode: '888888' });

    expect(res.code).toBe(0);
    expect(res.message).toContain('贴贴成功');
    expect(res.data.couple.status).toBe('active');
    expect(res.data.couple.userB).toBe(openidB);
  });

  test('无效贴贴码格式（非6位数字）→ 返回1004', async () => {
    mockSdk._resetData();
    setupTestUser('userA001');

    const res = await pairFn.main({ action: 'join', pairCode: '12345' });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('6位数字');
  });

  test('贴贴码不存在 → 返回1002', async () => {
    mockSdk._resetData();
    const openid = 'userB002';
    setupTestUser(openid);
    mockSdk._setOpenid(openid);

    const res = await pairFn.main({ action: 'join', pairCode: '999999' });

    expect(res.code).toBe(1002);
    expect(res.message).toContain('无效或已被使用');
  });

  test('不能加入自己创建的贴贴 → 返回1002', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    setupTestUser(openid);
    setupTestCouple(openid, '', 'pending', '777777');
    mockSdk._setOpenid(openid);

    const res = await pairFn.main({ action: 'join', pairCode: '777777' });

    expect(res.code).toBe(1002);
    expect(res.message).toContain('不能加入自己');
  });

  test('已贴贴用户尝试加入 → 返回1002', async () => {
    mockSdk._resetData();
    const openidA = 'userA001';
    const openidB = 'userB002';
    const openidC = 'userC003';
    setupTestUser(openidA);
    setupTestUser(openidB, 'couple_existing');
    setupTestUser(openidC);
    setupTestCouple(openidA, '', 'pending', '666666');
    // userB 已有 active 贴贴
    const existingCouple = {
      _id: 'couple_existing',
      userA: openidB,
      userB: 'someoneElse',
      status: 'active',
      pairCode: '',
      anniversary: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSdk._getCollections().couples.push(existingCouple);

    mockSdk._setOpenid(openidB);
    const res = await pairFn.main({ action: 'join', pairCode: '666666' });

    expect(res.code).toBe(1002);
  });

  test('空贴贴码 → 返回1004', async () => {
    mockSdk._resetData();
    setupTestUser('userA001');

    const res = await pairFn.main({ action: 'join', pairCode: '' });

    expect(res.code).toBe(1004);
  });
});

describe('贴贴云函数 - unbind', () => {
  test('已贴贴用户解绑 → 成功', async () => {
    mockSdk._resetData();
    const openidA = 'userA001';
    const openidB = 'userB002';
    const couple = setupTestCouple(openidA, openidB, 'active', '');
    setupTestUser(openidA, couple._id);
    setupTestUser(openidB, couple._id);

    mockSdk._setOpenid(openidA);
    const res = await pairFn.main({ action: 'unbind' });

    expect(res.code).toBe(0);
    expect(res.message).toContain('已解除贴贴');

    // 验证 couple 状态已变更
    const collections = mockSdk._getCollections();
    const updatedCouple = collections.couples.find((c) => c._id === couple._id);
    expect(updatedCouple.status).toBe('unbound');
  });

  test('未贴贴用户解绑 → 返回1001', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    setupTestUser(openid);

    mockSdk._setOpenid(openid);
    const res = await pairFn.main({ action: 'unbind' });

    expect(res.code).toBe(1001);
    expect(res.message).toContain('未贴贴');
  });
});

describe('贴贴云函数 - info', () => {
  test('已贴贴用户获取信息 → 返回couple和partner', async () => {
    mockSdk._resetData();
    const openidA = 'userA001';
    const openidB = 'userB002';
    const couple = setupTestCouple(openidA, openidB, 'active', '');
    setupTestUser(openidA, couple._id);
    setupTestUser(openidB, couple._id);

    mockSdk._setOpenid(openidA);
    const res = await pairFn.main({ action: 'info' });

    expect(res.code).toBe(0);
    expect(res.data.couple).toBeDefined();
    expect(res.data.partner).toBeDefined();
    expect(res.data.partner.openid).toBe(openidB);
    expect(res.data.anniversaryDays).toBeDefined();
    expect(res.data.currentUser).toBeDefined();
  });

  test('未贴贴用户获取信息 → 返回1001', async () => {
    mockSdk._resetData();
    const openid = 'userA001';
    setupTestUser(openid);

    mockSdk._setOpenid(openid);
    const res = await pairFn.main({ action: 'info' });

    expect(res.code).toBe(1001);
  });
});

describe('贴贴云函数 - 未知action', () => {
  test('未知action → 返回1004', async () => {
    mockSdk._resetData();
    const res = await pairFn.main({ action: 'unknownAction' });
    expect(res.code).toBe(1004);
  });
});

// 恢复原始 require
Module.prototype.require = originalRequire;

module.exports = { runTests: require('../test-harness').runAll };
