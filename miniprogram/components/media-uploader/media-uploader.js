// components/media-uploader/media-uploader.js — 媒体选择+上传+预览+删除
const { mediaLimits } = require('../../config/index');

Component({
  properties: {
    maxCount: {
      type: Number,
      value: mediaLimits.maxCount,
    },
    mediaList: {
      type: Array,
      value: [],
    },
  },

  data: {
    localMedia: [],
  },

  observers: {
    'mediaList': function (mediaList) {
      this.setData({ localMedia: mediaList || [] });
    },
  },

  methods: {
    /**
     * 选择媒体文件
     */
    handleChoose() {
      const remaining = this.data.maxCount - this.data.localMedia.length;
      if (remaining <= 0) {
        wx.showToast({ title: `最多${this.data.maxCount}个文件`, icon: 'none' });
        return;
      }

      wx.chooseMedia({
        count: remaining,
        mediaType: ['mix'],
        sourceType: ['album', 'camera'],
        maxDuration: mediaLimits.maxVideoDuration,
        camera: 'back',
        success: (res) => {
          const newMedia = res.tempFiles.map((file) => {
            const type = file.fileType || (file.tempFilePath.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image');
            return {
              tempFilePath: file.tempFilePath,
              thumbTempFilePath: file.thumbTempFilePath || file.tempFilePath,
              size: file.size,
              type,
              duration: file.duration || 0,
            };
          });

          // 校验视频大小
          for (const media of newMedia) {
            if (media.type === 'video' && media.size > mediaLimits.maxVideoSize) {
              wx.showToast({ title: '视频不能超过50MB', icon: 'none' });
              return;
            }
          }

          const updated = [...this.data.localMedia, ...newMedia];
          this.setData({ localMedia: updated });
          this.triggerEvent('change', { mediaList: updated });
        },
        fail: (err) => {
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            console.error('[media-uploader] 选择失败:', err);
          }
        },
      });
    },

    /**
     * 预览媒体
     */
    handlePreview(e) {
      const index = e.currentTarget.dataset.index;
      const media = this.data.localMedia[index];

      if (media.type === 'video') {
        // 视频预览 - 直接全屏播放
        wx.previewMedia({
          sources: this.data.localMedia.map((m) => ({
            url: m.tempFilePath || m.fileId || m.url,
            type: m.type === 'video' ? 'video' : 'image',
            poster: m.thumbTempFilePath || m.thumbUrl,
          })),
          current: index,
        });
      } else {
        // 图片预览
        const imageUrls = this.data.localMedia
          .filter((m) => m.type !== 'video')
          .map((m) => m.tempFilePath || m.fileId || m.url);
        wx.previewImage({
          current: media.tempFilePath || media.fileId || media.url,
          urls: imageUrls,
        });
      }
    },

    /**
     * 删除媒体
     */
    handleDelete(e) {
      const index = e.currentTarget.dataset.index;
      wx.showModal({
        title: '提示',
        content: '确定删除这个文件吗？',
        success: (res) => {
          if (res.confirm) {
            const updated = [...this.data.localMedia];
            updated.splice(index, 1);
            this.setData({ localMedia: updated });
            this.triggerEvent('change', { mediaList: updated });
          }
        },
      });
    },
  },
});
