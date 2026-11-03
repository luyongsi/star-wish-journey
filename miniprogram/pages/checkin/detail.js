// pages/checkin/detail.js — 打卡详情页
const checkinService = require('../../services/checkin');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { categoryIcons } = require('../../utils/constants');
const { formatDateTime } = require('../../utils/format');

Page({
  data: {
    checkInId: '',
    checkIn: null,
    wish: null,
    mediaUrls: [],
    icon: '',
    dateStr: '',
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ checkInId: options.id });
      this.fetchDetail();
    }
  },

  /**
   * 获取详情
   */
  fetchDetail() {
    checkinService.getCheckInDetail(this.data.checkInId)
      .then((res) => {
        const checkIn = res.checkIn;
        const wish = res.wish;

        const icon = wish ? (categoryIcons[wish.category] || '💝') : '💝';
        const dateStr = checkIn.createdAt ? formatDateTime(checkIn.createdAt) : '';

        this.setData({
          checkIn,
          wish,
          icon,
          dateStr,
          loading: false,
        });

        // 获取媒体临时URL
        if (checkIn.mediaList && checkIn.mediaList.length > 0) {
          this._loadMediaUrls(checkIn.mediaList);
        }
      })
      .catch((err) => {
        console.error('[checkin/detail] 获取详情失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 加载媒体URL
   */
  _loadMediaUrls(mediaList) {
    const fileIds = mediaList.map((m) => m.fileId).filter(Boolean);
    if (fileIds.length === 0) return;

    mediaService.getTempFileURL(fileIds)
      .then((fileList) => {
        const urlMap = {};
        fileList.forEach((f) => {
          urlMap[f.fileID] = f.tempFileURL;
        });

        const mediaUrls = mediaList.map((m) => ({
          fileId: m.fileId,
          type: m.type,
          url: urlMap[m.fileId] || m.url || m.fileId,
          thumbUrl: m.thumbUrl || urlMap[m.fileId] || m.url,
        }));

        this.setData({ mediaUrls });
      })
      .catch((err) => console.error('[checkin/detail] 获取媒体URL失败:', err));
  },

  /**
   * 预览媒体
   */
  handlePreviewMedia(e) {
    const index = e.currentTarget.dataset.index;
    const media = this.data.mediaUrls[index];

    if (media.type === 'video') {
      // 视频用 wx.previewMedia
      wx.previewMedia({
        sources: this.data.mediaUrls.map((m) => ({
          url: m.url,
          type: 'video',
          poster: m.thumbUrl,
        })),
        current: index,
      });
    } else {
      const imageUrls = this.data.mediaUrls
        .filter((m) => m.type !== 'video')
        .map((m) => m.url);
      wx.previewImage({
        current: media.url,
        urls: imageUrls,
      });
    }
  },
});
