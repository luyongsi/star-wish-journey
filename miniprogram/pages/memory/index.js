// pages/memory/index.js — 回忆 Tab 页（时间线 / 成就 / 足迹）
const memoryService = require('../../services/memory');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { categoryIcons } = require('../../utils/constants');
const { formatDate } = require('../../utils/format');
const mapUtil = require('../../utils/map');

// 足迹地图视口宽度（px），用于估算缩放级别
const MAP_VIEWPORT_WIDTH = 340;
// 无足迹时的默认视图（西安）
const DEFAULT_MAP_VIEW = {
  center: { latitude: 34.26, longitude: 108.94 },
  scale: 5,
};

/**
 * 补零
 * @param {number} n
 * @returns {string}
 */
function _pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

Page({
  data: {
    // 当前分段：timeline / achievements / footprints
    activeTab: 'timeline',
    currentYear: new Date().getFullYear(),

    // ===== 时间线 =====
    timelineLoaded: false,
    timelineError: false,
    groups: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadingMore: false,
    total: 0,

    // ===== 成就 =====
    achLoaded: false,
    achLoading: false,
    achError: false,
    achievements: [],
    achievedCount: 0,
    achTotal: 12,
    wishCompleted: 0,
    checkInTotal: 0,

    // ===== 足迹 =====
    fpLoaded: false,
    fpLoading: false,
    fpError: false,
    markers: [],
    mapView: DEFAULT_MAP_VIEW,
    cities: [],
    totalPoints: 0,
    totalCities: 0,
    activeCity: '',
  },

  onLoad() {
    this._ready = false;
    this._loginHandler = null;
    // 原始足迹点（markers 的 id 为数组下标，据此回查 checkInId / city）
    this._markerPoints = [];
    this._checkLoginReady();
  },

  /**
   * 每次切回本 Tab 时刷新当前分段
   * 打卡 / 建愿望会改变时间线、成就、足迹，必须重新拉取
   */
  onShow() {
    if (!this._ready) return;
    this._refreshActiveTab();
  },

  onUnload() {
    if (this._loginHandler) {
      store.off('loginReady', this._loginHandler);
      this._loginHandler = null;
    }
  },

  /**
   * 刷新当前分段（Tab 页 onShow 调用）
   * 强制重算成就，避免读到 10 分钟内的旧缓存
   */
  _refreshActiveTab() {
    const tab = this.data.activeTab;
    if (tab === 'achievements') {
      this.setData({ achLoaded: false, achError: false });
      this._reloadAchievements();
      return;
    }
    if (tab === 'footprints') {
      this.setData({ fpLoaded: false, fpError: false });
      this._reloadFootprints();
      return;
    }
    if (!this.data.loading) {
      this.fetchTimeline();
    }
  },

  /**
   * 强制重算成就（跳过 10 分钟缓存）
   */
  _reloadAchievements() {
    if (this.data.achLoading) return;
    this.fetchAchievements(true);
  },

  /**
   * 重新加载足迹
   */
  _reloadFootprints() {
    if (this.data.fpLoading) return;
    this.fetchFootprints(true);
  },

  /**
   * 未贴贴守卫 + loginReady（沿用 v1.0 写法）
   */
  _checkLoginReady() {
    const app = getApp();
    const onReady = () => {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this._ready = true;
      // 登录就绪后加载当前分段（用户可能在登录完成前就切换了分段）
      this._ensureTabData(this.data.activeTab);
    };

    if (app.globalData.isLoginReady) {
      onReady();
    } else {
      this._loginHandler = onReady;
      store.on('loginReady', onReady);
    }
  },

  /**
   * 首次进入某分段时加载数据，已加载过的不再重复请求
   * @param {'timeline'|'achievements'|'footprints'} tab
   */
  _ensureTabData(tab) {
    if (!this._ready) return;
    if (tab === 'timeline' && !this.data.timelineLoaded) {
      this.fetchTimeline();
    } else if (tab === 'achievements' && !this.data.achLoaded) {
      this.fetchAchievements();
    } else if (tab === 'footprints' && !this.data.fpLoaded) {
      this.fetchFootprints();
    }
  },

  /**
   * 切换分段：同页切换，状态独立保留
   */
  handleSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    this._ensureTabData(tab);
  },

  // ===================== 时间线 =====================

  /**
   * 获取时间线（第一页）
   */
  fetchTimeline() {
    if (this.data.loading || this.data.timelineLoaded) return;
    this.setData({ loading: true, page: 1 });

    memoryService.getTimeline(1)
      .then((res) => {
        const groups = this._processGroups(res.groups || []);
        this.setData({
          groups,
          hasMore: !!res.hasMore,
          total: res.total || 0,
          loading: false,
          timelineLoaded: true,
          timelineError: false,
        });

        // 加载缩略图URL
        this._loadThumbUrls(groups);
      })
      .catch((err) => {
        console.error('[memory] 获取时间线失败:', err);
        this.setData({ loading: false, timelineError: true });
      });
  },

  /**
   * 加载更多
   */
  handleLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    const nextPage = this.data.page + 1;
    this.setData({ loadingMore: true });

    memoryService.getTimeline(nextPage)
      .then((res) => {
        const newGroups = this._processGroups(res.groups || []);
        const mergedGroups = this._mergeGroups(this.data.groups, newGroups);

        this.setData({
          groups: mergedGroups,
          page: nextPage,
          hasMore: !!res.hasMore,
          loadingMore: false,
        });

        this._loadThumbUrls(newGroups);
      })
      .catch((err) => {
        console.error('[memory] 加载更多失败:', err);
        this.setData({ loadingMore: false });
      });
  },

  /**
   * 处理分组数据（MM-DD、媒体数、分类图标）
   * 说明：时间线 item 即一条打卡记录，记录数恒为 1，故不展示记录数
   */
  _processGroups(groups) {
    return groups.map((group) => ({
      ...group,
      items: (group.items || []).map((item) => {
        const d = item.createdAt ? new Date(item.createdAt) : null;
        const valid = d && !isNaN(d.getTime());
        const mediaCount = (item.mediaList && item.mediaList.length) || 0;
        return {
          ...item,
          mediaCount,
          mediaText: mediaCount > 0 ? `${mediaCount} 张` : '纯文字',
          dateStr: valid ? `${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}` : '',
          categoryIcon: categoryIcons[item.wishCategory] || '💝',
        };
      }),
    }));
  },

  /**
   * 合并分组（同月份合并），不原地修改旧数据
   */
  _mergeGroups(oldGroups, newGroups) {
    const merged = oldGroups.map((g) => ({ ...g, items: [...g.items] }));
    newGroups.forEach((newGroup) => {
      const existing = merged.find((g) => g.month === newGroup.month);
      if (existing) {
        existing.items = existing.items.concat(newGroup.items);
      } else {
        merged.push(newGroup);
      }
    });
    return merged;
  },

  /**
   * 取封面媒体：优先首张图片，没有图片时退回 mediaList[0]
   * @param {Object} item
   * @returns {Object|null}
   */
  _pickCover(item) {
    const list = (item && item.mediaList) || [];
    if (list.length === 0) return null;
    return list.find((m) => m && m.type !== 'video') || list[0];
  },

  /**
   * 加载缩略图URL（封面取 mediaList[0]）
   */
  _loadThumbUrls(groups) {
    const allFileIds = [];
    groups.forEach((group) => {
      (group.items || []).forEach((item) => {
        const cover = this._pickCover(item);
        if (cover && cover.fileId) {
          allFileIds.push(cover.fileId);
        }
      });
    });

    if (allFileIds.length === 0) return;

    mediaService.getTempFileURL([...new Set(allFileIds)])
      .then((fileList) => {
        const urlMap = {};
        (fileList || []).forEach((f) => {
          urlMap[f.fileID] = f.tempFileURL;
        });

        // 只更新对应批次的卡片，避免覆盖后续分页新增的数据
        const batchIds = {};
        groups.forEach((group) => {
          (group.items || []).forEach((item) => {
            if (item._id) batchIds[item._id] = true;
          });
        });

        const updatedGroups = this.data.groups.map((group) => ({
          ...group,
          items: (group.items || []).map((item) => {
            if (!batchIds[item._id]) return item;
            const cover = this._pickCover(item);
            if (cover) {
              const fileId = cover.fileId;
              return {
                ...item,
                thumbUrl: urlMap[fileId] || cover.url || fileId,
              };
            }
            return item;
          }),
        }));

        this.setData({ groups: updatedGroups });
      })
      .catch((err) => console.error('[memory] 加载缩略图失败:', err));
  },

  /**
   * 进入回忆详情
   * 注：PRD §3 已合并「回忆详情」与「打卡详情」为同一页面，统一走 checkin/detail
   */
  handleViewDetail(e) {
    const checkInId = e.currentTarget.dataset.id;
    if (!checkInId) return;
    wx.navigateTo({
      url: `/pages/checkin/detail?id=${checkInId}`,
    });
  },

  // ===================== 成就 =====================

  /**
   * 获取成就墙 + 年度摘要（成就分段首次进入时调用）
   */
  fetchAchievements(refresh) {
    if (this.data.achLoading) return;
    if (!refresh && this.data.achLoaded) return;
    this.setData({ achLoading: true });

    Promise.all([
      memoryService.getAchievements(!!refresh).catch((err) => {
        console.error('[memory] 获取成就失败:', err);
        return null;
      }),
      memoryService.getAnnualReport(this.data.currentYear).catch((err) => {
        console.error('[memory] 获取年度摘要失败:', err);
        return null;
      }),
    ])
      .then((results) => {
        const achRes = results[0];
        const report = results[1];

        if (!achRes) {
          // 成就接口失败时允许通过重试再次拉取
          this.setData({ achLoading: false, achError: true });
          return;
        }

        this.setData({
          achLoading: false,
          achLoaded: true,
          achError: false,
          achievements: achRes.list || [],
          achievedCount: achRes.achievedCount || 0,
          achTotal: achRes.total || 12,
          wishCompleted: report ? report.wishCompleted || 0 : 0,
          checkInTotal: report ? report.checkInTotal || 0 : 0,
        });
      })
      .catch((err) => {
        console.error('[memory] 处理成就数据失败:', err);
        this.setData({ achLoading: false, achError: true });
      });
  },

  /**
   * 点击成就：弹窗显示名称、说明、达成状态/进度
   */
  handleAchievementTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.achievements[index];
    if (!item) return;

    const statusText = item.achieved
      ? '状态：已达成'
      : `当前进度：${item.progressText || `${item.current}/${item.target}`}`;

    wx.showModal({
      title: item.name,
      content: `${item.desc || ''}\n${statusText}`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  /**
   * 进入年度报告
   */
  handleGoReport() {
    wx.navigateTo({
      url: `/pages/memory/report?year=${this.data.currentYear}`,
    });
  },

  // ===================== 足迹 =====================

  /**
   * 获取足迹（地图标记 + 城市聚合）
   */
  fetchFootprints(refresh) {
    if (this.data.fpLoading) return;
    if (!refresh && this.data.fpLoaded) return;
    this.setData({ fpLoading: true });

    memoryService.getFootprints()
      .then((res) => {
        const points = res.markers || [];
        this._markerPoints = points;

        const cities = (res.cities || []).map((c) => ({
          ...c,
          lastAtStr: c.lastAt ? formatDate(c.lastAt) : '',
        }));

        const totalPoints = res.totalPoints || 0;

        this.setData({
          fpLoading: false,
          fpLoaded: true,
          fpError: false,
          markers: this._toMapMarkers(points),
          cities,
          totalPoints,
          totalCities: res.totalCities || 0,
          activeCity: '',
          mapView: points.length > 0
            ? mapUtil.viewport(points, MAP_VIEWPORT_WIDTH)
            : DEFAULT_MAP_VIEW,
        });
      })
      .catch((err) => {
        console.error('[memory] 获取足迹失败:', err);
        this.setData({ fpLoading: false, fpError: true });
      });
  },

  /**
   * 转换为微信 map 组件的 marker 格式（id 必须为 number，用数组下标）
   */
  _toMapMarkers(points) {
    return (points || []).map((p, index) => {
      const dateStr = p.createdAt ? formatDate(p.createdAt) : '';
      const countSuffix = p.count > 1 ? ` ×${p.count}` : '';
      return {
        id: index,
        latitude: p.latitude,
        longitude: p.longitude,
        width: 28,
        height: 28,
        callout: {
          content: `${p.wishTitle || '愿望打卡'}\n${dateStr}${countSuffix}`,
          display: 'BYCLICK',
          padding: 8,
          borderRadius: 6,
          fontSize: 12,
        },
      };
    });
  },

  /**
   * 点击地图标记 → 该条打卡详情
   */
  handleMarkerTap(e) {
    const markerId = Number(e.detail && e.detail.markerId);
    const point = (this._markerPoints || [])[markerId];
    if (!point || !point.checkInId) return;

    wx.navigateTo({
      url: `/pages/checkin/detail?id=${point.checkInId}`,
    });
  },

  /**
   * 点击城市 → 地图定位到该城市范围并高亮该行
   */
  handleCityTap(e) {
    const city = e.currentTarget.dataset.city;
    if (!city) return;

    const points = (this._markerPoints || []).filter(
      (p) => (p.city || '其他地点') === city
    );
    this.setData({ activeCity: city });
    this._moveMapTo(points);
  },

  /**
   * 回到全国 → 缩放到包含全部标记
   */
  handleResetView() {
    this.setData({ activeCity: '' });
    this._moveMapTo(this._markerPoints || []);
  },

  /**
   * 移动地图到指定点集（setData viewport + includePoints 兜底）
   */
  _moveMapTo(points) {
    if (!points || points.length === 0) return;

    this.setData({ mapView: mapUtil.viewport(points, MAP_VIEWPORT_WIDTH) });

    // 同一坐标重复点击时 mapView 数据可能不变，用 MapContext 再拟合一次
    try {
      const mapCtx = wx.createMapContext('footprintMap', this);
      if (mapCtx && mapCtx.includePoints) {
        mapCtx.includePoints({
          points: points.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
          })),
          padding: [40, 40, 40, 40],
          fail: (err) => console.error('[memory] 地图 includePoints 失败:', err),
        });
      }
    } catch (err) {
      console.error('[memory] 地图定位失败:', err);
    }
  },
});
