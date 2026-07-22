// app.js — 小程序入口：登录、全局状态初始化、贴贴态路由守卫
const { login } = require('./services/auth');
const store = require('./utils/store');
const config = require('./config/index');

App({
  globalData: {
    userInfo: null,
    coupleInfo: null,
    isLoginReady: false,
    cloudEnvReady: false,
  },

  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: config.envId,
        traceUser: true,
      });
      this.globalData.cloudEnvReady = true;
    } else {
      console.error('[App] 当前微信版本不支持云开发，请升级到最新版本');
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，部分功能可能无法使用，请升级到最新版本。',
        showCancel: false,
      });
    }

    // 执行登录流程
    this._doLogin();
  },

  /**
   * 登录流程：调用 login 云函数获取用户和情侣信息
   * 完成后触发路由守卫检查
   */
  _doLogin() {
    login()
      .then((res) => {
        store.setUser(res.user);
        store.setCouple(res.couple || null);
        this.globalData.userInfo = res.user;
        this.globalData.coupleInfo = res.couple || null;
        this.globalData.isLoginReady = true;
        store.emit('loginReady', res);

        // 贴贴态路由守卫
        this._checkPairGuard();
      })
      .catch((err) => {
        console.error('[App] 登录失败:', err);
        this.globalData.isLoginReady = true;
        store.emit('loginReady', null);
        wx.showToast({
          title: '登录失败，请重启小程序',
          icon: 'none',
          duration: 3000,
        });
      });
  },

  /**
   * 贴贴态路由守卫
   * 如果用户未贴贴且不在贴贴页，则跳转到贴贴绑定页
   */
  _checkPairGuard() {
    const couple = store.getCouple();
    if (!couple || couple.status !== 'active') {
      const pages = getCurrentPages();
      if (pages.length > 0) {
        const currentRoute = pages[pages.length - 1].route;
        // 不在贴贴页时跳转
        if (currentRoute !== 'pages/pair/bind') {
          wx.reLaunch({ url: '/pages/pair/bind' });
        }
      }
    }
  },

  /**
   * 更新全局情侣信息（贴贴/解绑后调用）
   * @param {Object|null} couple - 情侣信息
   */
  updateCouple(couple) {
    this.globalData.coupleInfo = couple;
    store.setCouple(couple);
  },
});
