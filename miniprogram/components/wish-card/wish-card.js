// components/wish-card/wish-card.js — 愿望卡片组件（PRD §5.1 A5）
const { categoryIcons, wishStatus } = require('../../utils/constants');
const { formatRelativeTime } = require('../../utils/format');
const { formatPlannedDate } = require('../../utils/date');
const store = require('../../utils/store');

Component({
  properties: {
    wish: {
      type: Object,
      value: {},
    },
    showActions: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    icon: '',
    statusLabel: '',
    statusClass: '',
    relativeTime: '',
    metaText: '',
    shortDesc: '',
    coverUrl: '',
    adderText: '',
    hasPlanned: false,
    plannedText: '',
    plannedOverdue: false,
    touchStartX: 0,
    swipeOffset: 0,
  },

  observers: {
    'wish': function (wish) {
      if (!wish || !wish._id) return;

      const user = store.getUser();
      const myOpenid = user && user.openid;
      const planned = formatPlannedDate(wish.plannedDate, wish.overdueDays);
      const relativeTime = wish.createdAt ? formatRelativeTime(wish.createdAt) : '';
      const adderText = myOpenid
        ? (wish.createdBy === myOpenid ? '我添加' : 'TA 添加')
        : '';
      const metaText = [adderText, relativeTime].filter(Boolean).join(' · ');

      this.setData({
        icon: categoryIcons[wish.category] || '💝',
        statusLabel: wishStatus[wish.status] || '',
        statusClass: `status-${wish.status}`,
        relativeTime,
        metaText,
        shortDesc: wish.description || '',
        coverUrl: wish.coverUrl || '',
        hasPlanned: !!wish.plannedDate,
        plannedText: planned.text,
        plannedOverdue: planned.overdue,
      });
    },
  },

  methods: {
    handleTap() {
      // 长按后不进入详情（PRD A6-1：长按与点击互斥）
      if (this._longPressAt && Date.now() - this._longPressAt < 600) {
        return;
      }
      // 左滑后误触不进入详情
      if (this.data.swipeOffset !== 0) {
        this.setData({ swipeOffset: 0 });
        return;
      }
      this.triggerEvent('tap', { wish: this.data.wish });
    },

    handleLongPress() {
      this._longPressAt = Date.now();
      if (this.data.swipeOffset !== 0) {
        this.setData({ swipeOffset: 0 });
      }
      this.triggerEvent('longpress', { wish: this.data.wish });
    },

    handleTouchStart(e) {
      this._touchStartX = e.touches[0].clientX;
    },

    handleTouchEnd(e) {
      const startX = this._touchStartX || 0;
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;

      if (diff > 50) {
        // 向左滑，露出「编辑 + 删除」两个按钮（各 140rpx）
        this.setData({ swipeOffset: -280 });
      } else if (diff < -30) {
        // 向右滑，收起
        this.setData({ swipeOffset: 0 });
      }
    },

    handleEdit() {
      this.setData({ swipeOffset: 0 });
      this.triggerEvent('edit', { wish: this.data.wish });
    },

    handleDelete() {
      this.setData({ swipeOffset: 0 });
      this.triggerEvent('delete', { wish: this.data.wish });
    },
  },
});
