// components/draw-animation/draw-animation.js — 抽取滚动动画
// 卡片快速滚动~2s 后停住

Component({
  properties: {
    wishes: {
      type: Array,
      value: [],
    },
    isRunning: {
      type: Boolean,
      value: false,
    },
    result: {
      type: Object,
      value: null,
    },
  },

  data: {
    displayWish: null,
    scrollIndex: 0,
    animating: false,
  },

  observers: {
    'isRunning': function (isRunning) {
      if (isRunning && this.data.wishes.length > 0) {
        this._startAnimation();
      }
    },
    'result': function (result) {
      if (result) {
        this._stopAnimation(result);
      }
    },
  },

  _timer: null,

  lifetimes: {
    detached() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    },
  },

  methods: {
    /**
     * 开始滚动动画
     */
    _startAnimation() {
      this.setData({ animating: true });
      const wishes = this.data.wishes;
      if (wishes.length === 0) return;

      let index = 0;
      let interval = 50; // 初始快速滚动

      const animate = () => {
        this.setData({
          displayWish: wishes[index % wishes.length],
          scrollIndex: index,
        });
        index++;

        // 逐渐减速
        if (index > 20) interval = 100;
        if (index > 30) interval = 200;

        if (this._timer) {
          clearInterval(this._timer);
        }
        this._timer = setInterval(animate, interval);
      };

      animate();
    },

    /**
     * 停止动画，显示结果
     */
    _stopAnimation(result) {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
      this.setData({
        displayWish: result,
        animating: false,
      });
      this.triggerEvent('done', { wish: result });
    },
  },
});
