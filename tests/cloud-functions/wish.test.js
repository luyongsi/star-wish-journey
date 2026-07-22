// tests/cloud-functions/wish.test.js — 愿望云函数测试
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
const wishFn = require('../../cloudfunctions/wish/index.js');

// 辅助：创建已贴贴用户和couple
function setupPairedUsers(openidA, openidB) {
  const collections = mockSdk._getCollections();
  const coupleId = 'couple_test_' + Date.now();

  collections.users.push({
    _id: 'user_' + openidA,
    openid: openidA,
    nickName: 'A',
    avatarUrl: '',
    coupleId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  collections.users.push({
    _id: 'user_' + openidB,
    openid: openidB,
    nickName: 'B',
    avatarUrl: '',
    coupleId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  collections.couples.push({
    _id: coupleId,
    userA: openidA,
    userB: openidB,
    status: 'active',
    pairCode: '',
    anniversary: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return coupleId;
}

function addWish(coupleId, members, status, title, category) {
  const collections = mockSdk._getCollections();
  const wishId = 'wish_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const wish = {
    _id: wishId,
    coupleId,
    members,
    title: title || '测试愿望',
    description: '测试描述',
    category: category || 'food',
    status: status || 'pending',
    createdBy: members[0],
    drawnAt: null,
    completedAt: null,
    isFavorite: false,
    createdAt: new Date(),
  };
  collections.wishes.push(wish);
  return wishId;
}

const OPENID_A = 'userA001';
const OPENID_B = 'userB002';

describe('愿望云函数 - create', () => {
  test('有效参数 → 创建成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'create',
      title: '去吃火锅',
      description: '周末去吃海底捞',
      category: 'food',
    });

    expect(res.code).toBe(0);
    expect(res.data.title).toBe('去吃火锅');
    expect(res.data.status).toBe('pending');
    expect(res.data.coupleId).toBe(coupleId);
    expect(res.data.members).toHaveLength(2);
    expect(res.data.createdBy).toBe(OPENID_A);
    expect(res.data.isFavorite).toBe(false);
  });

  test('未贴贴 → 返回1001', async () => {
    mockSdk._resetData();
    const collections = mockSdk._getCollections();
    collections.users.push({
      _id: 'user_alone',
      openid: 'alone',
      nickName: '',
      avatarUrl: '',
      coupleId: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSdk._setOpenid('alone');

    const res = await wishFn.main({
      action: 'create',
      title: '测试',
    });

    expect(res.code).toBe(1001);
  });

  test('空标题 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'create',
      title: '',
    });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('标题');
  });

  test('标题超30字 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'create',
      title: 'a'.repeat(31),
    });

    expect(res.code).toBe(1004);
  });

  test('无效分类 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'create',
      title: '测试',
      category: 'invalid',
    });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('分类');
  });

  test('不传分类 → 默认 other', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'create',
      title: '测试',
    });

    expect(res.code).toBe(0);
    expect(res.data.category).toBe('other');
  });
});

describe('愿望云函数 - update', () => {
  test('有效更新 → 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({
      action: 'update',
      wishId,
      title: '更新后的标题',
      description: '更新后的描述',
    });

    expect(res.code).toBe(0);
    expect(res.data.title).toBe('更新后的标题');
  });

  test('缺少wishId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'update',
      title: '新标题',
    });

    expect(res.code).toBe(1004);
  });

  test('愿望不存在 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'update',
      wishId: 'nonexistent',
      title: '新标题',
    });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('不存在');
  });

  test('更新标题超长 → 返回1004', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({
      action: 'update',
      wishId,
      title: 'a'.repeat(31),
    });

    expect(res.code).toBe(1004);
  });

  test('更新收藏状态 → 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({
      action: 'update',
      wishId,
      isFavorite: true,
    });

    expect(res.code).toBe(0);
    expect(res.data.isFavorite).toBe(true);
  });
});

describe('愿望云函数 - delete', () => {
  test('删除愿望 → 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({
      action: 'delete',
      wishId,
    });

    expect(res.code).toBe(0);
    expect(res.message).toContain('已删除');

    // 验证已从集合中删除
    const collections = mockSdk._getCollections();
    const wishExists = collections.wishes.find((w) => w._id === wishId);
    expect(wishExists).toBeUndefined();
  });

  test('删除不存在的愿望 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({
      action: 'delete',
      wishId: 'nonexistent',
    });

    expect(res.code).toBe(1004);
  });
});

describe('愿望云函数 - list', () => {
  test('查询愿望列表 → 返回愿望和统计', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    addWish(coupleId, members, 'pending', '愿望1', 'food');
    addWish(coupleId, members, 'ongoing', '愿望2', 'travel');
    addWish(coupleId, members, 'completed', '愿望3', 'movie');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'list' });

    expect(res.code).toBe(0);
    expect(res.data.wishes).toHaveLength(3);
    expect(res.data.stats.total).toBe(3);
    expect(res.data.stats.pending).toBe(1);
    expect(res.data.stats.ongoing).toBe(1);
    expect(res.data.stats.completed).toBe(1);
  });

  test('按分类过滤 → 返回对应愿望', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    addWish(coupleId, members, 'pending', '愿望1', 'food');
    addWish(coupleId, members, 'pending', '愿望2', 'travel');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'list', category: 'food' });

    expect(res.code).toBe(0);
    expect(res.data.wishes).toHaveLength(1);
    expect(res.data.wishes[0].category).toBe('food');
  });

  test('按状态过滤 → 返回对应愿望', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    addWish(coupleId, members, 'pending', '愿望1', 'food');
    addWish(coupleId, members, 'completed', '愿望2', 'travel');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'list', status: 'completed' });

    expect(res.code).toBe(0);
    expect(res.data.wishes).toHaveLength(1);
    expect(res.data.wishes[0].status).toBe('completed');
  });
});

describe('愿望云函数 - draw', () => {
  test('有待抽取愿望 → 随机返回一条，状态不变', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    addWish(coupleId, members, 'pending', '愿望1', 'food');
    addWish(coupleId, members, 'pending', '愿望2', 'travel');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'draw' });

    expect(res.code).toBe(0);
    expect(res.data.wish).not.toBeNull();
    expect(res.data.wish.status).toBe('pending'); // draw 不改 status
    expect(res.data.wish.drawnAt).not.toBeNull(); // drawnAt 被设置
  });

  test('愿望池为空 → 返回 wish 为 null', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'draw' });

    expect(res.code).toBe(0);
    expect(res.data.wish).toBeNull();
  });

  test('只有已完成愿望 → 不应被抽取', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    addWish(coupleId, [OPENID_A, OPENID_B], 'completed', '已完成愿望', 'food');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'draw' });

    expect(res.code).toBe(0);
    expect(res.data.wish).toBeNull();
  });
});

describe('愿望云函数 - start (状态机校验)', () => {
  test('pending → ongoing 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'start', wishId });

    expect(res.code).toBe(0);
    expect(res.data.status).toBe('ongoing');
  });

  test('ongoing 状态不能再 start → 返回1002', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'ongoing');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'start', wishId });

    expect(res.code).toBe(1002);
    expect(res.message).toContain('状态');
  });

  test('completed 状态不能再 start → 返回1002', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'completed');

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'start', wishId });

    expect(res.code).toBe(1002);
  });

  test('缺少wishId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'start' });

    expect(res.code).toBe(1004);
  });
});

describe('愿望云函数 - return', () => {
  test('放回愿望 → drawnAt 被清空', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');
    // 设置 drawnAt
    mockSdk._getCollections().wishes[0].drawnAt = new Date();

    mockSdk._setOpenid(OPENID_A);
    const res = await wishFn.main({ action: 'return', wishId });

    expect(res.code).toBe(0);
    expect(res.message).toContain('放回');

    // 验证 drawnAt 被清空
    const collections = mockSdk._getCollections();
    const wish = collections.wishes.find((w) => w._id === wishId);
    expect(wish.drawnAt).toBeNull();
  });

  test('缺少wishId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'return' });

    expect(res.code).toBe(1004);
  });
});

describe('愿望云函数 - 未知action', () => {
  test('未知action → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'unknownAction' });
    expect(res.code).toBe(1004);
  });
});

// 恢复原始 require
Module.prototype.require = originalRequire;

module.exports = { runTests: require('../test-harness').runAll };
