// pages/checkin/index.js — 打卡页（PRD §6.2）
const checkinService = require('../../services/checkin');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { categoryIcons } = require('../../utils/constants');
const { chooseLocation } = require('../../utils/location');
const { formatDate, formatRelativeTime } = require('../../utils/format');
const { validateCheckInNote } = require('../../utils/validator');

/**
 * 是否为可直接渲染的网络地址（http/https / 本地临时路径）
 * cloud:// 的 fileId 不做直接渲染，统一换临时链接
 * @param {string} url
 * @returns {boolean}
 */
function isRenderableUrl(url) {
  return typeof url === 'string' && /^(https?:|wxfile:)/.test(url);
}

Page({
  data: {
    today: [],
    ongoing: [],
    completed: [],
    stats: { todayCount: 0, ongoingCount: 0, completedCount: 0 },
    showCheckInPanel: false,
    currentWish: null,
    currentIcon: '💝',
    mediaList: [],
    note: '',
    location: null,
    submitting: false,
    isSkipping: false,
    uploadText: '上传中...',
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
   * 后端返回 { today, ongoing, completed, stats }
   */
  fetchCheckIns() {
    return checkinService.listCheckIns()
      .then((res) => {
        const today = (res.today || []).map((w) => ({
          ...w,
          icon: categoryIcons[w.category] || '💝',
          subText: w.overdueDays === 0 ? '计划今天' : `已过期 ${w.overdueDays} 天`,
        }));

        const ongoing = (res.ongoing || []).map((w) => {
          // 副信息只有两种口径：「未计划日期」/「N 天前抽取」
          const subText = w.drawnAt
            ? `进行中 · ${formatRelativeTime(w.drawnAt)}抽取`
            : '进行中 · 未计划日期';
          return {
            ...w,
            icon: categoryIcons[w.category] || '💝',
            subText,
          };
        });

        const completed = (res.completed || []).map((w) => {
          const dateStr = w.completedAt ? formatDate(w.completedAt) : '';
          const parts = [];
          if (dateStr) parts.push(`${dateStr} 完成`);
          if (w.recordCount > 0) {
            if (w.mediaCount > 0) {
              parts.push(`${w.recordCount} 条记录`);
              parts.push(`${w.mediaCount} 张图`);
            } else {
              parts.push('纯文字记录');
            }
          }

          return {
            ...w,
            icon: categoryIcons[w.wishCategory] || '💝',
            subText: parts.join(' · '),
            coverUrl: '',
          };
        });

        this.setData({
          today,
          ongoing,
          completed,
          stats: res.stats || {
            todayCount: today.length,
            ongoingCount: ongoing.length,
            completedCount: completed.length,
          },
          loading: false,
        });

        // 数据变化后同步 TabBar 红点（PRD AC-23）
        const app = getApp();
        if (app && typeof app.refreshBadges === 'function') {
          app.refreshBadges();
        }

        // 封面只有 fileId，需要换临时链接才能渲染
        this._loadCoverUrls(completed);
      })
      .catch((err) => {
        console.error('[checkin] 获取列表失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 批量换取已完成愿望的封面临时链接
   * coverMedia: { fileId, type, thumbUrl } | null
   * @param {Array} list
   */
  _loadCoverUrls(list) {
    const directMap = {};
    const fileIds = [];

    (list || []).forEach((item, index) => {
      const cover = item.coverMedia;
      if (!cover) return;
      // thumbUrl 若是网络地址可直接使用，否则回落到 fileId 换临时链接
      if (isRenderableUrl(cover.thumbUrl)) {
        directMap[index] = cover.thumbUrl;
      } else if (cover.fileId) {
        fileIds.push(cover.fileId);
      }
    });

    if (fileIds.length === 0) {
      if (Object.keys(directMap).length > 0) {
        const completed = (list || []).map((item, index) =>
          directMap[index] ? { ...item, coverUrl: directMap[index] } : item
        );
        this.setData({ completed });
      }
      return;
    }

    mediaService.getTempFileURL([...new Set(fileIds)])
      .then((fileList) => {
        const urlMap = {};
        (fileList || []).forEach((f) => {
          urlMap[f.fileID] = f.tempFileURL;
        });

        const completed = (list || []).map((item, index) => {
          if (directMap[index]) return { ...item, coverUrl: directMap[index] };
          const cover = item.coverMedia;
          if (!cover || !cover.fileId || !urlMap[cover.fileId]) return item;
          return { ...item, coverUrl: urlMap[cover.fileId] };
        });

        this.setData({ completed });
      })
      .catch((err) => console.error('[checkin] 加载封面失败:', err));
  },

  /**
   * 打开完成抽屉
   */
  handleOpenCheckIn(e) {
    if (this.data.submitting) return;
    const wish = e.currentTarget.dataset.wish;
    if (!wish) return;
    this.setData({
      showCheckInPanel: true,
      currentWish: wish,
      currentIcon: categoryIcons[wish.category] || '💝',
      mediaList: [],
      note: '',
      location: null,
      isSkipping: false,
      uploadText: '上传中...',
    });
  },

  /**
   * 关闭完成抽屉：不改变任何状态
   */
  handleClosePanel() {
    if (this.data.submitting) return;
    this.setData({
      showCheckInPanel: false,
      currentWish: null,
      currentIcon: '💝',
      mediaList: [],
      note: '',
      location: null,
      isSkipping: false,
      uploadText: '上传中...',
    });
  },

  /**
   * 媒体变化
   */
  handleMediaChange(e) {
    this.setData({ mediaList: e.detail.mediaList || [] });
  },

  /**
   * 备注输入
   */
  handleNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  /**
   * 添加位置（仅在用户点击时调起地图选点）
   */
  handleChooseLocation() {
    if (this.data.submitting) return;
    chooseLocation()
      .then((loc) => {
        // 用户取消返回 null，不改动既有状态
        if (loc) {
          this.setData({ location: loc });
        }
      })
      .catch((err) => {
        console.error('[checkin] 选择位置失败:', err);
        wx.showToast({
          title: (err && err.message) || '选择位置失败，请重试',
          icon: 'none',
        });
      });
  },

  /**
   * 移除位置
   */
  handleRemoveLocation() {
    if (this.data.submitting) return;
    this.setData({ location: null });
  },

  /**
   * 主按钮：提交备注/媒体/位置并标记完成
   */
  handleSubmitCheckIn() {
    if (this.data.submitting) return;
    const wish = this.data.currentWish;
    if (!wish) return;

    const noteCheck = validateCheckInNote(this.data.note);
    if (!noteCheck.valid) {
      wx.showToast({ title: noteCheck.message, icon: 'none' });
      return;
    }

    const mediaList = this.data.mediaList || [];
    const note = this.data.note || '';
    const location = this.data.location;
    const coupleId = store.getCoupleId();

    // 全部为空时与「先跳过」等价，直接走完成
    if (mediaList.length === 0 && !note.trim() && !location) {
      this.handleSkip();
      return;
    }

    this.setData({ submitting: true, isSkipping: false, uploadText: '提交中...' });

    // 1. 上传媒体（若有），超阈值自动压缩，进度显示 3/9
    const filePaths = mediaList
      .map((m) => m.tempFilePath)
      .filter(Boolean);

    const uploadTask = filePaths.length > 0
      ? mediaService.uploadBatch(
          filePaths,
          coupleId,
          `temp_${Date.now()}`,
          (done, total) => {
            this.setData({ uploadText: `上传中 ${done}/${total}...` });
          }
        )
      : Promise.resolve([]);

    let uploadedFileIds = [];

    uploadTask
      .then((uploadedMedia) => {
        // 2. 创建打卡记录（媒体/备注/位置均可空）
        const formattedMedia = (uploadedMedia || []).map((m) => ({
          fileId: m.fileId,
          type: m.type,
        }));
        uploadedFileIds = formattedMedia.map((m) => m.fileId).filter(Boolean);

        return checkinService.createCheckIn({
          wishId: wish._id,
          note,
          mediaList: formattedMedia,
          location,
        });
      })
      .then(() => {
        wx.showToast({ title: '打卡成功！', icon: 'success' });
        this.setData({
          submitting: false,
          isSkipping: false,
          uploadText: '上传中...',
          showCheckInPanel: false,
          currentWish: null,
          currentIcon: '💝',
          mediaList: [],
          note: '',
          location: null,
        });
        this.fetchCheckIns();
      })
      .catch((err) => {
        console.error('[checkin] 打卡失败:', err);
        // 写记录失败时清理已上传的文件，避免产生孤儿文件
        if (uploadedFileIds.length > 0) {
          mediaService.deleteBatch(uploadedFileIds)
            .catch((e) => console.error('[checkin] 清理上传文件失败:', e));
          uploadedFileIds = [];
        }
        // 抽屉保持打开，已填内容不丢失
        this.setData({ submitting: false, isSkipping: false, uploadText: '上传中...' });
        if (err && err.code === 'MEDIA_TOO_LARGE') {
          wx.showToast({ title: err.message, icon: 'none', duration: 3000 });
        }
      });
  },

  /**
   * 次按钮：不提交任何内容，直接完成
   */
  handleSkip() {
    if (this.data.submitting) return;
    const wish = this.data.currentWish;
    if (!wish) return;

    this.setData({ submitting: true, isSkipping: true });
    checkinService.completeWish(wish._id)
      .then(() => {
        wx.showToast({ title: '已标记完成', icon: 'success' });
        this.setData({
          submitting: false,
          isSkipping: false,
          uploadText: '上传中...',
          showCheckInPanel: false,
          currentWish: null,
          currentIcon: '💝',
          mediaList: [],
          note: '',
          location: null,
        });
        this.fetchCheckIns();
      })
      .catch((err) => {
        console.error('[checkin] 直接完成失败:', err);
        this.setData({ submitting: false, isSkipping: false });
      });
  },

  /**
   * 已完成卡片 → 愿望详情（不是打卡详情）
   */
  handleViewWishDetail(e) {
    const wish = e.currentTarget.dataset.wish;
    if (!wish || !wish._id) return;
    wx.navigateTo({
      url: `/pages/wish/detail?id=${wish._id}`,
    });
  },

  handleStopPropagation() {},
});
