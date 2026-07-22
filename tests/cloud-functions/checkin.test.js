// tests/cloud-functions/checkin.test.js — 打卡云函数测试
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
const checkinFn = require('../../cloudfunctions/checkin/index.js');

const OPENID_A = 'userA001';
const OPENID_B = 'userB002';

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

function addWish(coupleId, members, status, title) {
  const collections = mockSdk._getCollections();
  const wishId = 'wish_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const wish = {
    _id: wishId,
    coupleId,
    members,
    title: title || '测试愿望',
    description: '测试描述',
    category: 'food',
    status: status || 'ongoing',
    createdBy: members[0],
    drawnAt: status === 'ongoing' ? new Date() : null,
    completedAt: null,
    isFavorite: false,
    createdAt: new Date(),
  };
  collections.wishes.push(wish);
  return wishId;
}

function addCheckIn(coupleId, members, wishId, openid) {
  const collections = mockSdk._getCollections();
  const checkInId = 'checkin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const checkIn = {
    _id: checkInId,
    wishId,
    coupleId,
    members,
    checkInBy: openid,
    note: '完成啦',
    mediaList: [{ fileId: 'cloud://test/file1.jpg', type: 'image' }],
    location: null,
    createdAt: new Date(),
  };
  collections.checkins.push(checkIn);
  return checkInId;
}

describe('打卡云函数 - create', () => {
  test('有效打卡（wish为ongoing）→ 成功，wish变为completed', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'ongoing');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      note: '完成啦',
      mediaList: [{ fileId: 'cloud://test/file1.jpg', type: 'image' }],
    });

    expect(res.code).toBe(0);
    expect(res.message).toContain('打卡成功');
    expect(res.data.checkIn).toBeDefined();
    expect(res.data.wish.status).toBe('completed');

    // 验证 wish 状态确实变为 completed
    const collections = mockSdk._getCollections();
    const wish = collections.wishes.find((w) => w._id === wishId);
    expect(wish.status).toBe('completed');
    expect(wish.completedAt).not.toBeNull();
  });

  test('wish为pending → 返回1002（不能打卡）', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'pending');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      note: '',
      mediaList: [{ fileId: 'cloud://test/file1.jpg', type: 'image' }],
    });

    expect(res.code).toBe(1002);
    expect(res.message).toContain('状态');
  });

  test('wish为completed → 返回1002（不能重复打卡）', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'completed');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      note: '',
      mediaList: [{ fileId: 'cloud://test/file1.jpg', type: 'image' }],
    });

    expect(res.code).toBe(1002);
  });

  test('缺少wishId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({
      action: 'create',
      mediaList: [{ fileId: 'test', type: 'image' }],
    });

    expect(res.code).toBe(1004);
  });

  test('空mediaList → 返回1004', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'ongoing');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      mediaList: [],
    });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('图片或视频');
  });

  test('mediaList为undefined → 返回1004', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'ongoing');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      note: '',
    });

    expect(res.code).toBe(1004);
  });

  test('备注超500字 → 返回1004', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const wishId = addWish(coupleId, [OPENID_A, OPENID_B], 'ongoing');

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      note: 'a'.repeat(501),
      mediaList: [{ fileId: 'test', type: 'image' }],
    });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('500');
  });

  test('愿望不存在 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({
      action: 'create',
      wishId: 'nonexistent',
      mediaList: [{ fileId: 'test', type: 'image' }],
    });

    expect(res.code).toBe(1004);
  });

  test('未贴贴 → 返回1001', async () => {
    mockSdk._resetData();
    mockSdk._getCollections().users.push({
      _id: 'user_alone',
      openid: 'alone',
      nickName: '',
      avatarUrl: '',
      coupleId: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSdk._setOpenid('alone');

    const res = await checkinFn.main({
      action: 'create',
      wishId: 'wish1',
      mediaList: [{ fileId: 'test', type: 'image' }],
    });

    expect(res.code).toBe(1001);
  });
});

describe('打卡云函数 - list', () => {
  test('查询打卡列表 → 返回ongoing和completed', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];

    // 添加一个 ongoing 愿望
    addWish(coupleId, members, 'ongoing', '进行中愿望');

    // 添加一个 completed 愿望 + 打卡记录
    const completedWishId = addWish(coupleId, members, 'completed', '已完成愿望');
    addCheckIn(coupleId, members, completedWishId, OPENID_A);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'list' });

    expect(res.code).toBe(0);
    expect(res.data.ongoing).toHaveLength(1);
    expect(res.data.ongoing[0].title).toBe('进行中愿望');
    expect(res.data.completed).toHaveLength(1);
    expect(res.data.completed[0].wishTitle).toBe('已完成愿望');
  });

  test('无数据 → 返回空数组', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'list' });

    expect(res.code).toBe(0);
    expect(res.data.ongoing).toHaveLength(0);
    expect(res.data.completed).toHaveLength(0);
  });
});

describe('打卡云函数 - detail', () => {
  test('查询打卡详情 → 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'completed');
    const checkInId = addCheckIn(coupleId, members, wishId, OPENID_A);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'detail', checkInId });

    expect(res.code).toBe(0);
    expect(res.data.checkIn).toBeDefined();
    expect(res.data.checkIn._id).toBe(checkInId);
    expect(res.data.wish).toBeDefined();
    expect(res.data.wish._id).toBe(wishId);
  });

  test('缺少checkInId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({ action: 'detail' });

    expect(res.code).toBe(1004);
  });

  test('打卡记录不存在 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({ action: 'detail', checkInId: 'nonexistent' });

    expect(res.code).toBe(1004);
  });
});

describe('打卡云函数 - delete', () => {
  test('删除打卡记录 → 成功', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'completed');
    const checkInId = addCheckIn(coupleId, members, wishId, OPENID_A);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'delete', checkInId });

    expect(res.code).toBe(0);
    expect(res.message).toContain('已删除');

    // 验证已删除
    const collections = mockSdk._getCollections();
    const exists = collections.checkins.find((c) => c._id === checkInId);
    expect(exists).toBeUndefined();
  });

  test('删除打卡 + 恢复愿望状态 → wish回到ongoing', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'completed');
    const checkInId = addCheckIn(coupleId, members, wishId, OPENID_A);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'delete', checkInId, restoreWish: true });

    expect(res.code).toBe(0);

    // 验证 wish 状态恢复为 ongoing
    const collections = mockSdk._getCollections();
    const wish = collections.wishes.find((w) => w._id === wishId);
    expect(wish.status).toBe('ongoing');
    expect(wish.completedAt).toBeNull();
  });

  test('删除打卡不恢复愿望 → wish保持completed', async () => {
    mockSdk._resetData();
    const coupleId = setupPairedUsers(OPENID_A, OPENID_B);
    const members = [OPENID_A, OPENID_B];
    const wishId = addWish(coupleId, members, 'completed');
    const checkInId = addCheckIn(coupleId, members, wishId, OPENID_A);

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'delete', checkInId, restoreWish: false });

    expect(res.code).toBe(0);

    const collections = mockSdk._getCollections();
    const wish = collections.wishes.find((w) => w._id === wishId);
    expect(wish.status).toBe('completed');
  });

  test('缺少checkInId → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({ action: 'delete' });

    expect(res.code).toBe(1004);
  });

  test('打卡记录不存在 → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({ action: 'delete', checkInId: 'nonexistent' });

    expect(res.code).toBe(1004);
  });
});

describe('打卡云函数 - 未知action', () => {
  test('未知action → 返回1004', async () => {
    mockSdk._resetData();
    setupPairedUsers(OPENID_A, OPENID_B);
    mockSdk._setOpenid(OPENID_A);

    const res = await checkinFn.main({ action: 'unknownAction' });
    expect(res.code).toBe(1004);
  });
});

// 恢复原始 require
Module.prototype.require = originalRequire;

module.exports = { runTests: require('../test-harness').runAll };
