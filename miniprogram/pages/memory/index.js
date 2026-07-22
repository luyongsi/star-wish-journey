// pages/memory/index.js — 回忆录列表页
const memoryService = require('../../services/memory');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { formatDate } = require('../../utils/format');

Page({
  data: {
    groups: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadingMore: false,
    total: 0,
  },

  onLoad() {
    this._checkLoginReady();
  },

  _checkLoginReady() {
    const app = getApp();
    if (app.globalData.isLoginReady) {
      if (!store.isPaired()) {
        wx.reLaunch({ url: '/pages/pair/bind' });
        return;
      }
      this.fetchTimeline();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this.fetchTimeline();
      });
    }
  },

  /**
   * 获取时间线
   */
  fetchTimeline() {
    if (this.data.loading) return;
    this.setData({ loading: true, page: 1 });

    memoryService.getTimeline(1)
      .then((res) => {
        const groups = this._processGroups(res.groups);
        this.setData({
          groups,
          hasMore: res.hasMore,
          total: res.total,
          loading: false,
        });

        // 加载缩略图URL
        this._loadThumbUrls(groups);
      })
      .catch((err) => {
        console.error('[memory] 获取时间线失败:', err);
        this.setData({ loading: false });
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
        const newGroups = this._processGroups(res.groups);
        const mergedGroups = this._mergeGroups(this.data.groups, newGroups);

        this.setData({
          groups: mergedGroups,
          page: nextPage,
          hasMore: res.hasMore,
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
   * 处理分组数据（格式化日期等）
   */
  _processGroups(groups) {
    return groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        dateStr: item.createdAt ? formatDate(item.createdAt) : '',
      })),
    }));
  },

  /**
   * 合并分组（同月份合并）
   */
  _mergeGroups(oldGroups, newGroups) {
    const merged = [...oldGroups];
    for (const newGroup of newGroups) {
      const existing = merged.find((g) => g.month === newGroup.month);
      if (existing) {
        existing.items.push(...newGroup.items);
      } else {
        merged.push(newGroup);
      }
    }
    return merged;
  },

  /**
   * 加载缩略图URL
   */
  _loadThumbUrls(groups) {
    const allFileIds = [];
    groups.forEach((group) => {
      group.items.forEach((item) => {
        if (item.mediaList && item.mediaList[0]) {
          allFileIds.push(item.mediaList[0].fileId);
        }
      });
    });

    if (allFileIds.length === 0) return;

    mediaService.getTempFileURL([...new Set(allFileIds)])
      .then((fileList) => {
        const urlMap = {};
        fileList.forEach((f) => {
          urlMap[f.fileID] = f.tempFileURL;
        });

        // 更新 groups 中的缩略图URL
        const updatedGroups = this.data.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            if (item.mediaList && item.mediaList[0]) {
              const fileId = item.mediaList[0].fileId;
              return {
                ...item,
                thumbUrl: urlMap[fileId] || item.mediaList[0].url || fileId,
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
   */
  handleViewDetail(e) {
    const checkInId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/memory/detail?id=${checkInId}`,
    });
  },
});
