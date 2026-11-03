// tests/utils/location.test.js — 位置与城市解析测试
const { describe, test, expect } = require('../test-harness');
const locationUtil = require('../../miniprogram/utils/location');

describe('utils/location - parseCity', () => {
  test('普通地级市', () => {
    expect(locationUtil.parseCity('广东省深圳市南山区科技园')).toBe('深圳市');
  });

  test('省会城市', () => {
    expect(locationUtil.parseCity('浙江省杭州市西湖区文三路')).toBe('杭州市');
  });

  test('直辖市', () => {
    expect(locationUtil.parseCity('上海市黄浦区南京东路')).toBe('上海市');
    expect(locationUtil.parseCity('北京市朝阳区三里屯')).toBe('北京市');
  });

  test('自治州', () => {
    expect(locationUtil.parseCity('四川省阿坝藏族羌族自治州九寨沟县')).toBe('阿坝藏族羌族自治州');
  });

  test('地区', () => {
    expect(locationUtil.parseCity('西藏自治区阿里地区普兰县')).toBe('阿里地区');
  });

  test('空值返回空串', () => {
    expect(locationUtil.parseCity('')).toBe('');
    expect(locationUtil.parseCity(null)).toBe('');
  });

  test('无法解析返回空串', () => {
    expect(locationUtil.parseCity('某个不知名的地方')).toBe('');
  });
});
