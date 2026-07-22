// services/auth.js — 认证服务
const { call } = require('../utils/request');
const { cloudFunctions } = require('../utils/constants');

/**
 * 登录：调用 login 云函数
 * @returns {Promise<{ user: Object, couple: Object|null }>}
 */
function login() {
  return call(cloudFunctions.login, {}, { loading: false });
}

module.exports = {
  login,
};
