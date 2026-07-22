// components/category-tag/category-tag.js — 分类标签（筛选/选择两种模式）
const { categories } = require('../../config/index');

Component({
  properties: {
    mode: {
      type: String,
      value: 'filter', // 'filter' | 'select'
    },
    selected: {
      type: String,
      value: 'all',
    },
    showAll: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    categoryList: [],
  },

  lifetimes: {
    attached() {
      let list = [...categories];
      if (this.data.showAll && this.data.mode === 'filter') {
        list = [{ key: 'all', label: '全部', icon: '🌟' }, ...list];
      }
      this.setData({ categoryList: list });
    },
  },

  methods: {
    handleSelect(e) {
      const key = e.currentTarget.dataset.key;
      this.setData({ selected: key });
      this.triggerEvent('select', { category: key });
    },
  },
});
