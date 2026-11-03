// utils/constants.js — 常量枚举

/**
 * 愿望分类
 */
const category = {
  food: '美食',
  travel: '旅行',
  sport: '运动',
  movie: '电影',
  home: '居家',
  other: '其他',
};

/**
 * 分类对应 emoji 图标
 */
const categoryIcons = {
  food: '🍜',
  travel: '✈️',
  sport: '⚽',
  movie: '🎬',
  home: '🏠',
  other: '💝',
};

/**
 * 愿望状态
 */
const wishStatus = {
  pending: '待抽取',
  ongoing: '进行中',
  completed: '已完成',
};

/**
 * 情侣贴贴状态
 */
const coupleStatus = {
  pending: '待加入',
  active: '已贴贴',
  unbound: '已解绑',
};

/**
 * 错误码定义
 */
const errorCodes = {
  NOT_PAIRED: 1001,
  INVALID_STATUS: 1002,
  NO_PERMISSION: 1003,
  VALIDATION_ERROR: 1004,
};

/**
 * 错误码对应消息
 */
const errorMsgs = {
  1001: '还未贴贴，请先完成贴贴',
  1002: '当前状态不允许此操作',
  1003: '没有权限执行此操作',
  1004: '输入内容不合法',
};

/**
 * 云函数名
 */
const cloudFunctions = {
  login: 'login',
  pair: 'pair',
  wish: 'wish',
  checkin: 'checkin',
  memory: 'memory',
  stats: 'stats',
};

/**
 * 本地缓存键
 */
const storageKeys = {
  userInfo: 'wishpool_user_info',
  coupleInfo: 'wishpool_couple_info',
  poolView: 'wishpool_pool_view',
  drawCondition: 'wishpool_draw_condition',
  readAt: 'wishpool_read_at',
};

/**
 * 抽取条件枚举
 */
const excludeDaysOptions = [
  { key: 7, label: '7 天内' },
  { key: 3, label: '3 天内' },
  { key: 0, label: '不限' },
];

/**
 * 愿望池视图枚举
 */
const poolView = {
  list: 'list',
  waterfall: 'waterfall',
};

module.exports = {
  category,
  categoryIcons,
  wishStatus,
  coupleStatus,
  errorCodes,
  errorMsgs,
  cloudFunctions,
  storageKeys,
  excludeDaysOptions,
  poolView,
};
