// pages/checkin/index.js — 打卡页
const checkinService = require('../../services/checkin');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { categoryIcons } = require('../../utils/constants');
const { validateCheckInNote } = require('../../utils/validator');

Page({
  data: {
    ongoing: [],
    completed: [],
    showCheckInPanel: false,
    currentWish: null,
    mediaList: [],
    note: '',
    submitting: false,
    loading: true,
  },

  onLoad() {
    this._checkLoginReady();
  },

  onShow() {
    if (store.isPaired()) {
      this.fetchCheckIns();
    }
  },

  _checkLoginReady() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this.fetchCheckIns();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this.fetchCheckIns();
      });
    }
  },

  /**
   * 获取打卡列表
   */
  fetchCheckIns() {
    checkinService.listCheckIns()
      .then((res) => {
        // 为 ongoing 添加图标
        const ongoing = res.ongoing.map((w) => ({
          ...w,
          icon: categoryIcons[w.category] || '💝',
        }));

        this.setData({
          ongoing,
          completed: res.completed,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[checkin] 获取列表失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 打开打卡面板
   */
  handleOpenCheckIn(e) {
    const wish = e.currentTarget.dataset.wish;
    this.setData({
      showCheckInPanel: true,
      currentWish: wish,
      mediaList: [],
      note: '',
    });
  },

  /**
   * 关闭打卡面板
   */
  handleCloseCheckIn() {
    if (this.data.submitting) return;
    this.setData({ showCheckInPanel: false, currentWish: null, mediaList: [], note: '' });
  },

  /**
   * 媒体变化
   */
  handleMediaChange(e) {
    this.setData({ mediaList: e.detail.mediaList });
  },

  /**
   * 备注输入
   */
  handleNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  /**
   * 提交打卡
   */
  handleSubmitCheckIn() {
    if (this.data.submitting) return;
    const wish = this.data.currentWish;
    if (!wish) return;

    // 校验
    if (!this.data.mediaList || this.data.mediaList.length === 0) {
      wx.showToast({ title: '请至少添加一张图片或视频', icon: 'none' });
      return;
    }

    const noteCheck = validateCheckInNote(this.data.note);
    if (!noteCheck.valid) {
      wx.showToast({ title: noteCheck.message, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    const coupleId = store.getCoupleId();
    const checkInId = `temp_${Date.now()}`;
    const filePaths = this.data.mediaList.map((m) => m.tempFilePath);

    // 1. 上传媒体文件
    mediaService.uploadBatch(filePaths, coupleId, checkInId)
      .then((uploadedMedia) => {
        // 2. 创建打卡记录
        const mediaList = uploadedMedia.map((m) => ({
          fileId: m.fileId,
          type: m.type,
        }));

        return checkinService.createCheckIn({
          wishId: wish._id,
          note: this.data.note,
          mediaList,
          location: null,
        });
      })
      .then(() => {
        wx.showToast({ title: '打卡成功！', icon: 'success' });
        this.setData({
          submitting: false,
          showCheckInPanel: false,
          currentWish: null,
          mediaList: [],
          note: '',
        });
        this.fetchCheckIns();
      })
      .catch((err) => {
        console.error('[checkin] 打卡失败:', err);
        this.setData({ submitting: false });
      });
  },

  /**
   * 查看打卡详情
   */
  handleViewCheckIn(e) {
    const checkIn = e.detail.checkIn;
    wx.navigateTo({
      url: `/pages/checkin/detail?id=${checkIn._id}`,
    });
  },

  handleStopPropagation() {},
});
