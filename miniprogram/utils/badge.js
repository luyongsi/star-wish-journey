// utils/badge.js — TabBar 红点（PRD FUN-6 / AC-23）
const { storageKeys } = require('./constants');

const POOL_TAB_INDEX = 0;
const CHECKIN_TAB_INDEX = 2;

/**
 * 设置 Tab 红点
 * @param {number} index
 * @param {number} count - 0 表示清除
 */
function setTabBadge(index, count) {
  try {
    if (count > 0) {
      wx.setTabBarBadge({
        index,
        text: count > 9 ? '9+' : String(count),
        fail: () => {},
      });
    } else {
      wx.removeTabBarBadge({ index, fail: () => {} });
    }
  } catch (e) {
    // 非 TabBar 页面调用会报错，忽略
  }
}

/**
 * 读取上次查看愿望池的时间
 * @returns {number}
 */
function getLastReadAt() {
  try {
    return Number(wx.getStorageSync(storageKeys.readAt)) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 记录本次查看愿望池的时间
 */
function markRead() {
  try {
    wx.setStorageSync(storageKeys.readAt, Date.now());
  } catch (e) {
    // ignore
  }
}

/**
 * 统计对方未读动态条数（新增愿望 / 完成愿望 / 新增记录，7 天内）
 * 文案严格按 PRD §5.1 A3 的模板生成，打卡类需带愿望标题
 * @param {Array} wishes
 * @param {Array} checkins
 * @param {string} myOpenid
 * @returns {{ unread: number, recent: Array }}
 */
function countPartnerUpdates(wishes, checkins, myOpenid) {
  const lastReadAt = getLastReadAt();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const items = [];

  (wishes || []).forEach((w) => {
    if (!w.createdBy || w.createdBy === myOpenid) return;
    const t = new Date(w.createdAt).getTime();
    if (!t) return;
    items.push({
      type: 'wish-create',
      title: w.title,
      wishId: w._id,
      at: t,
      text: `TA 添加了「${w.title}」`,
    });
    if (w.status === 'completed' && w.completedAt) {
      const ct = new Date(w.completedAt).getTime();
      if (ct) {
        items.push({
          type: 'wish-complete',
          title: w.title,
          wishId: w._id,
          at: ct,
          text: `TA 完成了「${w.title}」`,
        });
      }
    }
  });

  // 愿望标题索引，用于打卡文案补标题
  const titleMap = {};
  (wishes || []).forEach((w) => {
    titleMap[w._id] = w.title;
  });

  (checkins || []).forEach((c) => {
    if (!c.checkInBy || c.checkInBy === myOpenid) return;
    const t = new Date(c.createdAt).getTime();
    if (!t) return;
    const mediaCount = (c.mediaList || []).length;
    const title = titleMap[c.wishId] || '';
    let text;
    if (mediaCount > 0) {
      text = title
        ? `TA 记录了「${title}」的 ${mediaCount} 张照片`
        : `TA 记录了 ${mediaCount} 张照片`;
    } else {
      text = title ? `TA 为「${title}」留了一条记录` : 'TA 留了一条记录';
    }
    items.push({
      type: 'checkin',
      checkInId: c._id,
      wishId: c.wishId,
      at: t,
      text,
    });
  });

  const recent = items
    .filter((i) => i.at >= sevenDaysAgo)
    .sort((a, b) => b.at - a.at);

  const unread = recent.filter((i) => i.at > lastReadAt).length;
  return { unread, recent };
}

/**
 * 刷新两个红点
 * @param {Object} params - { poolsUnread, todayDue }
 */
function refreshBadges(params) {
  const { poolsUnread = 0, todayDue = 0 } = params || {};
  setTabBadge(POOL_TAB_INDEX, poolsUnread);
  setTabBadge(CHECKIN_TAB_INDEX, todayDue);
}

module.exports = {
  setTabBadge,
  getLastReadAt,
  markRead,
  countPartnerUpdates,
  refreshBadges,
  POOL_TAB_INDEX,
  CHECKIN_TAB_INDEX,
};
