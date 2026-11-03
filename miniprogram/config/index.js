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
 * 说明：wx.cloud.uploadFile 单个文件硬上限为 50MB（平台限制，无法调大），
 * 因此超过阈值的媒体会先尝试压缩，压缩后仍超限才拦截。
 */
const mediaLimits = {
  maxCount: 9,
  // 视频时长上限（wx.chooseMedia 的 maxDuration 最大 60 秒）
  maxVideoDuration: 30,
  // 平台硬上限：wx.cloud.uploadFile 单文件不得超过 50MB（图片/视频同一上限）
  maxUploadSize: 50 * 1024 * 1024,
  // 超过以下阈值时先压缩再上传
  videoCompressThreshold: 10 * 1024 * 1024, // 10MB
  imageCompressThreshold: 1.5 * 1024 * 1024, // 1.5MB
  // 压缩参数
  videoCompressQuality: 'medium', // low | medium | high
  imageCompressQuality: 75, // 0-100
  imageMaxWidth: 1920, // px，超出则等比压缩
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
