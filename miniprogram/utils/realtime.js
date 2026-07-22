// utils/realtime.js — 实时监听封装（watchWishes/watchCheckIns/unwatch）
const store = require('./store');

const _watchers = {};

/**
 * 监听愿望列表实时变化
 * @param {Function} onChange - 回调 (snapshot)
 * @returns {Object} watcher 对象
 */
function watchWishes(onChange) {
  unwatch('wishes');

  const coupleId = store.getCoupleId();
  if (!coupleId) {
    console.warn('[realtime] coupleId 不存在，无法监听愿望');
    return null;
  }

  const db = wx.cloud.database();
  const watcher = db
    .collection('wishes')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .watch({
      onChange(snapshot) {
        if (onChange && typeof onChange === 'function') {
          onChange(snapshot);
        }
      },
      onError(err) {
        console.error('[realtime] 愿望监听错误:', err);
      },
    });

  _watchers.wishes = watcher;
  return watcher;
}

/**
 * 监听打卡记录实时变化
 * @param {Function} onChange - 回调 (snapshot)
 * @returns {Object} watcher 对象
 */
function watchCheckIns(onChange) {
  unwatch('checkins');

  const coupleId = store.getCoupleId();
  if (!coupleId) {
    console.warn('[realtime] coupleId 不存在，无法监听打卡');
    return null;
  }

  const db = wx.cloud.database();
  const watcher = db
    .collection('checkins')
    .where({ coupleId })
    .orderBy('createdAt', 'desc')
    .watch({
      onChange(snapshot) {
        if (onChange && typeof onChange === 'function') {
          onChange(snapshot);
        }
      },
      onError(err) {
        console.error('[realtime] 打卡监听错误:', err);
      },
    });

  _watchers.checkins = watcher;
  return watcher;
}

/**
 * 关闭指定监听
 * @param {string} key - 'wishes' | 'checkins'
 */
function unwatch(key) {
  if (_watchers[key]) {
    _watchers[key].close();
    delete _watchers[key];
  }
}

/**
 * 关闭所有监听
 */
function unwatchAll() {
  Object.keys(_watchers).forEach((key) => {
    unwatch(key);
  });
}

module.exports = {
  watchWishes,
  watchCheckIns,
  unwatch,
  unwatchAll,
};
