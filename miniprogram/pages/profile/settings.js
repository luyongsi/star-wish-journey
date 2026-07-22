// pages/profile/settings.js — 设置页
const pairService = require('../../services/pair');
const store = require('../../utils/store');

Page({
  data: {
    showUnbindConfirm: false,
    unbinding: false,
  },

  /**
   * 显示解除贴贴确认
   */
  handleShowUnbind() {
    this.setData({ showUnbindConfirm: true });
  },

  /**
   * 取消解除
   */
  handleCancelUnbind() {
    this.setData({ showUnbindConfirm: false });
  },

  /**
   * 确认解除贴贴
   */
  handleConfirmUnbind() {
    if (this.data.unbinding) return;
    this.setData({ unbinding: true });

    pairService.unbind()
      .then(() => {
        // 清空全局状态
        store.setCouple(null);
        const app = getApp();
        app.globalData.coupleInfo = null;

        wx.showToast({ title: '已解除贴贴', icon: 'success' });

        setTimeout(() => {
          wx.reLaunch({ url: '/pages/pair/bind' });
        }, 1500);
      })
      .catch((err) => {
        console.error('[settings] 解除贴贴失败:', err);
        this.setData({ unbinding: false });
      });
  },

  /**
   * 关于我们
   */
  handleAbout() {
    wx.showModal({
      title: '关于心愿拾光',
      content: '心愿拾光 v1.0.0\n\n记录你们每一个甜蜜心愿，一起抽取、打卡、回忆。\n\n用爱点亮每一个心愿 ✨',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#FF6B9D',
    });
  },

  handleStopPropagation() {},
});
