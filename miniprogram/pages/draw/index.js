// pages/draw/index.js — 抽取页
const wishService = require('../../services/wish');
const store = require('../../utils/store');

Page({
  data: {
    pendingWishes: [],
    currentWish: null,
    isDrawing: false,
    isAnimating: false,
    showResult: false,
    drawnWish: null,
    pendingCount: 0,
    loading: true,
  },

  onLoad() {
    this._checkLoginReady();
  },

  onShow() {
    if (store.isPaired()) {
      this.fetchPendingWishes();
    }
  },

  _checkLoginReady() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this.fetchPendingWishes();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this.fetchPendingWishes();
      });
    }
  },

  /**
   * 获取待抽取愿望
   */
  fetchPendingWishes() {
    wishService.listWishes({ status: 'pending' })
      .then((res) => {
        this.setData({
          pendingWishes: res.wishes,
          pendingCount: res.wishes.length,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[draw] 获取愿望失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 开始抽取
   */
  handleDraw() {
    if (this.data.isDrawing || this.data.pendingCount === 0) return;

    this.setData({ isDrawing: true, isAnimating: true, showResult: false });

    // 调用云函数抽取
    wishService.drawWish()
      .then((res) => {
        if (!res.wish) {
          this.setData({ isDrawing: false, isAnimating: false });
          wx.showToast({ title: '愿望池空了', icon: 'none' });
          return;
        }

        // 动画持续约2秒后显示结果
        setTimeout(() => {
          this.setData({
            isAnimating: false,
            showResult: true,
            drawnWish: res.wish,
            currentWish: res.wish,
          });
        }, 2000);
      })
      .catch((err) => {
        console.error('[draw] 抽取失败:', err);
        this.setData({ isDrawing: false, isAnimating: false });
      });
  },

  /**
   * 动画完成
   */
  handleAnimationDone() {
    this.setData({ isDrawing: false });
  },

  /**
   * 放回愿望
   */
  handleReturn() {
    if (!this.data.drawnWish) return;

    wishService.returnWish(this.data.drawnWish._id)
      .then(() => {
        wx.showToast({ title: '已放回', icon: 'success' });
        this.setData({ showResult: false, drawnWish: null, currentWish: null });
        this.fetchPendingWishes();
      })
      .catch((err) => console.error('[draw] 放回失败:', err));
  },

  /**
   * 去做（开始执行）
   */
  handleStart() {
    if (!this.data.drawnWish) return;

    wishService.startWish(this.data.drawnWish._id)
      .then(() => {
        wx.showToast({ title: '加油！去完成吧', icon: 'success' });
        this.setData({ showResult: false, drawnWish: null, currentWish: null });

        // 跳转到打卡页
        setTimeout(() => {
          wx.switchTab({ url: '/pages/checkin/index' });
        }, 1500);
      })
      .catch((err) => console.error('[draw] 开始失败:', err));
  },

  /**
   * 关闭结果弹窗
   */
  handleCloseResult() {
    // 如果不放回也不开始，自动放回
    if (this.data.drawnWish) {
      this.handleReturn();
    }
  },

  handleStopPropagation() {},
});
