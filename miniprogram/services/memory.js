// services/memory.js — 回忆录服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 获取时间线（分页，按月份分组）
 * @param {number} [page=1]
 * @param {number} [pageSize=20]
 * @returns {Promise<{ groups: Array, hasMore: boolean, total: number }>}
 */
function getTimeline(page = 1, pageSize = 20) {
  return call(cloudFunctions.memory, { action: 'timeline', page, pageSize }, { loading: false });
}

/**
 * 获取回忆录详情
 * @param {string} checkInId
 * @returns {Promise<{ checkIn: Object, wish: Object }>}
 */
function getMemoryDetail(checkInId) {
  return call(cloudFunctions.memory, { action: 'detail', checkInId }, { loading: false });
}

module.exports = {
  getTimeline,
  getMemoryDetail,
};
