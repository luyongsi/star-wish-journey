// utils/request.js — 云函数统一调用封装
// 统一 loading、code 解包、错误处理
const { errorMsgs } = require('./constants');

/**
 * 统一调用云函数
 * @param {string} name - 云函数名
 * @param {Object} data - 调用参数 { action, ...payload }
 * @param {Object} opts - 选项 { loading?: boolean, loadingText?: string }
 * @returns {Promise<any>} 成功返回 data 字段内容
 * @throws {Error} 失败抛出 Error（已通过 wx.showToast 提示）
 */
function call(name, data = {}, opts = {}) {
  const { loading = true, loadingText = '加载中...' } = opts;

  if (loading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success(res) {
        if (loading) wx.hideLoading();

        // 云函数调用本身成功
        if (!res.result) {
          const err = new Error('云函数返回空结果');
          reject(err);
          return;
        }

        const { code, data: resultData, message } = res.result;

        if (code === 0) {
          resolve(resultData);
        } else {
          // 业务错误
          const errMsg = message || errorMsgs[code] || '操作失败';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2500 });
          const err = new Error(errMsg);
          err.code = code;
          reject(err);
        }
      },
      fail(err) {
        if (loading) wx.hideLoading();
        console.error(`[request] 云函数 ${name} 调用失败:`, err);
        wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
        reject(err);
      },
    });
  });
}

module.exports = {
  call,
};
