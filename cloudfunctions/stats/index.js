// cloudfunctions/stats/index.js — 统计云函数(P2)
// switch(action): overview

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');

const VALID_CATEGORIES = ['food', 'travel', 'sport', 'movie', 'home', 'other'];

/**
 * 校验 openid 属于 active couple
 * @param {string} openid
 * @returns {Promise<{ couple: Object }>}
 */
async function _checkCouple(openid) {
  const userQuery = await usersCollection.where({ openid }).get();
  if (userQuery.data.length === 0 || !userQuery.data[0].coupleId) {
    const err = new Error('未贴贴');
    err.code = 1001;
    throw err;
  }
  const user = userQuery.data[0];
  const coupleQuery = await couplesCollection.doc(user.coupleId).get();
  if (!coupleQuery.data || coupleQuery.data.status !== 'active') {
    const err = new Error('未贴贴');
    err.code = 1001;
    throw err;
  }
  return { couple: coupleQuery.data };
}

/**
 * 统计云函数主入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'overview':
        return await _handleOverview(openid);
      default:
        return { code: 1004, data: null, message: '未知的 action: ' + action };
    }
  } catch (err) {
    console.error('[stats] action=' + action + ' 失败:', err);
    return {
      code: err.code || 500,
      data: null,
      message: err.message || '操作失败',
    };
  }
};

/**
 * 总览统计：愿望总数、已完成数、打卡数、热门分类
 */
async function _handleOverview(openid) {
  const { couple } = await _checkCouple(openid);

  const coupleId = couple._id;

  // 愿望统计
  const wishesQuery = await wishesCollection.where({ coupleId }).get();
  const wishTotal = wishesQuery.data.length;
  const wishCompleted = wishesQuery.data.filter((w) => w.status === 'completed').length;

  // 打卡统计
  const checkinsCount = await checkinsCollection.where({ coupleId }).count();
  const checkInTotal = checkinsCount.total;

  // 热门分类统计
  const categoryCount = {};
  VALID_CATEGORIES.forEach((cat) => {
    categoryCount[cat] = 0;
  });
  wishesQuery.data.forEach((w) => {
    if (categoryCount[w.category] !== undefined) {
      categoryCount[w.category]++;
    }
  });

  // 找出最多的分类
  let topCategory = null;
  let topCount = 0;
  for (const [cat, count] of Object.entries(categoryCount)) {
    if (count > topCount) {
      topCount = count;
      topCategory = cat;
    }
  }

  return {
    code: 0,
    data: {
      wishTotal,
      wishCompleted,
      checkInTotal,
      topCategory: topCategory ? { category: topCategory, count: topCount } : null,
      categoryStats: categoryCount,
    },
    message: 'ok',
  };
}

module.exports = exports;
