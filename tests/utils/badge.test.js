// tests/utils/badge.test.js — 红点与动态统计测试
const { describe, test, expect } = require('../test-harness');

let _storage = {};
global.wx = {
  getStorageSync: (k) => _storage[k],
  setStorageSync: (k, v) => { _storage[k] = v; },
  setTabBarBadge: () => {},
  removeTabBarBadge: () => {},
};

const badge = require('../../miniprogram/utils/badge');

const ME = 'me';
const PARTNER = 'partner';

describe('utils/badge - countPartnerUpdates', () => {
  test('只统计对方的记录', () => {
    const wishes = [
      { _id: 'w1', title: '我的愿望', createdBy: ME, createdAt: new Date() },
      { _id: 'w2', title: 'TA的愿望', createdBy: PARTNER, createdAt: new Date() },
    ];
    const r = badge.countPartnerUpdates(wishes, [], ME);
    expect(r.recent.every((i) => i.text.indexOf('TA') !== -1)).toBe(true);
    expect(r.recent.some((i) => i.title === '我的愿望')).toBe(false);
  });

  test('超过 7 天的记录不统计', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const wishes = [{ _id: 'w1', title: '旧愿望', createdBy: PARTNER, createdAt: old }];
    const r = badge.countPartnerUpdates(wishes, [], ME);
    expect(r.recent).toHaveLength(0);
  });

  test('完成愿望与打卡记录都会产生动态', () => {
    const wishes = [{
      _id: 'w1', title: '一起吃火锅', createdBy: PARTNER, createdAt: new Date(),
      status: 'completed', completedAt: new Date(),
    }];
    const checkins = [{
      _id: 'c1', wishId: 'w1', checkInBy: PARTNER, createdAt: new Date(),
      mediaList: [{ fileId: 'f1' }, { fileId: 'f2' }],
    }];
    const r = badge.countPartnerUpdates(wishes, checkins, ME);
    const texts = r.recent.map((i) => i.text);
    expect(texts.some((t) => t.indexOf('完成了') !== -1)).toBe(true);
    expect(texts.some((t) => t.indexOf('2 张照片') !== -1)).toBe(true);
  });

  test('纯文字记录文案为「留了一条记录」', () => {
    const checkins = [{
      _id: 'c1', wishId: 'w1', checkInBy: PARTNER, createdAt: new Date(), mediaList: [],
    }];
    const r = badge.countPartnerUpdates([], checkins, ME);
    expect(r.recent[0].text).toContain('留了一条记录');
  });

  test('按时间倒序', () => {
    const now = Date.now();
    const checkins = [
      { _id: 'c1', checkInBy: PARTNER, createdAt: new Date(now - 5000), mediaList: [] },
      { _id: 'c2', checkInBy: PARTNER, createdAt: new Date(now), mediaList: [] },
    ];
    const r = badge.countPartnerUpdates([], checkins, ME);
    expect(r.recent[0].at).toBeGreaterThan(r.recent[1].at);
  });
});

describe('utils/badge - 已读标记', () => {
  test('未读计数随已读时间清零', () => {
    _storage = {};
    const checkins = [{ _id: 'c1', checkInBy: PARTNER, createdAt: new Date(), mediaList: [] }];

    const before = badge.countPartnerUpdates([], checkins, ME);
    expect(before.unread).toBe(1);

    badge.markRead();
    const after = badge.countPartnerUpdates([], checkins, ME);
    expect(after.unread).toBe(0);
  });

  test('没有已读记录时全部算未读', () => {
    _storage = {};
    const checkins = [
      { _id: 'c1', checkInBy: PARTNER, createdAt: new Date(), mediaList: [] },
      { _id: 'c2', checkInBy: PARTNER, createdAt: new Date(), mediaList: [] },
    ];
    const r = badge.countPartnerUpdates([], checkins, ME);
    expect(r.unread).toBe(2);
  });
});

describe('utils/badge - refreshBadges', () => {
  test('0 计数不报错', () => {
    let thrown = null;
    try {
      badge.refreshBadges({ poolsUnread: 0, todayDue: 0 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeNull();
  });

  test('大于 9 显示 9+', () => {
    const calls = [];
    global.wx.setTabBarBadge = (opts) => calls.push(opts);
    badge.refreshBadges({ poolsUnread: 12, todayDue: 3 });
    expect(calls[0].text).toBe('9+');
    expect(calls[1].text).toBe('3');
  });
});
