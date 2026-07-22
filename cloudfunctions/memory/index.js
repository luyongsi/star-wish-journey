// cloudfunctions/memory/index.js — 回忆录云函数
// switch(action): timeline / detail

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');

const DEFAULT_PAGE_SIZE = 20;

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
 * 回忆录云函数主入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'timeline':
        return await _handleTimeline(openid, event);
      case 'detail':
        return await _handleDetail(openid, event);
      default:
        return { code: 1004, data: null, message: '未知的 action: ' + action };
    }
  } catch (err) {
    console.error('[memory] action=' + action + ' 失败:', err);
    return {
      code: err.code || 500,
      data: null,
      message: err.message || '操作失败',
    };
  }
};

/**
 * 时间线：分页查 checkins（按 createdAt 倒序），按月份分组
 * @returns {{ groups: [{ month, items }], hasMore: boolean }}
 */
async function _handleTimeline(openid, event) {
  const { couple } = await _checkCouple(openid);

  const page = event.page || 1;
  const pageSize = event.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  // 分页查询打卡记录
  const countResult = await checkinsCollection
    .where({ coupleId: couple._id })
    .count();

  const checkinsQuery = await checkinsCollection
    .where({ coupleId: couple._id })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 查询关联愿望
  const wishIds = [...new Set(checkinsQuery.data.map((c) => c.wishId).filter(Boolean))];
  const wishesMap = {};
  if (wishIds.length > 0) {
    const wishesQuery = await wishesCollection
      .where({ _id: _.in(wishIds) })
      .get();
    wishesQuery.data.forEach((w) => {
      wishesMap[w._id] = w;
    });
  }

  // 按月份分组
  const groups = [];
  let currentGroup = null;

  for (const checkIn of checkinsQuery.data) {
    const wish = wishesMap[checkIn.wishId] || null;
    const item = {
      ...checkIn,
      wishTitle: wish ? wish.title : '',
      wishCategory: wish ? wish.category : 'other',
    };

    const d = new Date(checkIn.createdAt);
    const monthKey = `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`;

    if (!currentGroup || currentGroup.month !== monthKey) {
      currentGroup = { month: monthKey, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  const hasMore = skip + checkinsQuery.data.length < countResult.total;

  return {
    code: 0,
    data: { groups, hasMore, total: countResult.total },
    message: 'ok',
  };
}

/**
 * 回忆录详情：返回 { checkIn, wish }
 */
async function _handleDetail(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.checkInId) {
    return { code: 1004, data: null, message: '缺少打卡ID' };
  }

  const checkInQuery = await checkinsCollection.doc(event.checkInId).get();
  if (!checkInQuery.data) {
    return { code: 1004, data: null, message: '记录不存在' };
  }
  if (checkInQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权查看' };
  }

  let wish = null;
  if (checkInQuery.data.wishId) {
    const wishQuery = await wishesCollection.doc(checkInQuery.data.wishId).get();
    if (wishQuery.data) {
      wish = wishQuery.data;
    }
  }

  return {
    code: 0,
    data: { checkIn: checkInQuery.data, wish },
    message: 'ok',
  };
}

module.exports = exports;
