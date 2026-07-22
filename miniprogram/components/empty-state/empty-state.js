// components/empty-state/empty-state.js — 空状态占位
Component({
  properties: {
    icon: {
      type: String,
      value: '📭',
    },
    text: {
      type: String,
      value: '暂无数据',
    },
    subText: {
      type: String,
      value: '',
    },
    actionText: {
      type: String,
      value: '',
    },
  },

  methods: {
    handleAction() {
      this.triggerEvent('action');
    },
  },
});
