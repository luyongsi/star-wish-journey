// components/today-wish/today-wish.js — 今日愿望卡片/抽屉（PRD §6.1 C1 + §5.1 A2）
const wishService = require('../../services/wish');
const { categoryIcons, category } = require('../../utils/constants');
const { toDateKey } = require('../../utils/date');

Component({
  properties: {
    /**
     * 展示形态：'card' 卡片（抽取页顶部） | 'drawer' 抽屉（愿望池入口）
     */
    mode: {
      type: String,
      value: 'card',
    },
    /**
     * 抽屉是否显示
     */
    visible: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    loaded: false,
    hidden: false,
    status: 'pending', // pending | selected
    switchLeft: 3,
    maxSwitch: 3,
    wish: null,
    icon: '💝',
    categoryLabel: '',
    dateLabel: '',
    acting: false,
  },

  observers: {
    visible(visible) {
      if (visible && !this.data.loaded) {
        this.fetchToday();
      }
    },
  },

  lifetimes: {
    attached() {
      // 卡片模式立即加载；抽屉模式等 visible 打开再加载
      if (this.data.mode === 'card') {
        this.fetchToday();
      }
    },
  },

  methods: {
    /**
     * 拉取今日愿望
     */
    fetchToday() {
      return wishService.getTodayWish()
        .then((res) => {
          this._apply(res);
        })
        .catch((err) => {
          console.error('[today-wish] 加载失败:', err);
          this.setData({ loaded: true });
        });
    },

    /**
     * 应用返回数据
     */
    _apply(res) {
      const wish = res.wish || null;
      this.setData({
        loaded: true,
        hidden: !!res.hidden,
        status: res.status || 'pending',
        switchLeft: typeof res.switchLeft === 'number' ? res.switchLeft : 3,
        maxSwitch: res.maxSwitch || 3,
        wish,
        icon: wish ? (categoryIcons[wish.category] || '💝') : '💝',
        categoryLabel: wish ? (category[wish.category] || '其他') : '',
        dateLabel: `${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日`,
      });
      this.triggerEvent('change', { today: res });
    },

    /**
     * 就今天：转进行中 + 计划日期今天
     */
    handleSelect() {
      if (this.data.acting) return;
      this.setData({ acting: true });
      wishService.todayWishAction('select')
        .then(() => {
          wx.showToast({ title: '今天就去做吧', icon: 'success' });
          this.triggerEvent('selected', { wish: this.data.wish });
          this.setData({ status: 'selected', acting: false });
          this.triggerEvent('close');
        })
        .catch((err) => {
          console.error('[today-wish] 就今天失败:', err);
          this.setData({ acting: false });
        });
    },

    /**
     * 换一个
     */
    handleSwitch() {
      if (this.data.acting || this.data.switchLeft <= 0) return;
      this.setData({ acting: true });
      wishService.todayWishAction('switch')
        .then((res) => {
          this._apply(res);
          this.setData({ acting: false });
          this.triggerEvent('change', { today: res });
        })
        .catch((err) => {
          console.error('[today-wish] 换一个失败:', err);
          this.setData({ acting: false });
        });
    },

    /**
     * 明天再说
     */
    handleHide() {
      if (this.data.acting) return;
      this.setData({ acting: true });
      wishService.todayWishAction('hide')
        .then(() => {
          this.setData({ hidden: true, acting: false });
          this.triggerEvent('hidden');
          this.triggerEvent('close');
        })
        .catch((err) => {
          console.error('[today-wish] 明天再说失败:', err);
          this.setData({ acting: false });
        });
    },

    /**
     * 已选定状态：跳转打卡
     */
    handleGoCheckin() {
      wx.switchTab({ url: '/pages/checkin/index' });
    },

    handleClose() {
      this.triggerEvent('close');
    },

    handleStopPropagation() {},
  },
});
