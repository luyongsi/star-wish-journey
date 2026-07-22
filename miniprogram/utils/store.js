// utils/store.js — 全局状态管理（user/couple 缓存 + 事件总线）

const _state = {
  user: null,
  couple: null,
};

const _listeners = {};

/**
 * 事件总线：注册监听
 * @param {string} event - 事件名
 * @param {Function} handler - 回调函数
 */
function on(event, handler) {
  if (!_listeners[event]) {
    _listeners[event] = [];
  }
  _listeners[event].push(handler);
}

/**
 * 事件总线：触发事件
 * @param {string} event - 事件名
 * @param {*} data - 传递给回调的数据
 */
function emit(event, data) {
  if (_listeners[event]) {
    _listeners[event].forEach((handler) => {
      try {
        handler(data);
      } catch (e) {
        console.error(`[store] 事件 ${event} 回调异常:`, e);
      }
    });
  }
}

/**
 * 事件总线：移除监听
 * @param {string} event - 事件名
 * @param {Function} [handler] - 指定回调；不传则移除该事件所有监听
 */
function off(event, handler) {
  if (!_listeners[event]) return;
  if (handler) {
    _listeners[event] = _listeners[event].filter((h) => h !== handler);
  } else {
    _listeners[event] = [];
  }
}

/**
 * 获取当前用户信息
 * @returns {Object|null}
 */
function getUser() {
  return _state.user;
}

/**
 * 设置用户信息
 * @param {Object} user
 */
function setUser(user) {
  _state.user = user;
}

/**
 * 获取当前情侣信息
 * @returns {Object|null}
 */
function getCouple() {
  return _state.couple;
}

/**
 * 设置情侣信息
 * @param {Object|null} couple
 */
function setCouple(couple) {
  _state.couple = couple;
  emit('coupleChange', couple);
}

/**
 * 获取 coupleId
 * @returns {string|null}
 */
function getCoupleId() {
  return _state.couple ? _state.couple._id : null;
}

/**
 * 判断是否已贴贴
 * @returns {boolean}
 */
function isPaired() {
  return _state.couple && _state.couple.status === 'active';
}

/**
 * 判断当前 openid 是否为情侣的 userA
 * @param {string} openid
 * @returns {boolean}
 */
function isUserA(openid) {
  return _state.couple && _state.couple.userA === openid;
}

module.exports = {
  on,
  emit,
  off,
  getUser,
  setUser,
  getCouple,
  setCouple,
  getCoupleId,
  isPaired,
  isUserA,
};
