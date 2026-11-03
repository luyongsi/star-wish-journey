// pages/wish/detail.js — 愿望详情/编辑页（v1.1）
// 封面区 / 标题区 / 计划信息 / 描述 / 打卡记录区 / 操作区 + 内联编辑态
const wishService = require('../../services/wish');
const checkinService = require('../../services/checkin');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { categoryIcons, wishStatus, category } = require('../../utils/constants');
const { formatRelativeTime, formatDateTime, formatDate } = require('../../utils/format');
const {
  validateWishTitle,
  validateWishDescription,
  validateCheckInNote,
} = require('../../utils/validator');
const { formatPlannedDate, toDateKey, quickDateOptions } = require('../../utils/date');
const { categories } = require('../../config/index');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 取文件扩展名
 * @param {string} filePath
 * @returns {string}
 */
function getExt(filePath) {
  const parts = String(filePath || '').split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

Page({
  data: {
    wishId: '',
    wish: null,
    loading: true,

    // B2/B3 展示字段
    icon: '',
    categoryLabel: '',
    statusLabel: '',
    statusClass: '',
    relativeTime: '',
    createdByText: '',

    // B1 封面
    displayCoverUrl: '',

    // 完成时间
    completedDate: '',

    // B3 计划日期
    todayKey: '',
    plannedValue: '',
    plannedFullText: '',
    plannedHint: '',
    plannedOverdue: false,
    plannedEditable: false,
    quickOptions: [],

    // B5 打卡记录
    records: [],
    recordCount: 0,

    // B5 追加记录抽屉
    showAppendPanel: false,
    appendNote: '',
    appendMediaList: [],
    appendUploadText: '上传中...',
    appending: false,

    // B7 编辑态
    isEditing: false,
    editForm: {
      title: '',
      description: '',
      category: 'other',
      plannedDate: '',
    },
    coverPreview: '',
    coverChanged: false,
    coverRemoved: false,
    editDescLength: 0,

    categories: categories,
  },

  onLoad(options) {
    const wishId = (options && options.id) || '';
    if (wishId) {
      this.setData({ wishId });
    }
    this._checkLoginReady(wishId);
  },

  onUnload() {
    if (this._loginHandler) {
      store.off('loginReady', this._loginHandler);
      this._loginHandler = null;
    }
  },

  onShow() {
    // 从打卡详情返回时刷新记录；编辑态/追加抽屉打开时不打断用户
    const busy = this.data.isEditing || this.data.showAppendPanel;
    if (this._loaded && this.data.wishId && !busy && store.isPaired()) {
      this.fetchWishDetail();
    }
  },

  /**
   * 等待登录就绪后再拉取（贴贴态已在其他页校验，这里只兜底登录态）
   * @param {string} wishId
   */
  _checkLoginReady(wishId) {
    if (!wishId) return;
    const app = getApp();
    if (app.globalData && app.globalData.isLoginReady) {
      this.fetchWishDetail();
      return;
    }
    this._loginHandler = () => {
      store.off('loginReady', this._loginHandler);
      this._loginHandler = null;
      this.fetchWishDetail();
    };
    store.on('loginReady', this._loginHandler);
  },

  /**
   * 获取愿望详情
   */
  fetchWishDetail() {
    if (!this.data.wishId) return;

    wishService.getWishDetail(this.data.wishId)
      .then((res) => {
        const wish = res.wish;
        if (!wish) {
          wx.showToast({ title: '愿望不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        const me = store.getUser();
        const myOpenid = me ? me.openid : '';
        const icon = categoryIcons[wish.category] || '💝';
        const statusLabel = wishStatus[wish.status] || '';
        const statusClass = `status-${wish.status}`;
        const relativeTime = wish.createdAt ? formatRelativeTime(wish.createdAt) : '';
        const createdByText =
          wish.createdBy && myOpenid && wish.createdBy === myOpenid ? '我' : 'TA';

        const plannedValue = wish.plannedDate ? toDateKey(wish.plannedDate) : '';
        const plannedInfo = formatPlannedDate(wish.plannedDate);
        let plannedFullText = '';
        if (plannedValue) {
          const d = new Date(plannedValue.replace(/-/g, '/'));
          const weekday = isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
          plannedFullText = weekday ? `${plannedValue}（${weekday}）` : plannedValue;
        }
        const plannedOverdue = plannedInfo.overdue && wish.status === 'ongoing';
        // 只在「今天/明天/昨天/N 天后」或进行中已过期时补提示，避免与日期重复
        let plannedHint = '';
        if (plannedInfo.overdue) {
          plannedHint = plannedOverdue ? plannedInfo.text : '';
        } else if (/^(今天|明天|昨天|\d+ 天后)$/.test(plannedInfo.text)) {
          plannedHint = plannedInfo.text;
        }
        const completedDate = wish.completedAt ? formatDate(wish.completedAt) : '';

        // 快捷项去重（例如今天是周五时「本周六」与「明天」是同一天）
        const seenDate = {};
        const quickOptions = quickDateOptions().filter((opt) => {
          if (seenDate[opt.value]) return false;
          seenDate[opt.value] = true;
          return true;
        });

        this.setData({
          wish,
          icon,
          categoryLabel: category[wish.category] || '其他',
          statusLabel,
          statusClass,
          relativeTime,
          createdByText,
          plannedValue,
          plannedFullText,
          plannedHint,
          plannedOverdue,
          completedDate,
          plannedEditable: wish.status === 'pending' || wish.status === 'ongoing',
          // 已完成只读；未设置时 value 给今天，避免 picker 拿到空值
          todayKey: toDateKey(new Date()),
          quickOptions: quickOptions,
          loading: false,
          recordCount: wish.checkInCount || 0,
        });

        this._loadCoverUrl(wish.coverUrl || '');

        // B5：只有已完成的愿望才有打卡记录区
        if (wish.status === 'completed') {
          this.fetchRecords();
        } else {
          this.setData({ records: [], recordCount: wish.checkInCount || 0 });
        }
        this._loaded = true;
      })
      .catch((err) => {
        console.error('[wish/detail] 获取详情失败:', err);
        this._loaded = true;
        this.setData({ loading: false });
      });
  },

  /**
   * 封面：fileId 换临时链接
   * @param {string} coverUrl
   */
  _loadCoverUrl(coverUrl) {
    if (!coverUrl) {
      this.setData({ displayCoverUrl: '' });
      return;
    }
    if (coverUrl.indexOf('cloud://') !== 0) {
      this.setData({ displayCoverUrl: coverUrl });
      return;
    }
    mediaService.getTempFileURL([coverUrl])
      .then((fileList) => {
        const first = fileList && fileList[0];
        this.setData({ displayCoverUrl: (first && first.tempFileURL) || '' });
      })
      .catch((err) => {
        console.error('[wish/detail] 获取封面链接失败:', err);
      });
  },

  /**
   * 预览封面
   */
  handlePreviewCover() {
    if (!this.data.displayCoverUrl) return;
    wx.previewImage({ urls: [this.data.displayCoverUrl] });
  },

  // ---------------- B5 打卡记录 ----------------

  /**
   * 查询该愿望下全部打卡记录（按时间正序由云端返回）
   */
  fetchRecords() {
    checkinService.listRecordsByWish(this.data.wishId)
      .then((res) => {
        const records = res.records || [];
        const me = store.getUser();
        const myOpenid = me ? me.openid : '';

        const view = records.map((r) => ({
          _id: r._id,
          timeText: r.createdAt ? formatDateTime(r.createdAt) : '',
          byText: r.checkInBy && myOpenid && r.checkInBy === myOpenid ? '我' : 'TA',
          note: r.note || '',
          mediaView: (r.mediaList || []).map((m) => {
            const isVideo = m.type === 'video';
            const thumbUrl = m.thumbUrl || '';
            return {
              fileId: m.fileId,
              type: isVideo ? 'video' : 'image',
              // 视频文件本身不能当图片渲染，只有明确给了 http 封面才用
              thumbSrc: isVideo ? (/^https?:\/\//.test(thumbUrl) ? thumbUrl : '') : thumbUrl,
              url: thumbUrl,
            };
          }),
        }));

        this.setData({ records: view, recordCount: records.length });
        this._loadRecordMedia(view);
      })
      .catch((err) => {
        console.error('[wish/detail] 获取打卡记录失败:', err);
      });
  },

  /**
   * 批量换取记录媒体的临时链接
   * @param {Array} records
   */
  _loadRecordMedia(records) {
    const fileIds = [];
    records.forEach((r) => {
      (r.mediaView || []).forEach((m) => {
        if (m.fileId && m.fileId.indexOf('cloud://') === 0) {
          fileIds.push(m.fileId);
        }
      });
    });
    if (fileIds.length === 0) return;

    mediaService.getTempFileURL([...new Set(fileIds)])
      .then((fileList) => {
        const urlMap = {};
        (fileList || []).forEach((f) => {
          if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
        });

        const recordsUpdated = this.data.records.map((r) => ({
          ...r,
          mediaView: (r.mediaView || []).map((m) => {
            const url = urlMap[m.fileId] || m.url || '';
            return {
              ...m,
              url,
              // 视频文件本身不能当图片渲染，只有图片才用临时链接做缩略图
              thumbSrc: m.type === 'video' ? m.thumbSrc : url,
            };
          }),
        }));
        this.setData({ records: recordsUpdated });
      })
      .catch((err) => {
        console.error('[wish/detail] 获取记录媒体链接失败:', err);
      });
  },

  /**
   * 预览单条记录里的媒体
   */
  handlePreviewRecordMedia(e) {
    const recordIndex = e.currentTarget.dataset.recordIndex;
    const mediaIndex = e.currentTarget.dataset.mediaIndex;
    const record = this.data.records[recordIndex];
    if (!record) return;
    const mediaList = record.mediaView || [];
    const media = mediaList[mediaIndex];
    if (!media || !media.url) return;

    if (media.type === 'video') {
      wx.previewMedia({
        sources: mediaList.map((m) => ({
          url: m.url,
          type: m.type === 'video' ? 'video' : 'image',
          poster: m.url,
        })),
        current: mediaIndex,
      });
    } else {
      const imageUrls = mediaList
        .filter((m) => m.type !== 'video' && m.url)
        .map((m) => m.url);
      wx.previewImage({ current: media.url, urls: imageUrls });
    }
  },

  /**
   * 点击单条记录进入打卡详情
   */
  handleRecordTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/checkin/detail?id=${id}` });
  },

  /**
   * 打开追加记录抽屉
   */
  handleOpenAppend() {
    if (!this.data.wish || this.data.wish.status !== 'completed') return;
    this.setData({
      showAppendPanel: true,
      appendNote: '',
      appendMediaList: [],
      appendUploadText: '上传中...',
      appending: false,
    });
  },

  handleCloseAppend() {
    if (this.data.appending) return;
    this.setData({ showAppendPanel: false, appendNote: '', appendMediaList: [] });
  },

  handleAppendMediaChange(e) {
    this.setData({ appendMediaList: e.detail.mediaList || [] });
  },

  handleAppendNoteInput(e) {
    this.setData({ appendNote: e.detail.value });
  },

  /**
   * 顺序上传追加记录媒体
   * @param {Array} mediaList - media-uploader 的本地媒体
   * @param {Function} onProgress - (done, total)
   * @returns {Promise<Array<{fileId: string, type: string}>>}
   */
  _uploadAppendMedia(mediaList, onProgress) {
    const coupleId = store.getCoupleId();
    const total = mediaList.length;
    const stamp = Date.now();
    const uploaded = [];

    return mediaList
      .reduce(
        (chain, item, index) =>
          chain.then(async () => {
            const type = item.type === 'video' ? 'video' : 'image';
            // 超阈值先压缩，避免撞上云端 50MB 硬上限
            const uploadPath = await mediaService.compressIfNeeded(item.tempFilePath, type);
            const cloudPath = `media/images/${coupleId}/${stamp}_${index}.${getExt(uploadPath)}`;
            const result = await mediaService.uploadMedia(uploadPath, cloudPath);
            uploaded.push({ fileId: result.fileId, type });
            if (typeof onProgress === 'function') onProgress(index + 1, total);
          }),
        Promise.resolve()
      )
      .then(() => uploaded)
      .catch(async (err) => {
        // 中途失败时清理已上传文件，避免产生孤儿文件
        if (uploaded.length > 0) {
          await mediaService.deleteBatch(uploaded.map((m) => m.fileId));
        }
        throw err;
      });
  },

  /**
   * 提交追加记录
   */
  handleSubmitAppend() {
    if (this.data.appending) return;

    const note = (this.data.appendNote || '').trim();
    const mediaList = this.data.appendMediaList || [];
    if (!note && mediaList.length === 0) {
      wx.showToast({ title: '追加记录请至少填写一项内容', icon: 'none' });
      return;
    }
    const noteCheck = validateCheckInNote(note);
    if (!noteCheck.valid) {
      wx.showToast({ title: noteCheck.message, icon: 'none' });
      return;
    }

    this.setData({ appending: true, appendUploadText: '上传中...' });

    let uploaded = [];
    this._uploadAppendMedia(mediaList, (done, total) => {
      this.setData({ appendUploadText: `上传中 ${done}/${total}...` });
    })
      .then((result) => {
        uploaded = result;
        return checkinService.appendCheckIn({
          wishId: this.data.wishId,
          note,
          mediaList: uploaded,
          location: null,
        });
      })
      .then(() => {
        wx.showToast({ title: '记录已追加', icon: 'success' });
        this.setData({
          appending: false,
          appendUploadText: '上传中...',
          showAppendPanel: false,
          appendNote: '',
          appendMediaList: [],
        });
        this.fetchRecords();
      })
      .catch((err) => {
        console.error('[wish/detail] 追加记录失败:', err);
        this.setData({ appending: false, appendUploadText: '上传中...' });
        // 已上传但记录写入失败时清理云存储，避免产生孤儿文件
        if (uploaded.length > 0) {
          mediaService.deleteBatch(uploaded.map((m) => m.fileId));
        }
        if (err && err.code === 'MEDIA_TOO_LARGE') {
          wx.showToast({ title: err.message, icon: 'none', duration: 3000 });
        }
      });
  },

  // ---------------- B3 计划日期 ----------------

  /**
   * 应用计划日期（待抽取的愿望设置后由云端转为进行中）
   * @param {string} value - 'YYYY-MM-DD'
   */
  applyPlannedDate(value) {
    if (!value) return;
    wishService.setPlannedDate(this.data.wishId, value)
      .then(() => {
        wx.showToast({
          title: this.data.wish && this.data.wish.status === 'pending' ? '已安排，开始去做吧' : '计划日期已更新',
          icon: 'none',
        });
        this.fetchWishDetail();
      })
      .catch((err) => {
        console.error('[wish/detail] 设置计划日期失败:', err);
      });
  },

  handlePlannedDateChange(e) {
    this.applyPlannedDate(e.detail.value);
  },

  handleQuickDate(e) {
    this.applyPlannedDate(e.currentTarget.dataset.value);
  },

  // ---------------- B7 编辑态 ----------------

  /**
   * 进入编辑模式
   */
  handleStartEdit() {
    const wish = this.data.wish;
    if (!wish) return;
    this.setData({
      isEditing: true,
      editForm: {
        title: wish.title,
        description: wish.description || '',
        category: wish.category,
        plannedDate: this.data.plannedValue || '',
      },
      coverPreview: this.data.displayCoverUrl || '',
      coverChanged: false,
      coverRemoved: false,
      editDescLength: (wish.description || '').length,
    });
  },

  /**
   * 取消编辑，放弃改动
   */
  handleCancelEdit() {
    this.setData({
      isEditing: false,
      coverPreview: '',
      coverChanged: false,
      coverRemoved: false,
    });
  },

  handleTitleInput(e) {
    this.setData({ 'editForm.title': e.detail.value });
  },

  handleDescInput(e) {
    const value = e.detail.value;
    this.setData({ 'editForm.description': value, editDescLength: value.length });
  },

  handleCategoryChange(e) {
    this.setData({ 'editForm.category': e.currentTarget.dataset.key });
  },

  handleEditPlannedDateChange(e) {
    this.setData({ 'editForm.plannedDate': e.detail.value });
  },

  handleClearEditPlannedDate() {
    this.setData({ 'editForm.plannedDate': '' });
  },

  /**
   * 选择新的封面图
   */
  handleChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.setData({
          coverPreview: file.tempFilePath,
          coverChanged: true,
          coverRemoved: false,
        });
      },
      fail: (err) => {
        if (err && err.errMsg && !err.errMsg.includes('cancel')) {
          console.error('[wish/detail] 选择封面失败:', err);
        }
      },
    });
  },

  /**
   * 移除封面
   */
  handleRemoveCover() {
    this.setData({ coverPreview: '', coverChanged: true, coverRemoved: true });
  },

  /**
   * 上传封面，返回 fileId
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  _uploadCover(filePath) {
    const coupleId = store.getCoupleId();
    const cloudPath = `media/images/${coupleId}/${Date.now()}_cover.${getExt(filePath)}`;
    return mediaService.compressIfNeeded(filePath, 'image')
      .then((uploadPath) => mediaService.uploadMedia(uploadPath, cloudPath))
      .then((res) => res.fileId);
  },

  /**
   * 保存编辑
   */
  handleSaveEdit() {
    const form = this.data.editForm;
    const titleCheck = validateWishTitle(form.title);
    if (!titleCheck.valid) {
      wx.showToast({ title: titleCheck.message, icon: 'none' });
      return;
    }
    const descCheck = validateWishDescription(form.description);
    if (!descCheck.valid) {
      wx.showToast({ title: descCheck.message, icon: 'none' });
      return;
    }

    const params = {
      title: form.title.trim(),
      description: form.description,
      category: form.category,
    };
    // 已完成愿望的计划日期只读，不参与提交
    if (this.data.wish.status !== 'completed') {
      // 传空串表示清空计划日期
      params.plannedDate = form.plannedDate || '';
    }

    // 封面：未改动则不动；删除则置空；更换则先上传
    const coverTask = this.data.coverChanged
      ? (this.data.coverRemoved || !this.data.coverPreview
        ? Promise.resolve('')
        : this._uploadCover(this.data.coverPreview))
      : Promise.resolve(null);

    coverTask
      .then((coverUrl) => {
        if (coverUrl !== null) params.coverUrl = coverUrl;
        return wishService.updateWish(this.data.wishId, params);
      })
      .then(() => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ isEditing: false, coverChanged: false, coverRemoved: false });
        this.fetchWishDetail();
      })
      .catch((err) => {
        console.error('[wish/detail] 保存失败:', err);
        if (err && err.code === 'MEDIA_TOO_LARGE') {
          wx.showToast({ title: err.message, icon: 'none', duration: 3000 });
        }
      });
  },

  // ---------------- B6 操作区 ----------------

  /**
   * 删除愿望
   */
  handleDelete() {
    const count = this.data.recordCount || 0;
    const content = count > 0
      ? `删除后将同时删除 ${count} 条打卡记录，不可恢复`
      : `确定删除「${this.data.wish.title}」吗？`;

    wx.showModal({
      title: '确认删除',
      content,
      confirmColor: '#E84393',
      success: (res) => {
        if (res.confirm) {
          wishService.deleteWish(this.data.wishId)
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            })
            .catch((err) => console.error('[wish/detail] 删除失败:', err));
        }
      },
    });
  },

  /**
   * 收藏切换
   */
  handleToggleFavorite() {
    const newVal = !this.data.wish.isFavorite;
    wishService.updateWish(this.data.wishId, { isFavorite: newVal })
      .then(() => {
        this.setData({ 'wish.isFavorite': newVal });
        wx.showToast({ title: newVal ? '已收藏' : '已取消收藏', icon: 'none' });
      })
      .catch((err) => console.error('[wish/detail] 收藏失败:', err));
  },

  handleStopPropagation() {},
});
