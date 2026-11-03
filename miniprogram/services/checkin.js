// services/checkin.js — 打卡服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 创建打卡（首次完成，媒体与备注均可空）
 * @param {Object} params - { wishId, note?, mediaList?, location? }
 * @returns {Promise<{ checkIn: Object, wish: Object }>}
 */
function createCheckIn(params) {
  return call(cloudFunctions.checkin, { action: 'create', ...params }, { loadingText: '提交打卡...' });
}

/**
 * 跳过内容直接完成（不产生记录）
 * @param {string} wishId
 * @returns {Promise<{ wish: Object }>}
 */
function completeWish(wishId) {
  return call(cloudFunctions.checkin, { action: 'complete', wishId }, { loading: false });
}

/**
 * 追加一条记录（愿望需已完成，内容至少一项）
 * @param {Object} params - { wishId, note?, mediaList?, location? }
 * @returns {Promise<{ checkIn: Object }>}
 */
function appendCheckIn(params) {
  return call(cloudFunctions.checkin, { action: 'append', ...params }, { loadingText: '保存中...' });
}

/**
 * 查询打卡列表
 * @returns {Promise<{ ongoing: Array, completed: Array }>}
 */
function listCheckIns() {
  return call(cloudFunctions.checkin, { action: 'list' }, { loading: false });
}

/**
 * 查询某个愿望下的全部打卡记录（按时间正序）
 * @param {string} wishId
 * @returns {Promise<{ records: Array, wish: Object }>}
 */
function listRecordsByWish(wishId) {
  return call(cloudFunctions.checkin, { action: 'listByWish', wishId }, { loading: false });
}

/**
 * 查询打卡详情
 * @param {string} checkInId
 * @returns {Promise<{ checkIn: Object, wish: Object }>}
 */
function getCheckInDetail(checkInId) {
  return call(cloudFunctions.checkin, { action: 'detail', checkInId }, { loading: false });
}

/**
 * 删除打卡记录
 * @param {string} checkInId
 * @param {boolean} [restoreWish=false] - 是否恢复愿望状态为 ongoing
 * @returns {Promise<void>}
 */
function deleteCheckIn(checkInId, restoreWish = false) {
  return call(cloudFunctions.checkin, { action: 'delete', checkInId, restoreWish }, { loadingText: '删除中...' });
}

module.exports = {
  createCheckIn,
  completeWish,
  appendCheckIn,
  listRecordsByWish,
  listCheckIns,
  getCheckInDetail,
  deleteCheckIn,
};
