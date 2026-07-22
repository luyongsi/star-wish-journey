// cloudfunctions/wish/index.js — 愿望云函数
// switch(action): create / update / delete / list / draw / start / return
// 公共鉴权: _checkCouple()

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');

const VALID_CATEGORIES = ['food', 'travel', 'sport', 'movie', 'home', 'other'];
const MAX_TITLE_LENGTH = 30;

/**
 * 校验 openid 属于 active couple，返回 couple 和双方 openid
 * @param {string} openid
 * @returns {Promise<{ couple: Object, members: string[] }>}
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
  const couple = coupleQuery.data;
  const members = [couple.userA, couple.userB].filter(Boolean);
  if (!members.includes(openid)) {
    const err = new Error('权限不足');
    err.code = 1003;
    throw err;
  }
  return { couple, members };
}

/**
 * 愿望云函数主入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'create':
        return await _handleCreate(openid, event);
      case 'update':
        return await _handleUpdate(openid, event);
      case 'delete':
        return await _handleDelete(openid, event);
      case 'list':
        return await _handleList(openid, event);
      case 'draw':
        return await _handleDraw(openid);
      case 'start':
        return await _handleStart(openid, event);
      case 'return':
        return await _handleReturn(openid, event);
      default:
        return { code: 1004, data: null, message: '未知的 action: ' + action };
    }
  } catch (err) {
    console.error('[wish] action=' + action + ' 失败:', err);
    return {
      code: err.code || 500,
      data: null,
      message: err.message || '操作失败',
    };
  }
};

/**
 * 创建愿望
 */
async function _handleCreate(openid, event) {
  const { couple, members } = await _checkCouple(openid);

  // 参数校验
  const title = (event.title || '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return { code: 1004, data: null, message: '愿望标题应为1-30个字' };
  }
  if (event.category && !VALID_CATEGORIES.includes(event.category)) {
    return { code: 1004, data: null, message: '无效的分类' };
  }

  const now = db.serverDate();
  const newWish = {
    coupleId: couple._id,
    members,
    title,
    description: event.description || '',
    category: event.category || 'other',
    status: 'pending',
    createdBy: openid,
    drawnAt: null,
    completedAt: null,
    isFavorite: false,
    createdAt: now,
  };

  const addResult = await wishesCollection.add({ data: newWish });

  return {
    code: 0,
    data: {
      _id: addResult._id,
      ...newWish,
      createdAt: new Date(),
    },
    message: '愿望已添加',
  };
}

/**
 * 更新愿望
 */
async function _handleUpdate(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  // 查询愿望并校验权限
  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  const wish = wishQuery.data;
  if (wish.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }

  // 构建更新数据
  const updateData = { updatedAt: db.serverDate() };
  if (event.title !== undefined) {
    const title = event.title.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return { code: 1004, data: null, message: '愿望标题应为1-30个字' };
    }
    updateData.title = title;
  }
  if (event.description !== undefined) {
    updateData.description = event.description;
  }
  if (event.category !== undefined) {
    if (!VALID_CATEGORIES.includes(event.category)) {
      return { code: 1004, data: null, message: '无效的分类' };
    }
    updateData.category = event.category;
  }
  if (event.isFavorite !== undefined) {
    updateData.isFavorite = !!event.isFavorite;
  }

  await wishesCollection.doc(event.wishId).update({ data: updateData });

  return {
    code: 0,
    data: { ...wish, ...updateData },
    message: '更新成功',
  };
}

/**
 * 删除愿望（及关联打卡）
 */
async function _handleDelete(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  if (wishQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }

  // 删除关联打卡记录
  await checkinsCollection.where({ wishId: event.wishId }).remove();
  // 删除愿望
  await wishesCollection.doc(event.wishId).remove();

  return {
    code: 0,
    data: null,
    message: '已删除',
  };
}

/**
 * 查询愿望列表（支持 category/status 过滤）
 */
async function _handleList(openid, event) {
  const { couple } = await _checkCouple(openid);

  const where = { coupleId: couple._id };
  if (event.category && event.category !== 'all') {
    where.category = event.category;
  }
  if (event.status) {
    where.status = event.status;
  }

  const query = wishesCollection.where(where).orderBy('createdAt', 'desc');
  const result = await query.get();

  // 统计信息
  const allWishes = await wishesCollection.where({ coupleId: couple._id }).get();
  const stats = {
    total: allWishes.data.length,
    completed: allWishes.data.filter((w) => w.status === 'completed').length,
    ongoing: allWishes.data.filter((w) => w.status === 'ongoing').length,
    pending: allWishes.data.filter((w) => w.status === 'pending').length,
  };

  return {
    code: 0,
    data: { wishes: result.data, stats },
    message: 'ok',
  };
}

/**
 * 抽取愿望（随机选一条 pending，记录 drawnAt，不改 status）
 */
async function _handleDraw(openid) {
  const { couple } = await _checkCouple(openid);

  const pendingQuery = await wishesCollection
    .where({ coupleId: couple._id, status: 'pending' })
    .get();

  if (pendingQuery.data.length === 0) {
    return { code: 0, data: { wish: null }, message: '愿望池空了' };
  }

  // 随机选一条
  const randomIndex = Math.floor(Math.random() * pendingQuery.data.length);
  const wish = pendingQuery.data[randomIndex];

  // 更新 drawnAt（不改 status）
  await wishesCollection.doc(wish._id).update({
    data: { drawnAt: db.serverDate() },
  });

  return {
    code: 0,
    data: { wish: { ...wish, drawnAt: new Date() } },
    message: 'ok',
  };
}

/**
 * 开始执行愿望（pending → ongoing）
 */
async function _handleStart(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  const wish = wishQuery.data;
  if (wish.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }
  if (wish.status !== 'pending') {
    return { code: 1002, data: null, message: '该愿望当前状态无法开始' };
  }

  await wishesCollection.doc(event.wishId).update({
    data: { status: 'ongoing', updatedAt: db.serverDate() },
  });

  return {
    code: 0,
    data: { ...wish, status: 'ongoing' },
    message: '开始执行',
  };
}

/**
 * 放回愿望（清空 drawnAt，保留 pending）
 */
async function _handleReturn(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  if (wishQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }

  await wishesCollection.doc(event.wishId).update({
    data: { drawnAt: null, updatedAt: db.serverDate() },
  });

  return {
    code: 0,
    data: null,
    message: '已放回愿望池',
  };
}

module.exports = exports;
