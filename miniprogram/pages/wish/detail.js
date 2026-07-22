// pages/wish/detail.js — 愿望详情/编辑页
const wishService = require('../../services/wish');
const checkinService = require('../../services/checkin');
const store = require('../../utils/store');
const { categoryIcons, wishStatus } = require('../../utils/constants');
const { formatRelativeTime, formatDate } = require('../../utils/format');
const { validateWishTitle } = require('../../utils/validator');
const { categories } = require('../../config/index');

Page({
  data: {
    wishId: '',
    wish: null,
    checkIn: null,
    isEditing: false,
    editForm: {
      title: '',
      description: '',
      category: 'other',
    },
    icon: '',
    statusLabel: '',
    statusClass: '',
    relativeTime: '',
    completedDate: '',
    categories: categories,
    loading: true,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ wishId: options.id });
      this.fetchWishDetail();
    }
  },

  /**
   * 获取愿望详情
   */
  fetchWishDetail() {
    wishService.listWishes({})
      .then((res) => {
        const wish = res.wishes.find((w) => w._id === this.data.wishId);
        if (!wish) {
          wx.showToast({ title: '愿望不存在', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        const icon = categoryIcons[wish.category] || '💝';
        const statusLabel = wishStatus[wish.status] || '';
        const statusClass = `status-${wish.status}`;
        const relativeTime = wish.createdAt ? formatRelativeTime(wish.createdAt) : '';
        const completedDate = wish.completedAt ? formatDate(wish.completedAt) : '';

        this.setData({
          wish,
          icon,
          statusLabel,
          statusClass,
          relativeTime,
          completedDate,
          loading: false,
          editForm: {
            title: wish.title,
            description: wish.description || '',
            category: wish.category,
          },
        });

        // 如果已完成，查询关联打卡
        if (wish.status === 'completed') {
          this.fetchRelatedCheckIn();
        }
      })
      .catch((err) => {
        console.error('[wish/detail] 获取详情失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 查询关联打卡记录
   */
  fetchRelatedCheckIn() {
    checkinService.listCheckIns()
      .then((res) => {
        const checkIn = res.completed.find((c) => c.wishId === this.data.wishId);
        if (checkIn) {
          this.setData({ checkIn });
        }
      })
      .catch((err) => console.error('[wish/detail] 获取打卡失败:', err));
  },

  /**
   * 进入编辑模式
   */
  handleStartEdit() {
    this.setData({ isEditing: true });
  },

  /**
   * 取消编辑
   */
  handleCancelEdit() {
    this.setData({
      isEditing: false,
      editForm: {
        title: this.data.wish.title,
        description: this.data.wish.description || '',
        category: this.data.wish.category,
      },
    });
  },

  /**
   * 输入标题
   */
  handleTitleInput(e) {
    this.setData({ 'editForm.title': e.detail.value });
  },

  /**
   * 输入描述
   */
  handleDescInput(e) {
    this.setData({ 'editForm.description': e.detail.value });
  },

  /**
   * 选择分类
   */
  handleCategoryChange(e) {
    this.setData({ 'editForm.category': e.currentTarget.dataset.key });
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

    wishService.updateWish(this.data.wishId, {
      title: form.title,
      description: form.description,
      category: form.category,
    })
      .then(() => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ isEditing: false });
        this.fetchWishDetail();
      })
      .catch((err) => console.error('[wish/detail] 保存失败:', err));
  },

  /**
   * 删除愿望
   */
  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定删除「${this.data.wish.title}」吗？`,
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
   * 查看打卡详情
   */
  handleViewCheckIn() {
    if (this.data.checkIn) {
      wx.navigateTo({
        url: `/pages/checkin/detail?id=${this.data.checkIn._id}`,
      });
    }
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
