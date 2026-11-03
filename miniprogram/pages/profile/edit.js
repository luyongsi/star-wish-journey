// pages/profile/edit.js — 编辑资料页（v1.1）：头像 / 昵称 / 纪念日
const pairService = require('../../services/pair');
const mediaService = require('../../services/media');
const store = require('../../utils/store');
const { toDateKey } = require('../../utils/date');

const NICKNAME_MAX_LENGTH = 20;

/**
 * 任意日期值 → 'YYYY-MM-DD'，无法解析返回空串
 * @param {*} value
 * @returns {string}
 */
function toDateKeySafe(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return toDateKey(d);
}

/**
 * 取文件扩展名
 * @param {string} filePath
 * @returns {string}
 */
function getExt(filePath) {
  const clean = String(filePath || '').split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

/**
 * 是否为需要先下载的网络头像地址
 * 微信头像可能返回 http://tmp/ 或 http://usr/ 之类的本地临时路径，可直接上传
 * @param {string} path
 * @returns {boolean}
 */
function isRemotePath(path) {
  const value = String(path || '');
  if (!/^https?:\/\//i.test(value)) return false;
  return !/^https?:\/\/(tmp|usr|store)\//i.test(value);
}

Page({
  data: {
    userInfo: null,
    originalNickName: '',
    originalAvatarUrl: '',
    originalAnniversary: '',
    nickName: '',
    avatarUrl: '',
    avatarPreview: '',
    avatarPlaceholder: '我',
    anniversary: '',
    today: '',
    uploading: false,
    uploadFailed: false,
    saving: false,
    loading: true,
  },

  onLoad() {
    this._retryLocalPath = '';
    this._unloadAlertEnabled = false;
    this._alertSupported =
      typeof wx.enableAlertBeforeUnload === 'function' &&
      typeof wx.disableAlertBeforeUnload === 'function' &&
      (!wx.canIUse || wx.canIUse('enableAlertBeforeUnload'));

    // 纪念日 picker 不允许选未来日期
    this.setData({ today: toDateKey(new Date()) });

    this._enableUnloadAlert();
    this._loadProfile();
  },

  /**
   * 拉取当前用户与纪念日
   */
  _loadProfile() {
    pairService.getCoupleInfo()
      .then((res) => {
        const currentUser = res.currentUser || store.getUser() || {};
        const couple = res.couple || {};

        const nickName = String(currentUser.nickName || '').trim();
        const avatarUrl = String(currentUser.avatarUrl || '');
        const anniversary = toDateKeySafe(couple.anniversary);

        this.setData({
          userInfo: currentUser,
          originalNickName: nickName,
          originalAvatarUrl: avatarUrl,
          originalAnniversary: anniversary,
          nickName,
          avatarUrl,
          avatarPreview: avatarUrl,
          avatarPlaceholder: nickName ? nickName.charAt(0) : '我',
          anniversary,
          loading: false,
        });

        this._syncUnloadAlert();
      })
      .catch((err) => {
        console.error('[profile/edit] 获取资料失败:', err);
        this.setData({ loading: false });
        wx.showToast({ title: '资料加载失败，请重试', icon: 'none' });
      });
  },

  /**
   * 昵称输入：超长实时截断并提示
   */
  handleNickInput(e) {
    let value = String(e.detail.value || '');
    if (value.length > NICKNAME_MAX_LENGTH) {
      value = value.slice(0, NICKNAME_MAX_LENGTH);
      wx.showToast({ title: '昵称不能超过 20 个字', icon: 'none' });
    }
    this.setData({
      nickName: value,
      avatarPlaceholder: value ? value.charAt(0) : '我',
    });
    this._syncUnloadAlert();
  },

  /**
   * 从相册选择头像
   */
  handleChooseAlbum() {
    if (this.data.uploading) return;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this._uploadAvatar(file.tempFilePath);
      },
      fail: (err) => {
        // 用户取消选择不提示
        if (err && /cancel/i.test(err.errMsg || '')) return;
        console.error('[profile/edit] 选择图片失败:', err);
        wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
      },
    });
  },

  /**
   * 使用微信头像
   */
  handleChooseAvatar(e) {
    const avatarUrl = e && e.detail && e.detail.avatarUrl;
    if (!avatarUrl) return;
    this._uploadAvatar(avatarUrl);
  },

  /**
   * 上传失败后重试
   */
  handleRetryUpload() {
    if (this.data.uploading || !this._retryLocalPath) return;
    this._uploadAvatar(this._retryLocalPath);
  },

  /**
   * 上传头像到云存储
   * @param {string} filePath - 本地临时路径或网络地址
   */
  _uploadAvatar(filePath) {
    if (this.data.uploading) return;

    this._retryLocalPath = filePath;
    this.setData({ uploading: true, uploadFailed: false, avatarPreview: filePath });

    this._toLocalFile(filePath)
      .then((localPath) => {
        const user = this.data.userInfo || store.getUser() || {};
        const ownerId = user._id || user.openid || 'anonymous';
        const cloudPath = `avatars/${ownerId}/${Date.now()}.${getExt(localPath)}`;
        return mediaService.uploadMedia(localPath, cloudPath);
      })
      .then((res) => {
        this.setData({
          avatarUrl: res.fileId,
          avatarPreview: filePath,
          uploading: false,
          uploadFailed: false,
        });
        this._retryLocalPath = '';
        this._syncUnloadAlert();
      })
      .catch((err) => {
        console.error('[profile/edit] 头像上传失败:', err);
        // 失败时保留旧头像
        this.setData({
          uploading: false,
          uploadFailed: true,
          avatarPreview: this.data.avatarUrl,
        });
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' });
      });
  },

  /**
   * 网络地址先下载到本地临时文件（chooseAvatar 可能返回网络路径）
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  _toLocalFile(filePath) {
    if (!isRemotePath(filePath)) {
      return Promise.resolve(filePath);
    }
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: filePath,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error('头像下载失败'));
          }
        },
        fail: reject,
      });
    });
  },

  /**
   * 选择纪念日
   */
  handleAnniversaryChange(e) {
    const value = e.detail.value || '';
    this.setData({ anniversary: value });
    this._syncUnloadAlert();
  },

  /**
   * 清除纪念日（保存时置 null，回到贴贴绑定日口径）
   */
  handleClearAnniversary() {
    this.setData({ anniversary: '' });
    this._syncUnloadAlert();
  },

  /**
   * 保存：昵称/头像按需更新，纪念日按需更新
   */
  handleSave() {
    if (this.data.saving) return;

    if (this.data.uploading) {
      wx.showToast({ title: '头像上传中，请稍候', icon: 'none' });
      return;
    }

    const nickName = String(this.data.nickName || '').trim();
    if (nickName.length > NICKNAME_MAX_LENGTH) {
      wx.showToast({ title: '昵称不能超过 20 个字', icon: 'none' });
      return;
    }

    const profileParams = {};
    if (nickName !== String(this.data.originalNickName || '').trim()) {
      profileParams.nickName = nickName;
    }
    if (this.data.avatarUrl !== this.data.originalAvatarUrl) {
      profileParams.avatarUrl = this.data.avatarUrl;
    }
    const hasProfileChange = Object.keys(profileParams).length > 0;
    const anniversaryChanged = this.data.anniversary !== this.data.originalAnniversary;

    // 没有任何改动，直接返回
    if (!hasProfileChange && !anniversaryChanged) {
      this._disableUnloadAlert();
      wx.navigateBack();
      return;
    }

    this.setData({ saving: true });

    // 串行调用，避免两次全局 loading 互相覆盖
    let mergedUser = store.getUser() || this.data.userInfo || {};

    Promise.resolve()
      .then(() => {
        if (!hasProfileChange) return null;
        return pairService.updateProfile(profileParams).then((user) => {
          if (user) {
            mergedUser = Object.assign({}, mergedUser, user);
          }
          return null;
        });
      })
      .then(() => {
        if (!anniversaryChanged) return null;
        return pairService.updateAnniversary(this.data.anniversary || null);
      })
      .then(() => {
        store.setUser(mergedUser);

        const app = getApp();
        if (app && typeof app.refreshLogin === 'function') {
          app.refreshLogin().catch((err) => {
            console.error('[profile/edit] 刷新登录态失败:', err);
          });
        }

        this._disableUnloadAlert();
        this.setData({ saving: false });
        wx.showToast({ title: '已保存', icon: 'success' });

        setTimeout(() => {
          wx.navigateBack();
        }, 600);
      })
      .catch((err) => {
        console.error('[profile/edit] 保存失败:', err);
        this.setData({ saving: false });
      });
  },

  /**
   * onUnload 无法阻止离开，离开提醒由 wx.enableAlertBeforeUnload 负责；
   * 页面销毁时兜底关闭，避免影响下次进入
   */
  onUnload() {
    this._disableUnloadAlert();
  },

  /**
   * 重新判断是否有改动，同步离开提醒开关
   */
  _syncUnloadAlert() {
    if (!this._alertSupported) return;
    if (this._isDirty()) {
      this._enableUnloadAlert();
    } else {
      this._disableUnloadAlert();
    }
  },

  /**
   * 是否有未保存改动
   * @returns {boolean}
   */
  _isDirty() {
    const nickName = String(this.data.nickName || '').trim();
    return (
      nickName !== String(this.data.originalNickName || '').trim() ||
      this.data.avatarUrl !== this.data.originalAvatarUrl ||
      this.data.anniversary !== this.data.originalAnniversary
    );
  },

  _enableUnloadAlert() {
    if (!this._alertSupported || this._unloadAlertEnabled) return;
    try {
      wx.enableAlertBeforeUnload({
        message: '放弃修改？',
        fail: (err) => console.error('[profile/edit] 开启离开提醒失败:', err),
      });
      this._unloadAlertEnabled = true;
    } catch (err) {
      console.error('[profile/edit] 开启离开提醒异常:', err);
    }
  },

  _disableUnloadAlert() {
    if (!this._alertSupported || !this._unloadAlertEnabled) return;
    try {
      wx.disableAlertBeforeUnload({
        fail: (err) => console.error('[profile/edit] 关闭离开提醒失败:', err),
      });
      this._unloadAlertEnabled = false;
    } catch (err) {
      console.error('[profile/edit] 关闭离开提醒异常:', err);
    }
  },
});
