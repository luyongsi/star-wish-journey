// components/wish-card/wish-card.js — 愿望卡片组件
const { categoryIcons, wishStatus } = require('../../utils/constants');
const { formatRelativeTime, truncate } = require('../../utils/format');

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
    shortDesc: '',
    touchStartX: 0,
    swipeOffset: 0,
  },

  observers: {
    'wish': function (wish) {
      if (!wish || !wish._id) return;
      this.setData({
        icon: categoryIcons[wish.category] || '💝',
        statusLabel: wishStatus[wish.status] || '',
        statusClass: `status-${wish.status}`,
        relativeTime: wish.createdAt ? formatRelativeTime(wish.createdAt) : '',
        shortDesc: truncate(wish.description || '', 40),
      });
    },
  },

  methods: {
    handleTap() {
      this.triggerEvent('tap', { wish: this.data.wish });
    },

    handleTouchStart(e) {
      this.setData({ touchStartX: e.touches[0].clientX });
    },

    handleTouchEnd(e) {
      const startX = this.data.touchStartX;
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;

      if (diff > 50) {
        // 向左滑，显示操作
        this.setData({ swipeOffset: -140 });
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
