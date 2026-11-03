// tests/utils/date.test.js — 日期工具测试
const { describe, test, expect } = require('../test-harness');
const dateUtil = require('../../miniprogram/utils/date');

describe('utils/date - toDateKey', () => {
  test('输出 YYYY-MM-DD', () => {
    expect(dateUtil.toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateUtil.toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('非法日期返回空串', () => {
    expect(dateUtil.toDateKey('not-a-date')).toBe('');
  });
});

describe('utils/date - parseDateKey', () => {
  test('解析为本地 0 点', () => {
    const d = dateUtil.parseDateKey('2026-03-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });

  test('非法格式返回 null', () => {
    expect(dateUtil.parseDateKey('2026/03/09')).toBeNull();
    expect(dateUtil.parseDateKey('')).toBeNull();
  });
});

describe('utils/date - formatPlannedDate', () => {
  test('无计划日期', () => {
    const r = dateUtil.formatPlannedDate(null);
    expect(r.text).toBe('未计划');
    expect(r.overdue).toBe(false);
  });

  test('今天', () => {
    const r = dateUtil.formatPlannedDate(new Date());
    expect(r.text).toBe('今天');
    expect(r.isToday).toBe(true);
    expect(r.overdue).toBe(false);
  });

  test('明天', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const r = dateUtil.formatPlannedDate(tomorrow);
    expect(r.text).toBe('明天');
  });

  test('过期按天数提示', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const r = dateUtil.formatPlannedDate(past);
    expect(r.overdue).toBe(true);
    expect(r.text).toContain('已过期');
  });

  test('显式传入 overdueDays 优先', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const r = dateUtil.formatPlannedDate(past, 5);
    expect(r.text).toBe('已过期 5 天');
  });
});

describe('utils/date - daysSince', () => {
  test('起点当天算第 1 天', () => {
    expect(dateUtil.daysSince(new Date())).toBe(1);
  });

  test('昨天为第 2 天', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(dateUtil.daysSince(yesterday)).toBe(2);
  });

  test('空值返回 0', () => {
    expect(dateUtil.daysSince(null)).toBe(0);
  });
});

describe('utils/date - quickDateOptions', () => {
  test('包含今天与本周六', () => {
    const opts = dateUtil.quickDateOptions();
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0].label).toBe('今天');
    const labels = opts.map((o) => o.label);
    expect(labels).toContain('本周六');
  });
});
