// cloudfunctions/checkin/index.js — 打卡云函数
// switch(action): create / list / detail / delete
// 公共鉴权: _checkCouple()

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');

const MAX_NOTE_LENGTH = 500;

/**
 * 校验 openid 属于 active couple
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
 * 打卡云函数主入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'create':
        return await _handleCreate(openid, event);
      case 'list':
        return await _handleList(openid);
      case 'detail':
        return await _handleDetail(openid, event);
      case 'delete':
        return await _handleDelete(openid, event);
      default:
        return { code: 1004, data: null, message: '未知的 action: ' + action };
    }
  } catch (err) {
    console.error('[checkin] action=' + action + ' 失败:', err);
    return {
      code: err.code || 500,
      data: null,
      message: err.message || '操作失败',
    };
  }
};

/**
 * 创建打卡：校验 wish.status=='ongoing'，事务插入 checkin + 更新 wish 为 completed
 */
async function _handleCreate(openid, event) {
  const { couple, members } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  // 校验备注
  if (event.note && event.note.length > MAX_NOTE_LENGTH) {
    return { code: 1004, data: null, message: '打卡备注不能超过500字' };
  }

  // 校验媒体
  if (!event.mediaList || !Array.isArray(event.mediaList) || event.mediaList.length === 0) {
    return { code: 1004, data: null, message: '请至少添加一张图片或视频' };
  }

  // 查询愿望
  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  const wish = wishQuery.data;
  if (wish.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }
  if (wish.status !== 'ongoing') {
    return { code: 1002, data: null, message: '该愿望当前状态无法打卡' };
  }

  const now = db.serverDate();

  // 事务：插入 checkin + 更新 wish 为 completed
  const transactionResult = await db.runTransaction(async (transaction) => {
    // 插入打卡记录
    const newCheckIn = {
      wishId: event.wishId,
      coupleId: couple._id,
      members,
      checkInBy: openid,
      note: event.note || '',
      mediaList: event.mediaList,
      location: event.location || null,
      createdAt: now,
    };
    const addResult = await transaction.collection('checkins').add({ data: newCheckIn });

    // 更新愿望状态为已完成
    await transaction.collection('wishes').doc(event.wishId).update({
      data: {
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      },
    });

    return { checkInId: addResult._id };
  });

  // 获取插入的打卡记录
  const checkInQuery = await checkinsCollection.doc(transactionResult.checkInId).get();

  return {
    code: 0,
    data: { checkIn: checkInQuery.data, wish: { ...wish, status: 'completed', completedAt: new Date() } },
    message: '打卡成功',
  };
}

/**
 * 查询打卡列表：返回 { ongoing: [], completed: [] }
 */
async function _handleList(openid) {
  const { couple } = await _checkCouple(openid);

  // 查询进行中的愿望
  const ongoingQuery = await wishesCollection
    .where({ coupleId: couple._id, status: 'ongoing' })
    .orderBy('drawnAt', 'desc')
    .get();

  // 查询已完成的打卡记录
  const completedQuery = await checkinsCollection
    .where({ coupleId: couple._id })
    .orderBy('createdAt', 'desc')
    .get();

  // 为已完成的打卡关联愿望标题
  const completed = [];
  for (const checkIn of completedQuery.data) {
    let wishTitle = '';
    let wishCategory = 'other';
    if (checkIn.wishId) {
      const wishQuery = await wishesCollection.doc(checkIn.wishId).get();
      if (wishQuery.data) {
        wishTitle = wishQuery.data.title;
        wishCategory = wishQuery.data.category;
      }
    }
    completed.push({ ...checkIn, wishTitle, wishCategory });
  }

  return {
    code: 0,
    data: { ongoing: ongoingQuery.data, completed },
    message: 'ok',
  };
}

/**
 * 查询打卡详情
 */
async function _handleDetail(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.checkInId) {
    return { code: 1004, data: null, message: '缺少打卡ID' };
  }

  const checkInQuery = await checkinsCollection.doc(event.checkInId).get();
  if (!checkInQuery.data) {
    return { code: 1004, data: null, message: '打卡记录不存在' };
  }
  if (checkInQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权查看此记录' };
  }

  // 获取关联愿望
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

/**
 * 删除打卡记录（可选恢复 wish 状态）
 */
async function _handleDelete(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.checkInId) {
    return { code: 1004, data: null, message: '缺少打卡ID' };
  }

  const checkInQuery = await checkinsCollection.doc(event.checkInId).get();
  if (!checkInQuery.data) {
    return { code: 1004, data: null, message: '打卡记录不存在' };
  }
  if (checkInQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此记录' };
  }

  const checkIn = checkInQuery.data;

  // 删除打卡记录
  await checkinsCollection.doc(event.checkInId).remove();

  // 可选恢复 wish 状态为 ongoing
  if (event.restoreWish && checkIn.wishId) {
    await wishesCollection.doc(checkIn.wishId).update({
      data: {
        status: 'ongoing',
        completedAt: null,
        updatedAt: db.serverDate(),
      },
    });
  }

  return {
    code: 0,
    data: null,
    message: '已删除打卡记录',
  };
}

module.exports = exports;
