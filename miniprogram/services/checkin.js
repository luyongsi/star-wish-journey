// services/checkin.js — 打卡服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 创建打卡
 * @param {Object} params - { wishId, note, mediaList, location? }
 * @returns {Promise<{ checkIn: Object, wish: Object }>}
 */
function createCheckIn(params) {
  return call(cloudFunctions.checkin, { action: 'create', ...params }, { loadingText: '提交打卡...' });
}

/**
 * 查询打卡列表
 * @returns {Promise<{ ongoing: Array, completed: Array }>}
 */
function listCheckIns() {
  return call(cloudFunctions.checkin, { action: 'list' }, { loading: false });
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
  listCheckIns,
  getCheckInDetail,
  deleteCheckIn,
};
