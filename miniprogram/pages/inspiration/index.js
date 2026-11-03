// pages/inspiration/index.js — 愿望灵感库（PRD §5.3）
const { TEMPLATES } = require('../../data/inspiration.js');
const { categories } = require('../../config/index');
const wishService = require('../../services/wish');

Page({
  data: {
    // 分类筛选：全部 + 6 个分类
    filters: [],
    selectedCategory: 'all',
    // 当前分类下要展示的模板（含 joined 状态）
    visibleTemplates: [],
    loading: true,
  },

  onLoad() {
    // 已加入集合，key 形如 `${category}||${title.trim()}`
    this._joinedSet = new Set();

    // 所有模板补上分类展示信息
    this._allTemplates = TEMPLATES.map((tpl) => {
      const matched = categories.find((c) => c.key === tpl.category);
      return {
        key: tpl.key,
        category: tpl.category,
        categoryLabel: matched ? matched.label : (tpl.category || ''),
        categoryIcon: matched ? matched.icon : '💝',
        title: tpl.title,
        desc: tpl.desc,
        joined: false,
      };
    });

    this.setData({
      filters: [{ key: 'all', label: '全部', icon: '🌟' }].concat(
        categories.map((c) => ({ key: c.key, label: c.label, icon: c.icon }))
      ),
    });

    this._applyFilter();
    this.fetchWishes();
  },

  /**
   * 拉取愿望池，构建「已加入」判定集合
   */
  fetchWishes() {
    wishService.listWishes({})
      .then((res) => {
        const wishes = (res && res.wishes) || [];
        wishes.forEach((w) => {
          if (!w || !w.title) return;
          this._joinedSet.add(`${w.category}||${String(w.title).trim()}`);
        });
        this._refreshJoined();
        this.setData({ loading: false });
      })
      .catch((err) => {
        console.error('[inspiration] 获取愿望列表失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 按当前选中分类过滤模板
   */
  _applyFilter() {
    const category = this.data.selectedCategory;
    const list = category === 'all'
      ? this._allTemplates
      : this._allTemplates.filter((t) => t.category === category);
    this.setData({ visibleTemplates: list.map((t) => ({ ...t })) });
  },

  /**
   * 依据已加入集合刷新按钮状态
   */
  _refreshJoined() {
    const category = this.data.selectedCategory;
    const list = category === 'all'
      ? this._allTemplates
      : this._allTemplates.filter((t) => t.category === category);
    this.setData({
      visibleTemplates: list.map((t) => ({
        ...t,
        joined: this._joinedSet.has(`${t.category}||${t.title.trim()}`),
      })),
    });
  },

  /**
   * 切换分类（不重新请求）
   */
  handleSelectCategory(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.selectedCategory) return;
    this.setData({ selectedCategory: key });
    this._refreshJoined();
  },

  /**
   * 加入愿望池
   */
  handleAdd(e) {
    const key = e.currentTarget.dataset.key;
    const tpl = this._allTemplates.find((t) => t.key === key);
    if (!tpl) return;

    const joinedKey = `${tpl.category}||${tpl.title.trim()}`;
    if (this._joinedSet.has(joinedKey)) return;

    // 防止连点重复提交
    if (this._adding) return;
    this._adding = true;

    wishService.createWish({
      title: tpl.title,
      category: tpl.category,
      description: tpl.desc,
    })
      .then(() => {
        this._joinedSet.add(joinedKey);
        this._refreshJoined();
        wx.showToast({ title: '已加入愿望池', icon: 'success' });
      })
      .catch((err) => {
        console.error('[inspiration] 加入愿望失败:', err);
        wx.showToast({ title: '加入失败，请重试', icon: 'none' });
      })
      .then(() => {
        this._adding = false;
      });
  },

  /**
   * 返回来源页
   */
  handleBack() {
    wx.navigateBack({
      fail: (err) => {
        console.error('[inspiration] 返回失败:', err);
        wx.switchTab({ url: '/pages/pool/index' });
      },
    });
  },
});
