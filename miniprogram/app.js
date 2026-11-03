// app.js — 小程序入口：登录、全局状态初始化、贴贴态路由守卫
const { login } = require('./services/auth');
const store = require('./utils/store');
const badge = require('./utils/badge');
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

        // 初始化 TabBar 红点
        if (store.isPaired()) {
          setTimeout(() => this.refreshBadges(), 500);
        }
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

  /**
   * 全局异常兜底：避免未捕获异常导致白屏无提示
   */
  onError(err) {
    console.error('[App] 未捕获异常:', err);
  },

  /**
   * 未处理的 Promise 拒绝
   */
  onUnhandledRejection(res) {
    console.error('[App] 未处理的 Promise 拒绝:', res.reason);
  },

  /**
   * 刷新 TabBar 红点（PRD FUN-6 / AC-23）
   * 愿望池：对方未读动态条数；打卡：今天到期或逾期的进行中愿望数
   * @returns {Promise<void>}
   */
  refreshBadges() {
    const user = store.getUser();
    if (!user || !store.isPaired()) {
      badge.refreshBadges({ poolsUnread: 0, todayDue: 0 });
      return Promise.resolve();
    }

    const wishService = require('./services/wish');
    const checkinService = require('./services/checkin');

    return Promise.all([
      wishService.listWishes({}).catch((err) => {
        console.error('[App] 红点-拉取愿望失败:', err);
        return null;
      }),
      checkinService.listCheckIns().catch((err) => {
        console.error('[App] 红点-拉取打卡失败:', err);
        return null;
      }),
    ]).then(([wishRes, checkinRes]) => {
      let poolsUnread = 0;
      let todayDue = 0;

      if (wishRes && checkinRes) {
        const stats = badge.countPartnerUpdates(
          wishRes.wishes || [],
          checkinRes.recentRecords || [],
          user.openid
        );
        poolsUnread = stats.unread;
      }

      if (checkinRes) {
        todayDue = (checkinRes.today || []).length;
      }

      badge.refreshBadges({ poolsUnread, todayDue });
    });
  },

  /**
   * 刷新登录态（解绑/重新贴贴后调用）
   * 重新拉取 user + couple，保证 coupleId、伴侣信息与服务端一致
   * @returns {Promise<Object>}
   */
  refreshLogin() {
    return login()
      .then((res) => {
        store.setUser(res.user);
        store.setCouple(res.couple || null);
        this.globalData.userInfo = res.user;
        this.globalData.coupleInfo = res.couple || null;
        this.globalData.isLoginReady = true;
        return res;
      })
      .catch((err) => {
        console.error('[App] 刷新登录态失败:', err);
        throw err;
      });
  },
});
