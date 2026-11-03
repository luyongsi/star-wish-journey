// services/pair.js — 贴贴服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 发起贴贴：生成贴贴码
 * @returns {Promise<{ couple: Object, pairCode: string }>}
 */
function createPair() {
  return call(cloudFunctions.pair, { action: 'create' }, { loadingText: '生成贴贴码...' });
}

/**
 * 加入贴贴
 * @param {string} pairCode - 6位贴贴码
 * @returns {Promise<{ couple: Object }>}
 */
function joinPair(pairCode) {
  return call(cloudFunctions.pair, { action: 'join', pairCode }, { loadingText: '贴贴中...' });
}

/**
 * 解除贴贴
 * @returns {Promise<void>}
 */
function unbind() {
  return call(cloudFunctions.pair, { action: 'unbind' }, { loadingText: '解除贴贴...' });
}

/**
 * 获取贴贴信息（含伴侣信息和在一起天数）
 * @returns {Promise<{ couple: Object, partner: Object|null, currentUser: Object, anniversaryDays: number }>}
 */
function getCoupleInfo() {
  return call(cloudFunctions.pair, { action: 'info' }, { loading: false });
}

/**
 * 更新本人资料
 * @param {Object} params - { nickName?, avatarUrl? }
 * @returns {Promise<Object>}
 */
function updateProfile(params) {
  return call(cloudFunctions.pair, { action: 'updateProfile', ...params }, { loadingText: '保存中...' });
}

/**
 * 修改在一起纪念日
 * @param {string|null} anniversary - 'YYYY-MM-DD'
 * @returns {Promise<Object>}
 */
function updateAnniversary(anniversary) {
  return call(cloudFunctions.pair, { action: 'anniversary', anniversary }, { loadingText: '保存中...' });
}

module.exports = {
  createPair,
  joinPair,
  unbind,
  getCoupleInfo,
  updateProfile,
  updateAnniversary,
};
