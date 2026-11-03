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

/**
 * 足迹：带位置的打卡点 + 城市聚合
 * @returns {Promise<{ markers: Array, cities: Array, totalPoints: number, totalCities: number }>}
 */
function getFootprints() {
  return call(cloudFunctions.memory, { action: 'footprints' }, { loading: false });
}

/**
 * 成就墙
 * @param {boolean} [refresh] - 是否强制重算（打卡/建愿望后传 true）
 * @returns {Promise<{ list: Array, achievedCount: number, total: number }>}
 */
function getAchievements(refresh) {
  return call(cloudFunctions.memory, { action: 'achievements', refresh: !!refresh }, { loading: false });
}

/**
 * 年度报告
 * @param {number} [year]
 * @returns {Promise<Object>}
 */
function getAnnualReport(year) {
  return call(cloudFunctions.memory, { action: 'annualReport', year }, { loading: false });
}

module.exports = {
  getTimeline,
  getMemoryDetail,
  getFootprints,
  getAchievements,
  getAnnualReport,
};
