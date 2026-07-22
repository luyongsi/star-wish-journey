// pages/pair/bind.js — 配对绑定页
const { createPair, joinPair, getCoupleInfo } = require('../../services/pair');
const store = require('../../utils/store');
const { validatePairCode } = require('../../utils/validator');

Page({
  data: {
    mode: 'init', // 'init' | 'created' | 'join'
    pairCode: '',
    inputCode: '',
    loading: false,
    waitingText: '等待 TA 加入...',
  },

  _pollTimer: null,
  _watcher: null,

  onLoad() {
    // 如果已配对，直接跳转
    if (store.isPaired()) {
      wx.switchTab({ url: '/pages/pool/index' });
    }
  },

  onUnload() {
    this._stopPolling();
    this._stopWatch();
  },

  onHide() {
    // 页面隐藏时也停止监听
    this._stopPolling();
    this._stopWatch();
  },

  /**
   * 发起配对
   */
  handleCreatePair() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    createPair()
      .then((res) => {
        this.setData({
          mode: 'created',
          pairCode: res.pairCode,
          loading: false,
          waitingText: '等待 TA 加入...',
        });
        // 更新全局状态
        store.setCouple(res.couple);
        // 开始监听配对状态变化
        this._startWatching(res.couple._id);
        this._startPolling();
      })
      .catch((err) => {
        console.error('[pair/bind] 发起配对失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 监听 couple 文档变化（实时方案）
   */
  _startWatching(coupleId) {
    this._stopWatch();
    try {
      const db = wx.cloud.database();
      this._watcher = db
        .collection('couples')
        .doc(coupleId)
        .watch({
          onChange: (snapshot) => {
            console.log('[pair/bind] watch onChange:', snapshot);
            if (snapshot.docs && snapshot.docs.length > 0) {
              const couple = snapshot.docs[0];
              if (couple.status === 'active') {
                this._onPaired(couple);
              }
            } else if (snapshot.docChanges && snapshot.docChanges.length > 0) {
              const change = snapshot.docChanges[0];
              if (change.doc && change.doc.status === 'active') {
                this._onPaired(change.doc);
              }
            }
          },
          onError: (err) => {
            console.error('[pair/bind] watch 错误，依赖轮询:', err);
          },
        });
    } catch (err) {
      console.error('[pair/bind] watch 初始化失败，依赖轮询:', err);
    }
  },

  _stopWatch() {
    if (this._watcher) {
      try {
        this._watcher.close();
      } catch (e) {
        // ignore
      }
      this._watcher = null;
    }
  },

  /**
   * 轮询检查配对状态（watch 的兜底方案）
   */
  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      getCoupleInfo()
        .then((res) => {
          if (res.couple && res.couple.status === 'active') {
            this._onPaired(res.couple);
          }
        })
        .catch(() => {
          // 静默失败，下次继续
        });
    }, 3000);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  /**
   * 配对成功，跳转首页
   */
  _onPaired(couple) {
    // 防止重复触发
    if (this._paired) return;
    this._paired = true;

    this._stopPolling();
    this._stopWatch();

    // 更新全局状态
    store.setCouple(couple);
    const app = getApp();
    app.updateCouple(couple);

    this.setData({ waitingText: '配对成功！正在进入...' });

    wx.showToast({ title: '配对成功！', icon: 'success' });

    setTimeout(() => {
      wx.switchTab({ url: '/pages/pool/index' });
    }, 1500);
  },

  /**
   * 手动检查配对状态（用户点击"已配对？刷新"按钮）
   */
  handleCheckStatus() {
    this.setData({ waitingText: '检查中...' });
    getCoupleInfo()
      .then((res) => {
        if (res.couple && res.couple.status === 'active') {
          this._onPaired(res.couple);
        } else {
          this.setData({ waitingText: '等待 TA 加入...' });
          wx.showToast({ title: '还没有加入哦', icon: 'none' });
        }
      })
      .catch(() => {
        this.setData({ waitingText: '等待 TA 加入...' });
      });
  },

  /**
   * 切换到加入模式
   */
  handleShowJoin() {
    this.setData({ mode: 'join' });
  },

  /**
   * 输入配对码
   */
  handleInputCode(e) {
    let value = e.detail.value.replace(/\D/g, '').substring(0, 6);
    this.setData({ inputCode: value });
  },

  /**
   * 加入配对
   */
  handleJoinPair() {
    if (this.data.loading) return;

    const validation = validatePairCode(this.data.inputCode);
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    joinPair(this.data.inputCode)
      .then((res) => {
        // 更新全局状态
        store.setCouple(res.couple);
        const app = getApp();
        app.updateCouple(res.couple);

        wx.showToast({ title: '配对成功', icon: 'success' });

        setTimeout(() => {
          wx.switchTab({ url: '/pages/pool/index' });
        }, 1500);
      })
      .catch((err) => {
        console.error('[pair/bind] 加入配对失败:', err);
        this.setData({ loading: false });
      });
  },

  /**
   * 返回初始模式
   */
  handleBack() {
    this.setData({ mode: 'init', inputCode: '' });
  },

  /**
   * 复制配对码
   */
  handleCopyCode() {
    wx.setClipboardData({
      data: this.data.pairCode,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },
});
