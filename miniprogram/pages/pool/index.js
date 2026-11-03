// pages/pool/index.js — 愿望池（PRD §5.1 A1~A8）
const wishService = require('../../services/wish');
const checkinService = require('../../services/checkin');
const mediaService = require('../../services/media');
const realtime = require('../../utils/realtime');
const store = require('../../utils/store');
const badge = require('../../utils/badge');
const { validateWishCreate, validateWishTitle } = require('../../utils/validator');
const { categories } = require('../../config/index');
const {
  categoryIcons,
  category: categoryNames,
  wishStatus,
  storageKeys,
  poolView,
} = require('../../utils/constants');
const { formatRelativeTime } = require('../../utils/format');

const UPDATE_LIMIT = 3;

/**
 * 从本地路径取扩展名
 * @param {string} filePath
 * @returns {string}
 */
function getFileExt(filePath) {
  const matched = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(String(filePath || ''));
  return matched ? matched[1].toLowerCase() : 'jpg';
}

Page({
  data: {
    wishes: [],
    stats: { total: 0, completed: 0, ongoing: 0, pending: 0 },
    selectedCategory: 'all',
    view: poolView.list, // 'list' | 'waterfall'
    waterfallColumns: { left: [], right: [] },
    todayEntry: { show: false, title: '' },
    showTodayDrawer: false,
    updates: [],
    showAddPanel: false,
    showEditPanel: false,
    editingWish: null,
    newWish: {
      title: '',
      description: '',
      category: 'other',
      coverUrl: '',
      coverPreview: '',
      coverTempPath: '',
    },
    uploadingCover: false,
    submitting: false,
    categories: categories,
    loading: true,
  },

  _watcher: null,
  _allWishes: null,
  _checkinRecords: [],
  _checkinRecordsLoaded: false,
  _waterfallLongPressAt: 0,

  onLoad() {
    // 视图偏好：默认列表
    try {
      const saved = wx.getStorageSync(storageKeys.poolView);
      if (saved === poolView.waterfall || saved === poolView.list) {
        this.setData({ view: saved });
      }
    } catch (e) {
      console.warn('[pool] 读取视图偏好失败:', e);
    }

    this._checkLoginReady();
  },

  onShow() {
    if (!store.isPaired()) return;
    const app = getApp();
    // 登录未就绪时由 loginReady 回调统一加载，避免无效请求
    if (!app.globalData.isLoginReady) return;

    this._clearPoolBadge();
    // 首次进入时 onLoad 已拉过数据，避免重复请求
    if (this._skipNextShowFetch) {
      this._skipNextShowFetch = false;
    } else {
      this._loadAll();
    }
    this._startWatch();
  },

  onHide() {
    this._stopWatch();
  },

  onUnload() {
    this._stopWatch();
  },

  /**
   * 等待登录就绪
   */
  _checkLoginReady() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this._clearPoolBadge();
      // onLoad 之后紧接着会执行 onShow，由 onShow 启动实时监听，避免重复 watch
      this._skipNextShowFetch = true;
      this._loadAll();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this._clearPoolBadge();
        // onShow 此时已执行过，登录完成后再补一次加载
        this._loadAll();
        this._startWatch();
      });
    }
  },

  /**
   * 页面数据统一加载：列表（含统计）+ 今日愿望 + 对方动态
   * 列表只请求一次，动态复用同一份数据
   */
  _loadAll() {
    this.fetchTodayEntry();
    this.fetchWishes();
  },

  /**
   * 进入本页清除愿望池 Tab 红点（PRD AC-23）
   */
  _clearPoolBadge() {
    badge.markRead();
    badge.setTabBadge(badge.POOL_TAB_INDEX, 0);
  },

  /**
   * 当前用户 openid
   * @returns {string}
   */
  _myOpenid() {
    const user = store.getUser();
    return (user && user.openid) || '';
  },

  /**
   * 拉取愿望列表（按当前分类）
   */
  fetchWishes() {
    const filters = {};
    if (this.data.selectedCategory !== 'all') {
      filters.category = this.data.selectedCategory;
    }

    return wishService.listWishes(filters)
      .then((res) => {
        const list = res.wishes || [];
        // 只有全量列表才作为统计与动态的数据源缓存
        if (this.data.selectedCategory === 'all') {
          this._allWishes = list;
        }
        this.setData({
          stats: res.stats || this.data.stats,
          loading: false,
        });
        this._applyWishes(list);
        // 用途：今日记录可能只回传 wishId，需要用列表补齐标题
        if (this._todayRaw) this._applyTodayEntry();
        // 列表就绪后刷新对方动态（全部数据源由 _allWishes 保证）
        this.fetchPartnerUpdates();
      })
      .catch((err) => {
        console.error('[pool] 获取愿望列表失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 应用列表数据（同时切分瀑布双列）
   * @param {Array} list
   */
  _applyWishes(list) {
    const myOpenid = this._myOpenid();
    const decoratedList = [];
    const left = [];
    const right = [];

    (list || []).forEach((wish, index) => {
      const decorated = {
        ...wish,
        icon: categoryIcons[wish.category] || '💝',
        categoryLabel: categoryNames[wish.category] || '其他',
        statusLabel: wishStatus[wish.status] || '',
        statusClass: `status-${wish.status}`,
        adderText: myOpenid && wish.createdBy === myOpenid ? '我添加' : 'TA 添加',
        coverFileId: wish.coverUrl || '',
        // 有缓存临时链接时优先展示；非 cloud:// 可直接渲染
        coverUrl: this._resolveCover(wish.coverUrl),
      };
      decoratedList.push(decorated);
      if (index % 2 === 0) {
        left.push(decorated);
      } else {
        right.push(decorated);
      }
    });

    this.setData({
      wishes: decoratedList,
      waterfallColumns: { left, right },
    });

    this._resolveCoverUrls(list || []);
  },

  /**
   * 取封面的可展示地址
   * @param {string} fileId
   * @returns {string}
   */
  _resolveCover(fileId) {
    if (!fileId) return '';
    if (fileId.indexOf('cloud://') !== 0) return fileId;
    return (this._coverUrlMap && this._coverUrlMap[fileId]) || '';
  },

  /**
   * 封面图存的是 cloud fileID，<image> 无法直接渲染，批量换成临时链接
   * 注意：只替换展示字段 coverUrl，coverFileId 保留原始 fileID 供提交使用
   * @param {Array} list
   */
  _resolveCoverUrls(list) {
    this._coverUrlMap = this._coverUrlMap || {};

    const fileIds = list
      .map((w) => w.coverUrl)
      .filter((u) => u && u.indexOf('cloud://') === 0 && !this._coverUrlMap[u]);

    if (fileIds.length === 0) return;

    mediaService.getTempFileURL([...new Set(fileIds)])
      .then((fileList) => {
        fileList.forEach((f) => {
          if (f.tempFileURL) this._coverUrlMap[f.fileID] = f.tempFileURL;
        });

        const patch = (w) => {
          if (!w.coverFileId || !this._coverUrlMap[w.coverFileId]) return w;
          return { ...w, coverUrl: this._coverUrlMap[w.coverFileId] };
        };

        const wishes = (this.data.wishes || []).map(patch);
        const left = (this.data.waterfallColumns.left || []).map(patch);
        const right = (this.data.waterfallColumns.right || []).map(patch);

        this.setData({ wishes, waterfallColumns: { left, right } });
      })
      .catch((err) => console.error('[pool] 封面图临时链接获取失败:', err));
  },

  /**
   * 今日愿望入口（A2）
   */
  fetchTodayEntry() {
    return wishService.getTodayWish()
      .then((res) => {
        this._todayRaw = res || null;
        // 今日记录已生成时接口不再回传 wish：
        // 若此时还没有完整列表，由 fetchWishes 返回后再补算标题
        this._applyTodayEntry();
      })
      .catch((err) => {
        console.error('[pool] 获取今日愿望失败:', err);
        this._todayRaw = null;
        this.setData({ todayEntry: { show: false, title: '' } });
      });
  },

  /**
   * 根据今日愿望数据计算入口显隐
   * 条件：存在今日愿望、未被「明天再说」、未「就今天」处理
   */
  _applyTodayEntry() {
    const res = this._todayRaw;
    if (!res) {
      this.setData({ todayEntry: { show: false, title: '' } });
      return;
    }
    // 兼容接口只返回 wishId（今日记录已生成时不再回传 wish）的情况
    const wish = res.wish || this._findWish(res.wishId);
    const show = !!(wish && !res.hidden && res.status !== 'selected') && !this._todayEntryDismissed;
    this.setData({
      todayEntry: {
        show,
        title: show && wish ? wish.title : '',
      },
    });
  },

  /**
   * 打开今日愿望抽屉
   */
  handleOpenToday() {
    if (!this.data.todayEntry.show) return;
    this.setData({ showTodayDrawer: true });
  },

  /**
   * 抽屉关闭：入口本次页面会话内不再展示
   */
  handleTodayClose() {
    this._todayEntryDismissed = true;
    this.setData({
      showTodayDrawer: false,
      todayEntry: { show: false, title: '' },
    });
  },

  handleTodayHidden() {
    this._todayEntryDismissed = true;
    this.setData({ todayEntry: { show: false, title: '' } });
  },

  handleTodaySelected() {
    this._todayEntryDismissed = true;
    this.setData({ todayEntry: { show: false, title: '' } });
    this.fetchWishes();
  },

  /**
   * 抽屉内换一个后同步入口标题
   */
  handleTodayChange(e) {
    const today = e.detail && e.detail.today;
    if (!today) return;
    this._todayRaw = today;
    this._applyTodayEntry();
  },

  /**
   * 对方动态（A3）：最多 3 条、7 天内、仅对方
   * @param {boolean} [force] - 强制重新拉取打卡记录（下拉刷新/数据变更时）
   */
  fetchPartnerUpdates(force) {
    const myOpenid = this._myOpenid();
    if (!myOpenid) return;

    // 已拉过打卡记录时直接复用，避免切换分类等操作重复请求
    if (!force && this._checkinRecordsLoaded && this._allWishes) {
      this._renderUpdates(this._allWishes, this._checkinRecords);
      return;
    }

    const wishPromise = this._allWishes
      ? Promise.resolve({ wishes: this._allWishes })
      : wishService.listWishes({}).catch((err) => {
        console.error('[pool] 获取动态愿望数据失败:', err);
        return { wishes: [] };
      });

    const checkinPromise = checkinService.listCheckIns().catch((err) => {
      console.error('[pool] 获取动态打卡数据失败:', err);
      return null;
    });

    Promise.all([wishPromise, checkinPromise])
      .then(([wishRes, checkinRes]) => {
        const wishes = (wishRes && wishRes.wishes) || [];
        if (!this._allWishes) {
          this._allWishes = wishes;
        }
        const records = this._mapCheckinRecords(checkinRes);
        this._checkinRecords = records;
        this._checkinRecordsLoaded = !!checkinRes;
        this._renderUpdates(wishes, records);
      })
      .catch((err) => {
        console.error('[pool] 计算对方动态失败:', err);
      });
  },

  /**
   * 根据愿望与打卡记录渲染动态（最多 3 条、时间倒序由 badge 保证）
   * @param {Array} wishes
   * @param {Array} records
   */
  _renderUpdates(wishes, records) {
    const myOpenid = this._myOpenid();
    if (!myOpenid) return;

    const result = badge.countPartnerUpdates(wishes, records, myOpenid);
    // 文案（含愿望标题）已由 utils/badge.js 按 PRD 模板统一生成
    const updates = (result.recent || []).slice(0, UPDATE_LIMIT).map((item) => ({
      type: item.type,
      text: item.text,
      timeText: formatRelativeTime(item.at),
      wishId: item.wishId || '',
      checkInId: item.checkInId || '',
    }));

    this.setData({ updates });
  },

  /**
   * 按 id 查找愿望（优先取完整列表）
   * @param {string} wishId
   * @returns {Object|null}
   */
  _findWish(wishId) {
    if (!wishId) return null;
    const source = this._allWishes || this.data.wishes || [];
    return source.find((w) => w._id === wishId) || null;
  },

  /**
   * 把打卡接口返回整理成 countPartnerUpdates 需要的结构
   * 优先使用接口返回的 recentRecords（含 checkInBy/createdAt/全部记录）；
   * 旧接口没有该字段时，退化为用 completed 列表近似。
   * @param {Object|null} res
   * @returns {Array}
   */
  _mapCheckinRecords(res) {
    if (!res) return [];

    if (Array.isArray(res.recentRecords)) {
      return res.recentRecords.map((item) => ({
        _id: item._id,
        checkInBy: item.checkInBy,
        createdAt: item.createdAt,
        mediaList: item.mediaList || [],
        wishId: item.wishId,
      }));
    }

    // 兼容旧接口：completed 里没有 checkInBy，用创建人/完成信息近似
    return (res.completed || []).map((item) => ({
      _id: item._id,
      checkInBy: item.checkInBy || item.createdBy,
      createdAt: item.lastCheckInAt || item.completedAt || item.createdAt,
      mediaList: item.coverMedia ? [item.coverMedia] : [],
      wishId: item.wishId || item._id,
    }));
  },

  /**
   * 点击动态条目
   */
  handleUpdateTap(e) {
    const { type, wishId, checkInId } = e.currentTarget.dataset;
    if (type === 'checkin') {
      if (!checkInId) return;
      wx.navigateTo({ url: `/pages/checkin/detail?id=${checkInId}` });
      return;
    }
    if (!wishId) return;
    wx.navigateTo({ url: `/pages/wish/detail?id=${wishId}` });
  },

  /**
   * 开始实时监听
   */
  _startWatch() {
    this._watcher = realtime.watchWishes((snapshot) => {
      if (!snapshot || !snapshot.docs) return;

      const allWishes = snapshot.docs.slice().sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      this._allWishes = allWishes;

      let filtered = allWishes;
      if (this.data.selectedCategory !== 'all') {
        filtered = allWishes.filter((w) => w.category === this.data.selectedCategory);
      }

      const stats = {
        total: allWishes.length,
        completed: allWishes.filter((w) => w.status === 'completed').length,
        ongoing: allWishes.filter((w) => w.status === 'ongoing').length,
        pending: allWishes.filter((w) => w.status === 'pending').length,
      };

      this.setData({ stats });
      this._applyWishes(filtered);
      this._recomputeUpdates(allWishes);
    });
  },

  _stopWatch() {
    realtime.unwatch('wishes');
    this._watcher = null;
  },

  /**
   * 实时列表变化时重算对方动态（复用已缓存的打卡记录）
   * @param {Array} wishes
   */
  _recomputeUpdates(wishes) {
    this._renderUpdates(wishes, this._checkinRecords);
  },

  /**
   * 分类筛选
   */
  handleCategorySelect(e) {
    const category = e.detail.category;
    this.setData({ selectedCategory: category });
    this.fetchWishes();
  },

  /**
   * 切换视图（不重新请求数据）
   */
  handleViewChange(e) {
    const view = e.currentTarget.dataset.view;
    if (view !== poolView.list && view !== poolView.waterfall) return;
    if (view === this.data.view) return;

    this.setData({ view });
    try {
      wx.setStorageSync(storageKeys.poolView, view);
    } catch (err) {
      console.error('[pool] 保存视图偏好失败:', err);
    }
  },

  /**
   * 点击愿望卡片
   */
  handleWishTap(e) {
    const wish = e.detail.wish;
    wx.navigateTo({
      url: `/pages/wish/detail?id=${wish._id}`,
    });
  },

  /**
   * 瀑布视图：点击卡片
   */
  handleWaterfallTap(e) {
    // 长按后松手不再进入详情（长按的菜单会先弹出）
    if (this._waterfallLongPressAt && Date.now() - this._waterfallLongPressAt < 600) {
      return;
    }
    const wishId = e.currentTarget.dataset.id;
    if (!wishId) return;
    wx.navigateTo({ url: `/pages/wish/detail?id=${wishId}` });
  },

  /**
   * 瀑布视图：长按弹出「编辑 / 删除」
   */
  handleWaterfallLongPress(e) {
    this._waterfallLongPressAt = Date.now();
    const wishId = e.currentTarget.dataset.id;
    const wish = this._findWish(wishId);
    if (!wish) return;

    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._openEditPanel(wish);
        } else if (res.tapIndex === 1) {
          this._confirmDelete(wish);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('[pool] 长按菜单打开失败:', err);
        }
      },
    });
  },

  /**
   * 列表视图：长按（保留事件，列表视图不弹菜单）
   */
  handleWishLongPress() {},

  /**
   * 逛逛灵感库
   */
  handleGoInspiration() {
    wx.navigateTo({
      url: '/pages/inspiration/index',
      fail: (err) => {
        console.error('[pool] 打开灵感库失败:', err);
        wx.showToast({ title: '灵感库暂未开放', icon: 'none' });
      },
    });
  },

  /**
   * 编辑愿望
   */
  handleWishEdit(e) {
    this._openEditPanel(e.detail.wish);
  },

  /**
   * 打开编辑面板
   */
  _openEditPanel(wish) {
    const coverFileId = wish.coverFileId || wish.coverUrl || '';
    this.setData({
      showEditPanel: true,
      editingWish: wish,
      newWish: {
        title: wish.title,
        description: wish.description || '',
        category: wish.category,
        coverUrl: coverFileId,
        coverPreview: this._resolveCover(coverFileId),
        coverTempPath: '',
      },
    });
  },

  /**
   * 删除愿望
   */
  handleWishDelete(e) {
    this._confirmDelete(e.detail.wish);
  },

  /**
   * 删除确认
   */
  _confirmDelete(wish) {
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${wish.title}」吗？`,
      confirmColor: '#E84393',
      success: (res) => {
        if (res.confirm) {
          wishService.deleteWish(wish._id)
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.fetchWishes();
              this.fetchPartnerUpdates(true);
            })
            .catch((err) => console.error('[pool] 删除失败:', err));
        }
      },
    });
  },

  /**
   * 显示新增面板
   */
  handleShowAdd() {
    this.setData({
      showAddPanel: true,
      newWish: {
        title: '',
        description: '',
        category: 'other',
        coverUrl: '',
        coverPreview: '',
        coverTempPath: '',
      },
    });
  },

  /**
   * 隐藏新增面板
   */
  handleCloseAdd() {
    this.setData({ showAddPanel: false });
  },

  /**
   * 隐藏编辑面板
   */
  handleCloseEdit() {
    this.setData({ showEditPanel: false, editingWish: null });
  },

  /**
   * 选择封面图（相册 1 张）
   */
  handleChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        this.setData({
          'newWish.coverTempPath': file.tempFilePath,
        });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('[pool] 选择封面失败:', err);
        }
      },
    });
  },

  /**
   * 移除封面
   */
  handleRemoveCover() {
    this.setData({
      'newWish.coverUrl': '',
      'newWish.coverPreview': '',
      'newWish.coverTempPath': '',
    });
  },

  /**
   * 上传封面图，返回 fileId（未选新图时返回已有值）
   * @returns {Promise<string>}
   */
  _uploadCover() {
    const tempPath = this.data.newWish.coverTempPath;
    if (!tempPath) {
      return Promise.resolve(this.data.newWish.coverUrl || '');
    }

    const coupleId = store.getCoupleId() || 'unknown';
    const ext = getFileExt(tempPath);
    const cloudPath = `covers/${coupleId}/${Date.now()}.${ext}`;

    this.setData({ uploadingCover: true });
    return mediaService.uploadMedia(tempPath, cloudPath)
      .then((res) => {
        this.setData({ uploadingCover: false });
        return res.fileId;
      })
      .catch((err) => {
        console.error('[pool] 封面上传失败:', err);
        this.setData({ uploadingCover: false });
        throw err;
      });
  },

  /**
   * 输入标题
   */
  handleTitleInput(e) {
    this.setData({ 'newWish.title': e.detail.value });
  },

  /**
   * 输入描述
   */
  handleDescInput(e) {
    this.setData({ 'newWish.description': e.detail.value });
  },

  /**
   * 选择分类
   */
  handleCategoryChange(e) {
    this.setData({ 'newWish.category': e.currentTarget.dataset.key });
  },

  /**
   * 提交新增愿望
   */
  handleSubmitAdd() {
    if (this.data.submitting || this.data.uploadingCover) return;
    const validation = validateWishCreate(this.data.newWish);
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    this._uploadCover()
      .then((coverUrl) => {
        const payload = {
          title: this.data.newWish.title,
          description: this.data.newWish.description,
          category: this.data.newWish.category,
          coverUrl,
        };
        return wishService.createWish(payload);
      })
      .then(() => {
        wx.showToast({ title: '愿望已添加', icon: 'success' });
        this.setData({ showAddPanel: false, submitting: false });
        this.fetchWishes();
        this.fetchPartnerUpdates(true);
      })
      .catch((err) => {
        console.error('[pool] 添加失败:', err);
        this.setData({ submitting: false });
      });
  },

  /**
   * 提交编辑愿望
   */
  handleSubmitEdit() {
    if (this.data.submitting || this.data.uploadingCover) return;
    const wish = this.data.editingWish;
    const data = this.data.newWish;

    const titleCheck = validateWishTitle(data.title);
    if (!titleCheck.valid) {
      wx.showToast({ title: titleCheck.message, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    this._uploadCover()
      .then((coverUrl) => {
        return wishService.updateWish(wish._id, {
          title: data.title,
          description: data.description,
          category: data.category,
          coverUrl,
        });
      })
      .then(() => {
        wx.showToast({ title: '更新成功', icon: 'success' });
        this.setData({ showEditPanel: false, editingWish: null, submitting: false });
        this.fetchWishes();
        this.fetchPartnerUpdates(true);
      })
      .catch((err) => {
        console.error('[pool] 更新失败:', err);
        this.setData({ submitting: false });
      });
  },

  /**
   * 阻止冒泡
   */
  handleStopPropagation() {},

  onPullDownRefresh() {
    // 保持当前分类筛选；列表、今日愿望、动态一起刷新
    this._checkinRecordsLoaded = false;
    const todayPromise = this.fetchTodayEntry();
    const listPromise = this.fetchWishes();
    Promise.all([todayPromise, listPromise])
      .catch((err) => console.error('[pool] 下拉刷新失败:', err))
      .then(() => wx.stopPullDownRefresh());
  },
});
