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
 * @returns {Promise<{ wish: Object|null }>}
 */
function drawWish() {
  return call(cloudFunctions.wish, { action: 'draw' }, { loadingText: '抽取中...' });
}

/**
 * 开始执行愿望（pending → ongoing）
 * @param {string} wishId
 * @returns {Promise<Object>} 更新后的愿望
 */
function startWish(wishId) {
  return call(cloudFunctions.wish, { action: 'start', wishId }, { loadingText: '开始执行...' });
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
  updateWish,
  deleteWish,
  listWishes,
  drawWish,
  startWish,
  returnWish,
};
