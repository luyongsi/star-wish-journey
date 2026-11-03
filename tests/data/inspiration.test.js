// tests/data/inspiration.test.js — 灵感库模板完整性
const { describe, test, expect } = require('../test-harness');
const { TEMPLATES } = require('../../miniprogram/data/inspiration');

const VALID = ['food', 'travel', 'sport', 'movie', 'home', 'other'];

describe('data/inspiration - 模板定义', () => {
  test('共 40 条', () => {
    expect(TEMPLATES).toHaveLength(40);
  });

  test('分类分布符合 PRD', () => {
    const count = {};
    TEMPLATES.forEach((t) => { count[t.category] = (count[t.category] || 0) + 1; });
    expect(count.food).toBe(7);
    expect(count.travel).toBe(7);
    expect(count.sport).toBe(6);
    expect(count.movie).toBe(6);
    expect(count.home).toBe(7);
    expect(count.other).toBe(7);
  });

  test('分类值合法', () => {
    TEMPLATES.forEach((t) => {
      expect(VALID.indexOf(t.category) !== -1).toBe(true);
    });
  });

  test('key 唯一', () => {
    const keys = TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('标题不超过 20 字、描述不超过 30 字', () => {
    TEMPLATES.forEach((t) => {
      expect(t.title.length).toBeLessThanOrEqual(20);
      expect(t.desc.length).toBeLessThanOrEqual(30);
    });
  });

  test('同分类内标题不重复', () => {
    const keys = TEMPLATES.map((t) => `${t.category}||${t.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
