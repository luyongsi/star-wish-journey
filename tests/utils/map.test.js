// tests/utils/map.test.js — 地图坐标工具测试
const { describe, test, expect } = require('../test-harness');
const mapUtil = require('../../miniprogram/utils/map');

const beijing = { latitude: 39.9, longitude: 116.4 };
const shanghai = { latitude: 31.23, longitude: 121.47 };
const sanya = { latitude: 18.25, longitude: 109.51 };

describe('utils/map - bounds', () => {
  test('空数组返回 null', () => {
    expect(mapUtil.bounds([])).toBeNull();
  });

  test('包含全部点', () => {
    const b = mapUtil.bounds([beijing, shanghai]);
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minY).toBeLessThan(b.maxY);
  });
});

describe('utils/map - center', () => {
  test('空数组返回默认中心', () => {
    const c = mapUtil.center([]);
    expect(typeof c.latitude).toBe('number');
    expect(typeof c.longitude).toBe('number');
  });

  test('两个点的中心', () => {
    const c = mapUtil.center([beijing, shanghai]);
    expect(Math.abs(c.latitude - (39.9 + 31.23) / 2) < 0.01).toBe(true);
    expect(Math.abs(c.longitude - (116.4 + 121.47) / 2) < 0.01).toBe(true);
  });
});

describe('utils/map - calcScale', () => {
  test('范围越大缩放级别越小', () => {
    const near = mapUtil.calcScale([beijing, { latitude: 39.95, longitude: 116.45 }]);
    const far = mapUtil.calcScale([beijing, sanya]);
    expect(near).toBeGreaterThan(far);
  });

  test('缩放级别在 3~16 之间', () => {
    const s = mapUtil.calcScale([beijing, shanghai, sanya]);
    expect(s).toBeGreaterThanOrEqual(3);
    expect(s).toBeLessThanOrEqual(16);
  });

  test('空点返回默认缩放', () => {
    expect(mapUtil.calcScale([])).toBe(5);
  });
});

describe('utils/map - viewport', () => {
  test('返回 center 与 scale', () => {
    const vp = mapUtil.viewport([beijing, shanghai]);
    expect(vp.center.latitude).toBeDefined();
    expect(vp.scale).toBeGreaterThan(0);
  });

  test('单点也能出合理缩放', () => {
    const vp = mapUtil.viewport([beijing]);
    expect(vp.scale).toBeGreaterThanOrEqual(3);
  });
});
