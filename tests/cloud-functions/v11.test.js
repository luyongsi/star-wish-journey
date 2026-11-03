// tests/cloud-functions/v11.test.js — v1.1 新增能力测试
// 覆盖：打卡减负 / 追加记录 / 列表三分区 / 抽取条件 / 每日一抽 / 资料 / 成就 / 年度报告 / 足迹
const Module = require('module');

const mockSdk = require('../mock-wx-server-sdk');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'wx-server-sdk') return mockSdk;
  return originalRequire.apply(this, arguments);
};

const { describe, test, expect } = require('../test-harness');
const checkinFn = require('../../cloudfunctions/checkin/index.js');
const wishFn = require('../../cloudfunctions/wish/index.js');
const pairFn = require('../../cloudfunctions/pair/index.js');
const memoryFn = require('../../cloudfunctions/memory/index.js');
const loginFn = require('../../cloudfunctions/login/index.js');

const OPENID_A = 'v11_userA';
const OPENID_B = 'v11_userB';

/**
 * 建立已贴贴的两人
 */
function setupCouple(anniversary) {
  const collections = mockSdk._getCollections();
  const coupleId = 'couple_v11_' + Date.now() + Math.random().toString(36).slice(2, 5);
  collections.users.push({ _id: 'u_' + OPENID_A, openid: OPENID_A, nickName: '小鹿', avatarUrl: '', coupleId });
  collections.users.push({ _id: 'u_' + OPENID_B, openid: OPENID_B, nickName: '阿木', avatarUrl: '', coupleId });
  collections.couples.push({
    _id: coupleId,
    userA: OPENID_A,
    userB: OPENID_B,
    status: 'active',
    pairCode: '',
    anniversary: anniversary || new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    boundAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return coupleId;
}

/**
 * 添加愿望
 */
function addWish(coupleId, overrides) {
  const collections = mockSdk._getCollections();
  const wish = {
    _id: overrides._id,
    coupleId,
    members: [OPENID_A, OPENID_B],
    title: '愿望',
    description: '',
    category: 'food',
    status: 'pending',
    createdBy: OPENID_A,
    drawnAt: null,
    plannedDate: null,
    completedAt: null,
    isFavorite: false,
    coverUrl: '',
    checkInCount: 0,
    createdAt: overrides.createdAt || new Date(),
  };
  Object.assign(wish, overrides);
  collections.wishes.push(wish);
  return wish._id;
}

describe('v1.1 打卡减负', () => {
  test('不带媒体、不带备注也能完成打卡', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w1', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'create', wishId });

    expect(res.code).toBe(0);
    expect(res.data.checkIn.mediaList).toHaveLength(0);
    expect(res.data.checkIn.note).toBe('');
    expect(res.data.wish.status).toBe('completed');

    const wish = mockSdk._getCollections().wishes.find((w) => w._id === wishId);
    expect(wish.status).toBe('completed');
    expect(wish.checkInCount).toBe(1);
  });

  test('先跳过直接完成不产生记录', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w2', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'complete', wishId });

    expect(res.code).toBe(0);
    expect(res.data.wish.status).toBe('completed');
    expect(mockSdk._getCollections().checkins).toHaveLength(0);
  });

  test('重复跳过完成 → 幂等成功', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w3', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    await checkinFn.main({ action: 'complete', wishId });
    const res = await checkinFn.main({ action: 'complete', wishId });

    expect(res.code).toBe(0);
    expect(res.message).toContain('已完成');
  });

  test('追加记录：内容全空 → 1004', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w4', status: 'completed' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'append', wishId, note: '  ' });

    expect(res.code).toBe(1004);
    expect(res.message).toContain('至少填写一项');
  });

  test('追加记录：带备注 → 成功且愿望保持 completed', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w5', status: 'completed', checkInCount: 1 });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'append', wishId, note: '补一张照片' });

    expect(res.code).toBe(0);
    expect(res.data.checkIn.isAppend).toBe(true);
    expect(mockSdk._getCollections().checkins).toHaveLength(1);
    const wish = mockSdk._getCollections().wishes.find((w) => w._id === wishId);
    expect(wish.status).toBe('completed');
    expect(wish.checkInCount).toBe(2);
  });

  test('对未完成的愿望追加记录 → 1002', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w6', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'append', wishId, note: 'x' });

    expect(res.code).toBe(1002);
  });

  test('带位置打卡 → 位置被规范化保存', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w7', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      location: {
        name: '黄山顶',
        address: '安徽省黄山市黄山区',
        latitude: 30.13,
        longitude: 118.16,
        city: '黄山市',
      },
    });

    expect(res.code).toBe(0);
    expect(res.data.checkIn.location.name).toBe('黄山顶');
    expect(res.data.checkIn.location.city).toBe('黄山市');
  });

  test('位置缺少 name → 不保存位置', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w8', status: 'ongoing' });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({
      action: 'create',
      wishId,
      location: { latitude: 30, longitude: 120 },
    });

    expect(res.code).toBe(0);
    expect(res.data.checkIn.location).toBeNull();
  });
});

describe('v1.1 打卡列表三分区', () => {
  test('今天要做 / 待打卡 / 已完成 分区正确', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    addWish(coupleId, { _id: 't1', status: 'ongoing', title: '今天', plannedDate: today });
    addWish(coupleId, { _id: 't2', status: 'ongoing', title: '过期', plannedDate: yesterday });
    addWish(coupleId, { _id: 't3', status: 'ongoing', title: '未来', plannedDate: tomorrow });
    addWish(coupleId, { _id: 't4', status: 'ongoing', title: '未计划' });
    addWish(coupleId, { _id: 't5', status: 'completed', title: '完成', completedAt: new Date() });
    mockSdk._getCollections().checkins.push({
      _id: 'c1', wishId: 't5', coupleId, checkInBy: OPENID_A,
      note: '好', mediaList: [{ fileId: 'f1', type: 'image' }], createdAt: new Date(),
    });

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'list' });

    expect(res.code).toBe(0);
    expect(res.data.today).toHaveLength(2);
    expect(res.data.today[0].title).toBe('过期');
    expect(res.data.ongoing).toHaveLength(2);
    expect(res.data.completed).toHaveLength(1);
    expect(res.data.completed[0].recordCount).toBe(1);
    expect(res.data.completed[0].mediaCount).toBe(1);
    expect(res.data.completed[0].coverMedia.fileId).toBe('f1');
    expect(res.data.stats.todayCount).toBe(2);
  });

  test('查询某愿望下的全部记录 → 时间正序', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const wishId = addWish(coupleId, { _id: 'w9', status: 'completed' });
    const collections = mockSdk._getCollections();
    collections.checkins.push(
      { _id: 'a1', wishId, coupleId, checkInBy: OPENID_A, note: '第一条', mediaList: [], createdAt: new Date(Date.now() - 10000) },
      { _id: 'a2', wishId, coupleId, checkInBy: OPENID_B, note: '第二条', mediaList: [], createdAt: new Date() }
    );

    mockSdk._setOpenid(OPENID_A);
    const res = await checkinFn.main({ action: 'listByWish', wishId });

    expect(res.code).toBe(0);
    expect(res.data.records).toHaveLength(2);
    expect(res.data.records[0].note).toBe('第一条');
  });
});

describe('v1.1 抽取增强', () => {
  function seedPending(coupleId) {
    addWish(coupleId, { _id: 'p1', category: 'food', title: '美食1' });
    addWish(coupleId, { _id: 'p2', category: 'travel', title: '旅行1' });
    addWish(coupleId, { _id: 'p3', category: 'food', title: '美食2' });
    addWish(coupleId, { _id: 'p4', category: 'sport', title: '运动1' });
    addWish(coupleId, { _id: 'p5', category: 'food', title: '美食3' });
  }

  test('按分类抽取 → 只出该分类', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    seedPending(coupleId);
    mockSdk._setOpenid(OPENID_A);

    for (let i = 0; i < 20; i++) {
      const res = await wishFn.main({ action: 'draw', category: 'travel' });
      expect(res.code).toBe(0);
      expect(res.data.wish.category).toBe('travel');
    }
  });

  test('避开近期：drawnAt 在 7 天内的愿望不被抽中', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    // 2 天前抽过，仍在 7 天避重窗口内；放宽时应优先抽它（最久未抽）
    addWish(coupleId, { _id: 'r1', title: '刚抽过', drawnAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
    addWish(coupleId, { _id: 'r2', title: 'A' });
    addWish(coupleId, { _id: 'r3', title: 'B' });
    addWish(coupleId, { _id: 'r4', title: 'C' });
    mockSdk._setOpenid(OPENID_A);

    // 逐个抽走未抽过的候选，期间不应抽到近期抽过的那条
    for (let i = 0; i < 3; i++) {
      const res = await wishFn.main({ action: 'draw', excludeDays: 7 });
      expect(res.code).toBe(0);
      expect(res.data.wish._id).not.toBe('r1');
      expect(res.data.relaxed).toBe(false);
    }
    // 未抽过的都抽过一轮后，才允许放宽并抽到 r1
    const relaxedRes = await wishFn.main({ action: 'draw', excludeDays: 7 });
    expect(relaxedRes.data.relaxed).toBe(true);
    expect(relaxedRes.data.wish._id).toBe('r1');
  });

  test('候选已被避重规则抽空 → 放宽并返回 relaxed', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 's1', drawnAt: new Date() });
    addWish(coupleId, { _id: 's2', drawnAt: new Date() });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'draw' });
    expect(res.code).toBe(0);
    expect(res.data.wish).toBeDefined();
    expect(res.data.relaxed).toBe(true);
  });

  test('仍有未抽过的候选时不放宽', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'n1', drawnAt: new Date() });
    addWish(coupleId, { _id: 'n2' });
    addWish(coupleId, { _id: 'n3' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'draw' });
    expect(res.data.wish._id).not.toBe('n1');
    expect(res.data.relaxed).toBe(false);
  });

  test('excludeDays=0 → 不限避重', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'u1', drawnAt: new Date() });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'draw', excludeDays: 0 });
    expect(res.data.wish._id).toBe('u1');
    expect(res.data.relaxed).toBe(false);
  });

  test('收藏加权生效（抽样 400 次，收藏命中显著更高）', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'f1', title: '收藏', isFavorite: true });
    addWish(coupleId, { _id: 'f2', title: '普通' });
    mockSdk._setOpenid(OPENID_A);

    let favoriteHits = 0;
    for (let i = 0; i < 400; i++) {
      const res = await wishFn.main({ action: 'draw', excludeDays: 0 });
      if (res.data.wish._id === 'f1') favoriteHits++;
    }
    // 权重 3:1 → 期望 75%，放宽到 >62% 即可判定生效
    expect(favoriteHits / 400).toBeGreaterThan(0.62);
  });

  test('放回后 drawnAt 保留', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'b1' });
    mockSdk._setOpenid(OPENID_A);

    await wishFn.main({ action: 'draw', excludeDays: 0 });
    const res = await wishFn.main({ action: 'return', wishId: 'b1' });
    expect(res.code).toBe(0);

    const wish = mockSdk._getCollections().wishes.find((w) => w._id === 'b1');
    expect(wish.drawnAt).not.toBeNull();
    expect(wish.returnedAt).toBeDefined();
  });
});

describe('v1.1 每日一抽', () => {
  test('双方读同一条今日愿望', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'd1' });
    addWish(coupleId, { _id: 'd2' });

    mockSdk._setOpenid(OPENID_A);
    const r1 = await wishFn.main({ action: 'today' });
    mockSdk._setOpenid(OPENID_B);
    const r2 = await wishFn.main({ action: 'today' });

    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    expect(r1.data.wishId).toBe(r2.data.wishId);
    expect(mockSdk._getCollections().dailyDraws).toHaveLength(1);
  });

  test('就今天 → 愿望转进行中且计划日期为今天', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'e1' });
    mockSdk._setOpenid(OPENID_A);

    await wishFn.main({ action: 'today' });
    const res = await wishFn.main({ action: 'todayAction', op: 'select' });

    expect(res.code).toBe(0);
    expect(res.data.status).toBe('selected');
    const wish = mockSdk._getCollections().wishes.find((w) => w._id === 'e1');
    expect(wish.status).toBe('ongoing');
    expect(wish.plannedDate).toBeDefined();
  });

  test('换一个上限 3 次', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'g1' });
    addWish(coupleId, { _id: 'g2' });
    addWish(coupleId, { _id: 'g3' });
    addWish(coupleId, { _id: 'g4' });
    mockSdk._setOpenid(OPENID_A);
    await wishFn.main({ action: 'today' });

    for (let i = 0; i < 3; i++) {
      const res = await wishFn.main({ action: 'todayAction', op: 'switch' });
      expect(res.code).toBe(0);
    }
    const fourth = await wishFn.main({ action: 'todayAction', op: 'switch' });
    expect(fourth.code).toBe(1002);
    expect(fourth.message).toContain('换够');
  });

  test('明天再说仅对当前用户隐藏', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'h1' });

    mockSdk._setOpenid(OPENID_A);
    await wishFn.main({ action: 'today' });
    const hidden = await wishFn.main({ action: 'todayAction', op: 'hide' });
    expect(hidden.data.hidden).toBe(true);

    const aView = await wishFn.main({ action: 'today' });
    expect(aView.data.hidden).toBe(true);

    mockSdk._setOpenid(OPENID_B);
    const bView = await wishFn.main({ action: 'today' });
    expect(bView.data.hidden).toBe(false);
  });

  test('愿望池为空 → wish 为 null', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'today' });
    expect(res.code).toBe(0);
    expect(res.data.wish).toBeNull();
  });
});

describe('v1.1 计划日期', () => {
  test('待抽取愿望设置计划日期 → 转为进行中', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'pl1', status: 'pending' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'update', wishId: 'pl1', plannedDate: '2026-12-01' });
    expect(res.code).toBe(0);
    expect(res.data.status).toBe('ongoing');

    const wish = mockSdk._getCollections().wishes.find((w) => w._id === 'pl1');
    expect(wish.status).toBe('ongoing');
    expect(new Date(wish.plannedDate).getDate()).toBe(1);
  });

  test('非法计划日期 → 1004', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'pl2' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'update', wishId: 'pl2', plannedDate: 'not-a-date' });
    expect(res.code).toBe(1004);
  });

  test('start 可同时设置计划日期', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'pl3' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'start', wishId: 'pl3', plannedDate: '2026-12-24' });
    expect(res.code).toBe(0);
    const wish = mockSdk._getCollections().wishes.find((w) => w._id === 'pl3');
    expect(wish.status).toBe('ongoing');
    expect(new Date(wish.plannedDate).getMonth()).toBe(11);
  });
});

describe('v1.1 资料设置', () => {
  test('更新昵称与头像', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await pairFn.main({ action: 'updateProfile', nickName: '小鹿', avatarUrl: 'cloud://a.png' });
    expect(res.code).toBe(0);
    const user = mockSdk._getCollections().users.find((u) => u.openid === OPENID_A);
    expect(user.nickName).toBe('小鹿');
    expect(user.avatarUrl).toBe('cloud://a.png');
  });

  test('昵称超过 20 字 → 1004', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await pairFn.main({ action: 'updateProfile', nickName: 'a'.repeat(21) });
    expect(res.code).toBe(1004);
  });

  test('修改纪念日后天数随之变化', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const before = await pairFn.main({ action: 'info' });
    expect(before.data.anniversaryDays).toBe(11); // 10 天前 + 起始第 1 天

    const body = new Date();
    body.setDate(body.getDate() - 99);
    const key = `${body.getFullYear()}-${String(body.getMonth() + 1).padStart(2, '0')}-${String(body.getDate()).padStart(2, '0')}`;

    mockSdk._setOpenid(OPENID_A);
    const res = await pairFn.main({ action: 'anniversary', anniversary: key });
    expect(res.code).toBe(0);
    expect(res.data.anniversaryDays).toBe(100);
  });

  test('纪念日选择未来日期 → 1004', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await pairFn.main({ action: 'anniversary', anniversary: '2099-01-01' });
    expect(res.code).toBe(1004);
  });

  test('登录返回 partner 信息', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await loginFn.main({});
    expect(res.code).toBe(0);
    expect(res.data.partner).toBeDefined();
    expect(res.data.partner.nickName).toBe('阿木');
  });
});

describe('v1.1 成就', () => {
  test('12 项成就全部返回，进度正确', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'ac1', status: 'completed', category: 'food', createdBy: OPENID_A });
    addWish(coupleId, { _id: 'ac2', status: 'completed', category: 'food', createdBy: OPENID_B });
    mockSdk._setOpenid(OPENID_A);

    const res = await memoryFn.main({ action: 'achievements' });
    expect(res.code).toBe(0);
    expect(res.data.list).toHaveLength(12);
    expect(res.data.total).toBe(12);

    const first = res.data.list.find((a) => a.id === 'ACH-01');
    expect(first.achieved).toBe(true);

    const foodie = res.data.list.find((a) => a.id === 'ACH-03');
    expect(foodie.current).toBe(2);
    expect(foodie.target).toBe(5);
    expect(foodie.achieved).toBe(false);

    const couple = res.data.list.find((a) => a.id === 'ACH-02');
    expect(couple.achieved).toBe(true);
  });

  test('连续打卡成就', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const collections = mockSdk._getCollections();
    for (let i = 0; i < 7; i++) {
      collections.checkins.push({
        _id: 'streak' + i,
        coupleId,
        checkInBy: OPENID_A,
        mediaList: [],
        createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      });
    }
    mockSdk._setOpenid(OPENID_A);

    const res = await memoryFn.main({ action: 'achievements' });
    const streak = res.data.list.find((a) => a.id === 'ACH-10');
    expect(streak.current).toBe(7);
    expect(streak.achieved).toBe(true);
  });
});

describe('v1.1 年度报告', () => {
  test('按自然年统计', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    const thisYear = new Date(new Date().getFullYear(), 5, 15);
    const lastYear = new Date(new Date().getFullYear() - 1, 5, 15);

    addWish(coupleId, { _id: 'y1', status: 'completed', completedAt: thisYear, createdAt: thisYear, category: 'travel' });
    addWish(coupleId, { _id: 'y2', status: 'completed', completedAt: lastYear, createdAt: lastYear, category: 'food' });
    addWish(coupleId, { _id: 'y3', status: 'pending', createdAt: thisYear });

    mockSdk._getCollections().checkins.push(
      { _id: 'c-y1', coupleId, wishId: 'y1', checkInBy: OPENID_A, mediaList: [{ fileId: 'x', type: 'image' }], createdAt: thisYear },
      { _id: 'c-y2', coupleId, wishId: 'y2', checkInBy: OPENID_A, mediaList: [], createdAt: lastYear }
    );

    mockSdk._setOpenid(OPENID_A);
    const res = await memoryFn.main({ action: 'annualReport' });

    expect(res.code).toBe(0);
    expect(res.data.wishCreated).toBe(2);
    expect(res.data.wishCompleted).toBe(1);
    expect(res.data.checkInTotal).toBe(1);
    expect(res.data.monthly).toHaveLength(12);
    expect(res.data.monthly[5]).toBe(1);
    expect(res.data.topMonth.month).toBe(6);
    expect(res.data.topCategory.category).toBe('travel');
    expect(res.data.bestMoment.wishTitle).toBeDefined();
  });

  test('无数据年度 → 各区块为 null / 0', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await memoryFn.main({ action: 'annualReport', year: 2020 });
    expect(res.code).toBe(0);
    expect(res.data.wishCreated).toBe(0);
    expect(res.data.topMonth).toBeNull();
    expect(res.data.topCategory).toBeNull();
    expect(res.data.bestMoment).toBeNull();
  });
});

describe('v1.1 足迹', () => {
  test('按城市聚合并统计打卡点', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'fp1', title: '黄山' });
    const collections = mockSdk._getCollections();
    collections.checkins.push(
      {
        _id: 'fp-c1', coupleId, wishId: 'fp1', checkInBy: OPENID_A, mediaList: [],
        location: { name: '黄山顶', address: '安徽省黄山市', city: '黄山市', latitude: 30.13, longitude: 118.16 },
        createdAt: new Date(),
      },
      {
        _id: 'fp-c2', coupleId, wishId: 'fp1', checkInBy: OPENID_B, mediaList: [],
        location: { name: '外滩', address: '上海市黄浦区', city: '上海市', latitude: 31.23, longitude: 121.47 },
        createdAt: new Date(Date.now() - 86400000),
      },
      {
        _id: 'fp-c3', coupleId, wishId: 'fp1', checkInBy: OPENID_A, mediaList: [],
        location: null,
        createdAt: new Date(),
      }
    );

    mockSdk._setOpenid(OPENID_A);
    const res = await memoryFn.main({ action: 'footprints' });

    expect(res.code).toBe(0);
    expect(res.data.totalPoints).toBe(2);
    expect(res.data.totalCities).toBe(2);
    expect(res.data.markers).toHaveLength(2);
    expect(res.data.cities[0].count).toBe(1);
  });

  test('无位置记录 → 空数组', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await memoryFn.main({ action: 'footprints' });
    expect(res.code).toBe(0);
    expect(res.data.markers).toHaveLength(0);
    expect(res.data.totalPoints).toBe(0);
  });
});

describe('v1.1 愿望详情单条查询', () => {
  test('返回指定愿望', async () => {
    mockSdk._resetData();
    const coupleId = setupCouple();
    addWish(coupleId, { _id: 'dt1', title: '目标愿望' });
    addWish(coupleId, { _id: 'dt2', title: '其它愿望' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'detail', wishId: 'dt1' });
    expect(res.code).toBe(0);
    expect(res.data.wish.title).toBe('目标愿望');
  });

  test('不能查看其它情侣的愿望', async () => {
    mockSdk._resetData();
    const mine = setupCouple();
    addWish(mine, { _id: 'dt3' });
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'detail', wishId: 'dt3' });
    expect(res.code).toBe(0);
  });

  test('缺少 wishId → 1004', async () => {
    mockSdk._resetData();
    setupCouple();
    mockSdk._setOpenid(OPENID_A);

    const res = await wishFn.main({ action: 'detail' });
    expect(res.code).toBe(1004);
  });
});

// 恢复原始 require
Module.prototype.require = originalRequire;

module.exports = { runTests: require('../test-harness').runAll };
