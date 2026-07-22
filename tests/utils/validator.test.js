// tests/utils/validator.test.js — 输入校验工具测试
const { describe, test, expect } = require('../test-harness');
const {
  validateWishTitle,
  validateWishDescription,
  validateCheckInNote,
  validatePairCode,
  validateCategory,
  validateNickName,
  validateWishCreate,
  validateCheckInCreate,
} = require('../../miniprogram/utils/validator');

describe('validateWishTitle', () => {
  test('有效标题应通过校验', () => {
    const result = validateWishTitle('去吃火锅');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('');
  });

  test('空字符串应不通过', () => {
    const result = validateWishTitle('');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('请输入');
  });

  test('纯空格字符串应不通过', () => {
    const result = validateWishTitle('   ');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('不能为空');
  });

  test('null 应不通过', () => {
    const result = validateWishTitle(null);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('请输入');
  });

  test('undefined 应不通过', () => {
    const result = validateWishTitle(undefined);
    expect(result.valid).toBe(false);
  });

  test('非字符串类型应不通过', () => {
    const result = validateWishTitle(123);
    expect(result.valid).toBe(false);
  });

  test('30个字符应通过（边界值）', () => {
    const result = validateWishTitle('a'.repeat(30));
    expect(result.valid).toBe(true);
  });

  test('31个字符应不通过（超出边界）', () => {
    const result = validateWishTitle('a'.repeat(31));
    expect(result.valid).toBe(false);
    expect(result.message).toContain('30');
  });

  test('前后有空格的有效标题应通过（trim后有效）', () => {
    const result = validateWishTitle('  去看电影  ');
    expect(result.valid).toBe(true);
  });
});

describe('validateWishDescription', () => {
  test('undefined 应通过（可选字段）', () => {
    const result = validateWishDescription(undefined);
    expect(result.valid).toBe(true);
  });

  test('空字符串应通过', () => {
    const result = validateWishDescription('');
    expect(result.valid).toBe(true);
  });

  test('200个字符应通过（边界值）', () => {
    const result = validateWishDescription('a'.repeat(200));
    expect(result.valid).toBe(true);
  });

  test('201个字符应不通过', () => {
    const result = validateWishDescription('a'.repeat(201));
    expect(result.valid).toBe(false);
    expect(result.message).toContain('200');
  });
});

describe('validateCheckInNote', () => {
  test('undefined 应通过（可选字段）', () => {
    const result = validateCheckInNote(undefined);
    expect(result.valid).toBe(true);
  });

  test('空字符串应通过', () => {
    const result = validateCheckInNote('');
    expect(result.valid).toBe(true);
  });

  test('500个字符应通过（边界值）', () => {
    const result = validateCheckInNote('a'.repeat(500));
    expect(result.valid).toBe(true);
  });

  test('501个字符应不通过', () => {
    const result = validateCheckInNote('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.message).toContain('500');
  });
});

describe('validatePairCode', () => {
  test('6位数字应通过', () => {
    const result = validatePairCode('123456');
    expect(result.valid).toBe(true);
  });

  test('5位数字应不通过', () => {
    const result = validatePairCode('12345');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('6位');
  });

  test('7位数字应不通过', () => {
    const result = validatePairCode('1234567');
    expect(result.valid).toBe(false);
  });

  test('包含字母应不通过', () => {
    const result = validatePairCode('12a456');
    expect(result.valid).toBe(false);
  });

  test('空字符串应不通过', () => {
    const result = validatePairCode('');
    expect(result.valid).toBe(false);
  });

  test('null 应不通过', () => {
    const result = validatePairCode(null);
    expect(result.valid).toBe(false);
  });

  test('前后有空格的6位数字应通过', () => {
    const result = validatePairCode('  123456  ');
    expect(result.valid).toBe(true);
  });
});

describe('validateCategory', () => {
  test('food 应通过', () => {
    expect(validateCategory('food').valid).toBe(true);
  });

  test('travel 应通过', () => {
    expect(validateCategory('travel').valid).toBe(true);
  });

  test('sport 应通过', () => {
    expect(validateCategory('sport').valid).toBe(true);
  });

  test('movie 应通过', () => {
    expect(validateCategory('movie').valid).toBe(true);
  });

  test('home 应通过', () => {
    expect(validateCategory('home').valid).toBe(true);
  });

  test('other 应通过', () => {
    expect(validateCategory('other').valid).toBe(true);
  });

  test('无效分类应不通过', () => {
    const result = validateCategory('invalid');
    expect(result.valid).toBe(false);
  });

  test('undefined 应不通过', () => {
    const result = validateCategory(undefined);
    expect(result.valid).toBe(false);
  });
});

describe('validateNickName', () => {
  test('有效昵称应通过', () => {
    const result = validateNickName('小明');
    expect(result.valid).toBe(true);
  });

  test('空字符串应不通过', () => {
    const result = validateNickName('');
    expect(result.valid).toBe(false);
  });

  test('纯空格应不通过', () => {
    const result = validateNickName('   ');
    expect(result.valid).toBe(false);
  });

  test('20个字符应通过（边界值）', () => {
    const result = validateNickName('a'.repeat(20));
    expect(result.valid).toBe(true);
  });

  test('21个字符应不通过', () => {
    const result = validateNickName('a'.repeat(21));
    expect(result.valid).toBe(false);
    expect(result.message).toContain('20');
  });

  test('null 应不通过', () => {
    const result = validateNickName(null);
    expect(result.valid).toBe(false);
  });
});

describe('validateWishCreate', () => {
  test('全部有效参数应通过', () => {
    const result = validateWishCreate({
      title: '去吃火锅',
      description: '周末去吃海底捞',
      category: 'food',
    });
    expect(result.valid).toBe(true);
  });

  test('缺少标题应不通过', () => {
    const result = validateWishCreate({
      title: '',
      description: 'test',
      category: 'food',
    });
    expect(result.valid).toBe(false);
  });

  test('无效分类应不通过', () => {
    const result = validateWishCreate({
      title: '测试',
      description: '',
      category: 'invalid',
    });
    expect(result.valid).toBe(false);
  });

  test('描述过长应不通过', () => {
    const result = validateWishCreate({
      title: '测试',
      description: 'a'.repeat(201),
      category: 'food',
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateCheckInCreate', () => {
  test('全部有效参数应通过', () => {
    const result = validateCheckInCreate({
      wishId: 'wish_123',
      note: '完成啦',
      mediaList: [{ tempFilePath: '/tmp/test.jpg' }],
    });
    expect(result.valid).toBe(true);
  });

  test('缺少 wishId 应不通过', () => {
    const result = validateCheckInCreate({
      wishId: '',
      note: '',
      mediaList: [{ tempFilePath: '/tmp/test.jpg' }],
    });
    expect(result.valid).toBe(false);
    expect(result.message).toContain('愿望ID');
  });

  test('空 mediaList 应不通过', () => {
    const result = validateCheckInCreate({
      wishId: 'wish_123',
      note: '',
      mediaList: [],
    });
    expect(result.valid).toBe(false);
    expect(result.message).toContain('图片或视频');
  });

  test('mediaList 为 undefined 应不通过', () => {
    const result = validateCheckInCreate({
      wishId: 'wish_123',
      note: '',
    });
    expect(result.valid).toBe(false);
  });

  test('备注过长应不通过', () => {
    const result = validateCheckInCreate({
      wishId: 'wish_123',
      note: 'a'.repeat(501),
      mediaList: [{ tempFilePath: '/tmp/test.jpg' }],
    });
    expect(result.valid).toBe(false);
  });
});

module.exports = { runTests: require('../test-harness').runAll };
