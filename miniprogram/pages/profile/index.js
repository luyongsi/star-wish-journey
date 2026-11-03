// pages/profile/index.js — 我的页（v1.1）
const pairService = require('../../services/pair');
const store = require('../../utils/store');
const { call } = require('../../utils/request');
const { cloudFunctions } = require('../../utils/constants');

/**
 * 构造展示信息：头像、昵称、占位首字
 * @param {Object|null} user
 * @param {string} fallback - 昵称缺省文案（「我」/「Ta」）
 * @returns {{ avatarUrl: string, name: string, placeholder: string }}
 */
function buildDisplay(user, fallback) {
  const source = user || {};
  const nickName = String(source.nickName || '').trim();
  return {
    avatarUrl: source.avatarUrl || '',
    name: nickName || fallback,
    placeholder: nickName ? nickName.charAt(0) : fallback,
  };
}

Page({
  data: {
    userInfo: null,
    coupleInfo: null,
    partnerInfo: null,
    myDisplay: { avatarUrl: '', name: '我', placeholder: '我' },
    partnerDisplay: { avatarUrl: '', name: 'Ta', placeholder: 'Ta' },
    anniversaryDays: 0,
    showEditGuide: false,
    stats: {
      wishTotal: 0,
      wishCompleted: 0,
      checkInTotal: 0,
    },
    loading: true,
  },

  onLoad() {
    this._unbindLoginReady = null;
  },

  /**
   * 每次进入/返回本页都重新拉取身份与统计（PRD §8.1.3）
   */
  onShow() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      this._onLoginReady();
      return;
    }

    // 登录尚未完成：只订阅一次，就绪后补拉
    if (!this._unbindLoginReady) {
      this._unbindLoginReady = () => {
        this._unbindLoginReady = null;
        this._onLoginReady();
      };
      store.on('loginReady', this._unbindLoginReady);
    }
  },

  onUnload() {
    if (this._unbindLoginReady) {
      store.off('loginReady', this._unbindLoginReady);
      this._unbindLoginReady = null;
    }
  },

  _onLoginReady() {
    if (!store.isPaired()) {
      wx.reLaunch({ url: '/pages/pair/bind' });
      return;
    }
    this.fetchProfileData();
  },

  /**
   * 获取个人页数据（身份 + 统计）
   */
  fetchProfileData() {
    pairService.getCoupleInfo()
      .then((res) => {
        const currentUser = res.currentUser || store.getUser();
        const partner = res.partner || null;

        this.setData({
          userInfo: currentUser,
          coupleInfo: res.couple || null,
          partnerInfo: partner,
          myDisplay: buildDisplay(currentUser, '我'),
          partnerDisplay: buildDisplay(partner, 'Ta'),
          showEditGuide: !String((currentUser && currentUser.nickName) || '').trim(),
          anniversaryDays: res.anniversaryDays || 0,
          loading: false,
        });

        this._fetchStats();
      })
      .catch((err) => {
        console.error('[profile] 获取信息失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 获取统计数据
   */
  _fetchStats() {
    call(cloudFunctions.stats, { action: 'overview' }, { loading: false })
      .then((data) => {
        this.setData({
          stats: {
            wishTotal: data.wishTotal || 0,
            wishCompleted: data.wishCompleted || 0,
            checkInTotal: data.checkInTotal || 0,
          },
        });
      })
      .catch((err) => console.error('[profile] 获取统计失败:', err));
  },

  /**
   * 进入编辑资料页
   */
  handleGoEdit() {
    wx.navigateTo({ url: '/pages/profile/edit' });
  },

  /**
   * 进入回忆录（回忆是 TabBar 页，必须用 switchTab）
   */
  handleGoMemory() {
    wx.switchTab({ url: '/pages/memory/index' });
  },

  /**
   * 进入愿望灵感库
   */
  handleGoInspiration() {
    wx.navigateTo({ url: '/pages/inspiration/index' });
  },

  /**
   * 进入设置
   */
  handleGoSettings() {
    wx.navigateTo({ url: '/pages/profile/settings' });
  },
});
