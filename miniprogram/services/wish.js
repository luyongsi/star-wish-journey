// services/wish.js — 愿望服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 创建愿望
 * @param {Object} params - { title, description, category }
 * @returns {Promise<Object>} 新建愿望
 */
function createWish(params) {
  return call(cloudFunctions.wish, { action: 'create', ...params }, { loadingText: '添加中...' });
}

/**
 * 查询单个愿望详情
 * @param {string} wishId
 * @returns {Promise<{ wish: Object }>}
 */
function getWishDetail(wishId) {
  return call(cloudFunctions.wish, { action: 'detail', wishId }, { loading: false });
}

/**
 * 更新愿望
 * @param {string} wishId
 * @param {Object} params - { title?, description?, category?, isFavorite? }
 * @returns {Promise<Object>} 更新后的愿望
 */
function updateWish(wishId, params) {
  return call(cloudFunctions.wish, { action: 'update', wishId, ...params }, { loadingText: '更新中...' });
}

/**
 * 删除愿望
 * @param {string} wishId
 * @returns {Promise<void>}
 */
function deleteWish(wishId) {
  return call(cloudFunctions.wish, { action: 'delete', wishId }, { loadingText: '删除中...' });
}

/**
 * 查询愿望列表
 * @param {Object} [filters] - { category?, status? }
 * @returns {Promise<{ wishes: Array, stats: Object }>}
 */
function listWishes(filters = {}) {
  return call(cloudFunctions.wish, { action: 'list', ...filters }, { loading: false });
}

/**
 * 抽取愿望
 * @param {Object} [options] - { category?, excludeDays? }
 * @returns {Promise<{ wish: Object|null }>}
 */
function drawWish(options = {}) {
  return call(cloudFunctions.wish, { action: 'draw', ...options }, { loadingText: '抽取中...' });
}

/**
 * 获取今日愿望（每天每对情侣同一个）
 * @returns {Promise<Object>}
 */
function getTodayWish() {
  return call(cloudFunctions.wish, { action: 'today' }, { loading: false });
}

/**
 * 今日愿望操作
 * @param {'select'|'switch'|'hide'} op
 * @returns {Promise<Object>}
 */
function todayWishAction(op) {
  const loadingText = op === 'switch' ? '换一个...' : '';
  return call(
    cloudFunctions.wish,
    { action: 'todayAction', op },
    op === 'hide' ? { loading: false } : { loadingText }
  );
}

/**
 * 设置计划日期（待抽取的愿望设置后转为进行中）
 * @param {string} wishId
 * @param {string|null} plannedDate - 'YYYY-MM-DD'
 * @returns {Promise<Object>}
 */
function setPlannedDate(wishId, plannedDate) {
  return call(cloudFunctions.wish, { action: 'update', wishId, plannedDate }, { loading: false });
}

/**
 * 开始执行愿望（pending → ongoing）
 * @param {string} wishId
 * @param {string|null} [plannedDate] - 'YYYY-MM-DD'，可选，同一次调用内写入
 * @returns {Promise<Object>} 更新后的愿望
 */
function startWish(wishId, plannedDate) {
  const data = { action: 'start', wishId };
  if (plannedDate !== undefined) {
    data.plannedDate = plannedDate;
  }
  return call(cloudFunctions.wish, data, { loadingText: '开始执行...' });
}

/**
 * 放回愿望（清空 drawnAt）
 * @param {string} wishId
 * @returns {Promise<void>}
 */
function returnWish(wishId) {
  return call(cloudFunctions.wish, { action: 'return', wishId }, { loading: false });
}

module.exports = {
  createWish,
  getWishDetail,
  updateWish,
  deleteWish,
  listWishes,
  drawWish,
  getTodayWish,
  todayWishAction,
  setPlannedDate,
  startWish,
  returnWish,
};
