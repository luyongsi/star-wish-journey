// components/checkin-card/checkin-card.js — 打卡记录卡片
const { categoryIcons } = require('../../utils/constants');
const { formatDate } = require('../../utils/format');

Component({
  properties: {
    checkIn: {
      type: Object,
      value: {},
    },
  },

  data: {
    thumbUrl: '',
    icon: '',
    dateStr: '',
    mediaCount: 0,
    shortNote: '',
  },

  observers: {
    'checkIn': function (checkIn) {
      if (!checkIn || !checkIn._id) return;
      const mediaList = checkIn.mediaList || [];
      // 优先用图片做缩略图；没有可用 URL 时留空，回落到图标占位（fileId 不能直接渲染）
      const imageMedia = mediaList.find((m) => m.type !== 'video');
      const firstMedia = imageMedia || mediaList[0] || null;
      const thumbUrl = firstMedia ? (firstMedia.thumbUrl || firstMedia.url || '') : '';

      this.setData({
        thumbUrl,
        icon: categoryIcons[checkIn.wishCategory] || '💝',
        dateStr: checkIn.createdAt ? formatDate(checkIn.createdAt) : '',
        mediaCount: mediaList.length,
        shortNote: checkIn.note || '',
      });
    },
  },

  methods: {
    handleTap() {
      this.triggerEvent('tap', { checkIn: this.data.checkIn });
    },
  },
});
