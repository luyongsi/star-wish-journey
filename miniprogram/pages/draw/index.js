// pages/draw/index.js — 抽取页（PRD §6.1）
const wishService = require('../../services/wish');
const store = require('../../utils/store');
const { categories } = require('../../config/index');
const { storageKeys, excludeDaysOptions } = require('../../utils/constants');
const { quickDateOptions, toDateKey, todayStart } = require('../../utils/date');

const DEFAULT_CONDITION = { category: 'all', excludeDays: 7 };
const VALID_CATEGORIES = ['all', ...categories.map((c) => c.key)];
const VALID_EXCLUDE_DAYS = excludeDaysOptions.map((o) => o.key);

/**
 * 读取本机保存的抽取条件，做一次合法性兜底
 * @returns {{ category: string, excludeDays: number }}
 */
function readSavedCondition() {
  try {
    const saved = wx.getStorageSync(storageKeys.drawCondition);
    if (saved && typeof saved === 'object') {
      return {
        category: VALID_CATEGORIES.includes(saved.category)
          ? saved.category
          : DEFAULT_CONDITION.category,
        excludeDays: VALID_EXCLUDE_DAYS.includes(saved.excludeDays)
          ? saved.excludeDays
          : DEFAULT_CONDITION.excludeDays,
      };
    }
  } catch (err) {
    console.error('[draw] 读取抽取条件失败:', err);
  }
  return { ...DEFAULT_CONDITION };
}

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
    // 抽取条件（PRD §6.1 C3）
    drawCondition: { ...DEFAULT_CONDITION },
    drawCategories: [{ key: 'all', label: '全部', icon: '🌟' }, ...categories],
    excludeDaysOptions,
    relaxedTip: '',
    // 自选计划日期（PRD §6.1 C5）
    showDatePicker: false,
    customDate: '',
    minDate: '',
  },

  onLoad() {
    this._starting = false;
    this.setData({
      drawCondition: readSavedCondition(),
      minDate: toDateKey(todayStart()),
      customDate: toDateKey(todayStart()),
    });
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
   * 获取待抽取愿望（按当前分类过滤，用于「剩余数量」与动画池）
   */
  fetchPendingWishes() {
    const { category } = this.data.drawCondition;
    return wishService.listWishes({ status: 'pending', category })
      .then((res) => {
        const wishes = res.wishes || [];
        this.setData({
          pendingWishes: wishes,
          pendingCount: wishes.length,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[draw] 获取愿望失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 保存抽取条件到本机
   */
  _saveCondition() {
    try {
      wx.setStorageSync(storageKeys.drawCondition, this.data.drawCondition);
    } catch (err) {
      console.error('[draw] 保存抽取条件失败:', err);
    }
  },

  /**
   * 切换分类
   */
  handleCategorySelect(e) {
    const category = e.currentTarget.dataset.key;
    if (!category || category === this.data.drawCondition.category) return;
    this.setData({
      'drawCondition.category': category,
      relaxedTip: '',
    });
    this._saveCondition();
    this.fetchPendingWishes();
  },

  /**
   * 切换避开近期天数
   */
  handleExcludeDaysSelect(e) {
    const excludeDays = Number(e.currentTarget.dataset.key);
    if (isNaN(excludeDays) || excludeDays === this.data.drawCondition.excludeDays) return;
    this.setData({
      'drawCondition.excludeDays': excludeDays,
      relaxedTip: '',
    });
    this._saveCondition();
  },

  /**
   * 今日愿望变化（不影响待抽取数量，仅同步一次即可）
   */
  handleTodayChange() {
    // 就今天/换一个都不会改变 pending 数量，这里无需额外处理
  },

  /**
   * 今日愿望「就今天！」→ 跳转打卡页
   */
  handleTodaySelected() {
    // 「就今天」会把愿望从 pending 转 ongoing，先刷新一次剩余数量
    this.fetchPendingWishes();
    wx.switchTab({ url: '/pages/checkin/index' });
  },

  /**
   * 今日愿望「明天再说」→ 整块由组件自行隐藏
   */
  handleTodayHidden() {},

  /**
   * 计算严格符合「避开近期」条件的候选数（用于放宽提示）
   * @param {number} excludeDays
   * @returns {number}
   */
  _countStrictCandidates(excludeDays) {
    const list = this.data.pendingWishes || [];
    if (!excludeDays) return list.length;
    const now = Date.now();
    const limit = excludeDays * 24 * 60 * 60 * 1000;
    return list.filter((w) => {
      if (!w.drawnAt) return true;
      const drawn = new Date(w.drawnAt).getTime();
      if (isNaN(drawn)) return true;
      return now - drawn > limit;
    }).length;
  },

  /**
   * 开始抽取
   */
  handleDraw() {
    if (this.data.isDrawing || this.data.pendingCount === 0) return;

    const { category, excludeDays } = this.data.drawCondition;

    this.setData({
      isDrawing: true,
      isAnimating: true,
      showResult: false,
      showDatePicker: false,
      relaxedTip: '',
    });

    // 调用云函数抽取（带分类 + 避开近期条件）
    wishService.drawWish({ category, excludeDays })
      .then((res) => {
        if (!res.wish) {
          this.setData({ isDrawing: false, isAnimating: false });
          wx.showToast({ title: '愿望池空了', icon: 'none' });
          return;
        }

        const strict = typeof res.strictCount === 'number'
          ? res.strictCount
          : this._countStrictCandidates(excludeDays);
        const relaxedTip = res.relaxed
          ? `符合条件的只有 ${strict} 个，已放宽到全部`
          : '';

        // 动画持续约2秒后显示结果
        setTimeout(() => {
          this.setData({
            isAnimating: false,
            showResult: true,
            drawnWish: res.wish,
            currentWish: res.wish,
            relaxedTip,
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
   * 放回愿望（后端保留 drawnAt，7 天内不会再次抽中）
   */
  handleReturn() {
    if (!this.data.drawnWish) return;

    wishService.returnWish(this.data.drawnWish._id)
      .then(() => {
        wx.showToast({ title: '已放回', icon: 'success' });
        this.setData({
          showResult: false,
          showDatePicker: false,
          drawnWish: null,
          currentWish: null,
        });
        this.fetchPendingWishes();
      })
      .catch((err) => console.error('[draw] 放回失败:', err));
  },

  /**
   * 去做：先弹计划日期选择（今天 / 本周六 / 明天 / 自选日期 / 暂不设置）
   */
  handleStart() {
    if (!this.data.drawnWish) return;

    const quickOptions = quickDateOptions();
    const itemList = ['今天', '本周六', '明天', '自选日期', '暂不设置'];

    wx.showActionSheet({
      itemList,
      success: (res) => {
        if (res.tapIndex >= 0 && res.tapIndex <= 2) {
          this._startWithPlan(quickOptions[res.tapIndex].value);
        } else if (res.tapIndex === 3) {
          this.setData({ showDatePicker: true });
        } else {
          this._startWithPlan(null);
        }
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') !== -1) return;
        console.error('[draw] 选择计划日期失败:', err);
      },
    });
  },

  /**
   * 自选日期变化（picker bindchange）
   */
  handleCustomDateChange(e) {
    const value = e.detail.value;
    if (!value) return;
    this.setData({ customDate: value });
  },

  /**
   * 确认自选日期
   */
  handleConfirmDatePicker() {
    if (!this.data.customDate) return;
    this._startWithPlan(this.data.customDate);
  },

  /**
   * 取消自选日期
   */
  handleCancelDatePicker() {
    if (this._starting) return;
    this.setData({ showDatePicker: false });
  },

  /**
   * 转进行中并设置计划日期，成功后跳转打卡页
   * @param {string|null} plannedDate - 'YYYY-MM-DD'，null 表示暂不设置
   */
  _startWithPlan(plannedDate) {
    if (!this.data.drawnWish || this._starting) return;
    this._starting = true;

    const wishId = this.data.drawnWish._id;

    // 一次调用完成 「pending → ongoing」 + 写入计划日期
    wishService.startWish(wishId, plannedDate || undefined)
      .then(() => {
        this._starting = false;
        wx.showToast({ title: '加油！去完成吧', icon: 'success' });
        this.setData({
          showResult: false,
          showDatePicker: false,
          drawnWish: null,
          currentWish: null,
        });
        this.fetchPendingWishes();
        setTimeout(() => {
          wx.switchTab({ url: '/pages/checkin/index' });
        }, 1200);
      })
      .catch((err) => {
        console.error('[draw] 开始失败:', err);
        this._starting = false;
      });
  },

  /**
   * 关闭结果弹窗：不放回也不开始则自动放回
   */
  handleCloseResult() {
    if (this._starting) return;
    if (this.data.showDatePicker) {
      this.setData({ showDatePicker: false });
      return;
    }
    if (this.data.drawnWish) {
      this.handleReturn();
    }
  },

  handleStopPropagation() {},
});
