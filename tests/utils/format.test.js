// tests/utils/format.test.js — 格式化工具测试
const { describe, test, expect } = require('../test-harness');
const {
  formatDate,
  formatDateTime,
  formatMonth,
  formatRelativeTime,
  truncate,
  daysBetween,
  formatFileSize,
} = require('../../miniprogram/utils/format');

describe('formatDate', () => {
  test('Date 对象应正确格式化', () => {
    const d = new Date(2024, 0, 15); // 2024-01-15
    expect(formatDate(d)).toBe('2024-01-15');
  });

  test('时间戳应正确格式化', () => {
    const ts = new Date(2024, 5, 1).getTime(); // 2024-06-01
    expect(formatDate(ts)).toBe('2024-06-01');
  });

  test('日期字符串应正确格式化', () => {
    expect(formatDate('2024-03-08T10:00:00')).toBe('2024-03-08');
  });

  test('无效日期应返回空字符串', () => {
    expect(formatDate('invalid')).toBe('');
  });

  test('null 返回 epoch 日期（JS特性：new Date(null) = 1970-01-01）', () => {
    // 注意：new Date(null) 在 JS 中创建 epoch（1970-01-01），非 NaN
    // 这是 JavaScript 语言行为，formatDate 未特殊处理 null
    const result = formatDate(null);
    expect(result).toBe('1970-01-01');
  });

  test('月份和日期应补零', () => {
    const d = new Date(2024, 0, 5); // 2024-01-05
    expect(formatDate(d)).toBe('2024-01-05');
  });
});

describe('formatDateTime', () => {
  test('应正确格式化日期和时间', () => {
    const d = new Date(2024, 0, 15, 14, 30);
    expect(formatDateTime(d)).toBe('2024-01-15 14:30');
  });

  test('小时和分钟应补零', () => {
    const d = new Date(2024, 0, 5, 9, 5);
    expect(formatDateTime(d)).toBe('2024-01-05 09:05');
  });

  test('无效日期应返回空字符串', () => {
    expect(formatDateTime('invalid')).toBe('');
  });
});

describe('formatMonth', () => {
  test('应正确格式化为 YYYY年MM月', () => {
    const d = new Date(2024, 2, 15); // 2024-03
    expect(formatMonth(d)).toBe('2024年03月');
  });

  test('1月应补零', () => {
    const d = new Date(2024, 0, 15);
    expect(formatMonth(d)).toBe('2024年01月');
  });

  test('无效日期应返回空字符串', () => {
    expect(formatMonth('invalid')).toBe('');
  });
});

describe('formatRelativeTime', () => {
  test('刚刚（<60秒）', () => {
    const now = new Date(Date.now() - 30 * 1000); // 30秒前
    expect(formatRelativeTime(now)).toBe('刚刚');
  });

  test('分钟前（<60分钟）', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000); // 5分钟前
    expect(formatRelativeTime(past)).toBe('5分钟前');
  });

  test('小时前（<24小时）', () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3小时前
    expect(formatRelativeTime(past)).toBe('3小时前');
  });

  test('天前（<7天）', () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2天前
    expect(formatRelativeTime(past)).toBe('2天前');
  });

  test('周前（7-29天）', () => {
    const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 14天 = 2周
    expect(formatRelativeTime(past)).toBe('2周前');
  });

  test('个月前（30-364天）', () => {
    const past = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90天 = 3个月
    expect(formatRelativeTime(past)).toBe('3个月前');
  });

  test('年前（>=365天）', () => {
    const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // ~400天 ≈ 1年
    expect(formatRelativeTime(past)).toBe('1年前');
  });

  test('无效日期应返回空字符串', () => {
    expect(formatRelativeTime('invalid')).toBe('');
  });
});

describe('truncate', () => {
  test('短文本应原样返回', () => {
    expect(truncate('短文本', 30)).toBe('短文本');
  });

  test('长文本应截断并加省略号', () => {
    const long = 'a'.repeat(50);
    const result = truncate(long, 30);
    expect(result.length).toBe(33); // 30 + '...'
    expect(result).toContain('...');
  });

  test('正好等于最大长度不应截断', () => {
    const text = 'a'.repeat(30);
    expect(truncate(text, 30)).toBe(text);
  });

  test('空值应返回空字符串', () => {
    expect(truncate('', 30)).toBe('');
  });

  test('null 应返回空字符串', () => {
    expect(truncate(null, 30)).toBe('');
  });

  test('undefined 应返回空字符串', () => {
    expect(truncate(undefined, 30)).toBe('');
  });

  test('默认 maxLen 应为30', () => {
    const long = 'a'.repeat(50);
    const result = truncate(long);
    expect(result).toContain('...');
    expect(result.length).toBe(33);
  });
});

describe('daysBetween', () => {
  test('同一天应返回0', () => {
    const d = new Date(2024, 0, 15);
    expect(daysBetween(d, d)).toBe(0);
  });

  test('相隔1天应返回1', () => {
    const start = new Date(2024, 0, 15);
    const end = new Date(2024, 0, 16);
    expect(daysBetween(start, end)).toBe(1);
  });

  test('相隔30天应返回30', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 31);
    expect(daysBetween(start, end)).toBe(30);
  });

  test('不传 endDate 默认使用当前时间', () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const result = daysBetween(recent);
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(6);
  });

  test('无效日期应返回0', () => {
    expect(daysBetween('invalid')).toBe(0);
  });
});

describe('formatFileSize', () => {
  test('小于1KB应显示B', () => {
    expect(formatFileSize(500)).toBe('500B');
  });

  test('正好1024应显示KB', () => {
    expect(formatFileSize(1024)).toBe('1.0KB');
  });

  test('1.5KB应正确显示', () => {
    expect(formatFileSize(1536)).toBe('1.5KB');
  });

  test('1MB应正确显示', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0MB');
  });

  test('2.5MB应正确显示', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5MB');
  });

  test('0字节应显示0B', () => {
    expect(formatFileSize(0)).toBe('0B');
  });
});

module.exports = { runTests: require('../test-harness').runAll };
