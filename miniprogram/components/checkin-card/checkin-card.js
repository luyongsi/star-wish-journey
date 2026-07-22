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
      const firstMedia = mediaList[0];
      const thumbUrl = firstMedia ? (firstMedia.thumbUrl || firstMedia.url || firstMedia.fileId) : '';

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
