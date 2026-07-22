// pages/profile/index.js — 我的页
const pairService = require('../../services/pair');
const store = require('../../utils/store');
const { call } = require('../../utils/request');
const { cloudFunctions } = require('../../utils/constants');

Page({
  data: {
    userInfo: null,
    coupleInfo: null,
    partnerInfo: null,
    anniversaryDays: 0,
    stats: {
      wishTotal: 0,
      wishCompleted: 0,
      checkInTotal: 0,
    },
    loading: true,
  },

  onLoad() {
    this._checkLoginReady();
  },

  onShow() {
    if (store.isPaired()) {
      this.fetchProfileData();
    }
  },

  _checkLoginReady() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this.fetchProfileData();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this.fetchProfileData();
      });
    }
  },

  /**
   * 获取个人页数据
   */
  fetchProfileData() {
    // 获取贴贴信息
    pairService.getCoupleInfo()
      .then((res) => {
        this.setData({
          userInfo: res.currentUser,
          coupleInfo: res.couple,
          partnerInfo: res.partner,
          anniversaryDays: res.anniversaryDays,
          loading: false,
        });

        // 获取统计数据
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
            wishTotal: data.wishTotal,
            wishCompleted: data.wishCompleted,
            checkInTotal: data.checkInTotal,
          },
        });
      })
      .catch((err) => console.error('[profile] 获取统计失败:', err));
  },

  /**
   * 进入回忆录
   */
  handleGoMemory() {
    wx.navigateTo({ url: '/pages/memory/index' });
  },

  /**
   * 进入设置
   */
  handleGoSettings() {
    wx.navigateTo({ url: '/pages/profile/settings' });
  },
});
