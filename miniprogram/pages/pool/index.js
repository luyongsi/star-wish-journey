// pages/pool/index.js — 首页愿望池
const wishService = require('../../services/wish');
const realtime = require('../../utils/realtime');
const store = require('../../utils/store');
const { validateWishCreate, validateWishTitle } = require('../../utils/validator');
const { categories } = require('../../config/index');

Page({
  data: {
    wishes: [],
    stats: { total: 0, completed: 0, ongoing: 0, pending: 0 },
    selectedCategory: 'all',
    showAddPanel: false,
    showEditPanel: false,
    editingWish: null,
    newWish: {
      title: '',
      description: '',
      category: 'other',
    },
    categories: categories,
    loading: true,
  },

  _watcher: null,

  onLoad() {
    this._checkLoginReady();
  },

  onShow() {
    if (store.isPaired()) {
      this.fetchWishes();
      this._startWatch();
    }
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
      this.fetchWishes();
      this._startWatch();
    } else {
      store.on('loginReady', () => {
        if (!store.isPaired()) {
          wx.reLaunch({ url: '/pages/pair/bind' });
          return;
        }
        this.fetchWishes();
        this._startWatch();
      });
    }
  },

  /**
   * 拉取愿望列表
   */
  fetchWishes() {
    const filters = {};
    if (this.data.selectedCategory !== 'all') {
      filters.category = this.data.selectedCategory;
    }

    wishService.listWishes(filters)
      .then((res) => {
        this.setData({
          wishes: res.wishes,
          stats: res.stats,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[pool] 获取愿望列表失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 开始实时监听
   */
  _startWatch() {
    this._watcher = realtime.watchWishes((snapshot) => {
      if (snapshot && snapshot.docs) {
        // watch 推送后整体替换本地列表
        const allWishes = snapshot.docs.sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // 按当前筛选过滤
        let filtered = allWishes;
        if (this.data.selectedCategory !== 'all') {
          filtered = allWishes.filter((w) => w.category === this.data.selectedCategory);
        }

        // 重新统计
        const stats = {
          total: allWishes.length,
          completed: allWishes.filter((w) => w.status === 'completed').length,
          ongoing: allWishes.filter((w) => w.status === 'ongoing').length,
          pending: allWishes.filter((w) => w.status === 'pending').length,
        };

        this.setData({ wishes: filtered, stats });
      }
    });
  },

  _stopWatch() {
    realtime.unwatch('wishes');
    this._watcher = null;
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
   * 点击愿望卡片
   */
  handleWishTap(e) {
    const wish = e.detail.wish;
    wx.navigateTo({
      url: `/pages/wish/detail?id=${wish._id}`,
    });
  },

  /**
   * 编辑愿望
   */
  handleWishEdit(e) {
    const wish = e.detail.wish;
    this.setData({
      showEditPanel: true,
      editingWish: wish,
      newWish: {
        title: wish.title,
        description: wish.description || '',
        category: wish.category,
      },
    });
  },

  /**
   * 删除愿望
   */
  handleWishDelete(e) {
    const wish = e.detail.wish;
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
      newWish: { title: '', description: '', category: 'other' },
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
    const validation = validateWishCreate(this.data.newWish);
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' });
      return;
    }

    wishService.createWish(this.data.newWish)
      .then(() => {
        wx.showToast({ title: '愿望已添加', icon: 'success' });
        this.setData({ showAddPanel: false });
        this.fetchWishes();
      })
      .catch((err) => console.error('[pool] 添加失败:', err));
  },

  /**
   * 提交编辑愿望
   */
  handleSubmitEdit() {
    const wish = this.data.editingWish;
    const data = this.data.newWish;

    const titleCheck = validateWishTitle(data.title);
    if (!titleCheck.valid) {
      wx.showToast({ title: titleCheck.message, icon: 'none' });
      return;
    }

    wishService.updateWish(wish._id, {
      title: data.title,
      description: data.description,
      category: data.category,
    })
      .then(() => {
        wx.showToast({ title: '更新成功', icon: 'success' });
        this.setData({ showEditPanel: false, editingWish: null });
        this.fetchWishes();
      })
      .catch((err) => console.error('[pool] 更新失败:', err));
  },

  /**
   * 阻止冒泡
   */
  handleStopPropagation() {},

  onPullDownRefresh() {
    this.fetchWishes();
    wx.stopPullDownRefresh();
  },
});
