// config/index.js — 环境配置：云环境ID、云存储路径模板、分类枚举

/**
 * 云开发环境ID
 * 部署时替换为实际的环境ID
 */
const envId = 'cloud1-d9gueab7jf0685ce4';

/**
 * 云存储路径模板
 * 格式: media/{images|videos}/{coupleId}/{checkInId}/{timestamp}_{index}.{ext}
 */
const cloudPathTemplates = {
  image: 'media/images/{coupleId}/{checkInId}/{timestamp}_{index}.{ext}',
  video: 'media/videos/{coupleId}/{checkInId}/{timestamp}_{index}.{ext}',
};

/**
 * 分类枚举（与 utils/constants.js 中的 category 保持同步）
 */
const categories = [
  { key: 'food', label: '美食', icon: '🍜' },
  { key: 'travel', label: '旅行', icon: '✈️' },
  { key: 'sport', label: '运动', icon: '⚽' },
  { key: 'movie', label: '电影', icon: '🎬' },
  { key: 'home', label: '居家', icon: '🏠' },
  { key: 'other', label: '其他', icon: '💝' },
];

/**
 * 愿望状态枚举
 */
const wishStatusMap = {
  pending: { label: '待抽取', color: '#74B9FF' },
  ongoing: { label: '进行中', color: '#FDCB6E' },
  completed: { label: '已完成', color: '#B2BEC3' },
};

/**
 * 情侣状态枚举
 */
const coupleStatusMap = {
  pending: '待加入',
  active: '已贴贴',
  unbound: '已解绑',
};

/**
 * 媒体限制
 */
const mediaLimits = {
  maxCount: 9,
  maxVideoDuration: 30,
  maxVideoSize: 50 * 1024 * 1024,
  maxImageSize: 10 * 1024 * 1024,
};

/**
 * 分页配置
 */
const pagination = {
  defaultPageSize: 20,
  maxPageSize: 100,
};

module.exports = {
  envId,
  cloudPathTemplates,
  categories,
  wishStatusMap,
  coupleStatusMap,
  mediaLimits,
  pagination,
};
