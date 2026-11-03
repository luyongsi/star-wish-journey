// cloudfunctions/checkin/index.js — 打卡云函数
// switch(action): create / complete / append / list / detail / delete
// 公共鉴权: _checkCouple()
//
// v1.1 变更（PRD §6.2 / FUN-2 / FUN-8）：
// - 备注、媒体、位置全部选填，可「先跳过，直接完成」
// - 一个愿望可挂多条打卡记录（追加模式）
// - 记录可带位置，位置用于足迹地图

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');

const MAX_NOTE_LENGTH = 500;
const MAX_MEDIA_COUNT = 9;

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
 * 规范化位置对象
 * @param {Object|null} location - { name, address, latitude, longitude, city }
 * @returns {Object|null}
 */
function _normalizeLocation(location) {
  if (!location || !location.name) return null;
  return {
    name: String(location.name),
    address: location.address ? String(location.address) : '',
    latitude: Number(location.latitude) || 0,
    longitude: Number(location.longitude) || 0,
    city: location.city ? String(location.city) : '',
  };
}

/**
 * 规范化媒体列表
 * @param {Array} mediaList
 * @returns {{ ok: boolean, message?: string, list: Array }}
 */
function _normalizeMedia(mediaList) {
  if (mediaList === undefined || mediaList === null) {
    return { ok: true, list: [] };
  }
  if (!Array.isArray(mediaList)) {
    return { ok: false, message: '媒体列表格式不正确', list: [] };
  }
  if (mediaList.length > MAX_MEDIA_COUNT) {
    return { ok: false, message: `媒体最多 ${MAX_MEDIA_COUNT} 个`, list: [] };
  }
  const list = mediaList
    .filter((m) => m && m.fileId)
    .map((m) => ({
      fileId: String(m.fileId),
      type: m.type === 'video' ? 'video' : 'image',
      thumbUrl: m.thumbUrl || '',
    }));
  return { ok: true, list };
}

/**
 * 校验打卡内容：首次完成允许全空；追加模式要求至少一项
 */
function _validateContent(note, media, location, requireOne) {
  if (note && note.length > MAX_NOTE_LENGTH) {
    return '打卡备注不能超过500字';
  }
  if (requireOne && !note && media.length === 0 && !location) {
    return '追加记录请至少填写一项内容';
  }
  return null;
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
        return await _handleCreate(openid, event, false);
      case 'append':
        return await _handleCreate(openid, event, true);
      case 'complete':
        return await _handleComplete(openid, event);
      case 'list':
        return await _handleList(openid);
      case 'detail':
        return await _handleDetail(openid, event);
      case 'listByWish':
        return await _handleListByWish(openid, event);
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
 * 创建打卡记录
 * - append=false：首次完成，愿望必须为 ongoing，成功后置为 completed
 * - append=true ：追加记录，愿望必须为 completed，状态保持不变，内容至少一项
 */
async function _handleCreate(openid, event, append) {
  const { couple, members } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  const note = (event.note || '').trim();
  const media = _normalizeMedia(event.mediaList);
  if (!media.ok) {
    return { code: 1004, data: null, message: media.message };
  }
  const location = _normalizeLocation(event.location);

  const contentError = _validateContent(note, media.list, location, append);
  if (contentError) {
    return { code: 1004, data: null, message: contentError };
  }

  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  const wish = wishQuery.data;
  if (wish.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权操作此愿望' };
  }

  if (append) {
    if (wish.status !== 'completed') {
      return { code: 1002, data: null, message: '只有已完成的愿望可以追加记录' };
    }
  } else if (wish.status !== 'ongoing') {
    return { code: 1002, data: null, message: '该愿望当前状态无法打卡' };
  }

  const now = db.serverDate();

  const newCheckIn = {
    wishId: event.wishId,
    coupleId: couple._id,
    members,
    checkInBy: openid,
    note,
    mediaList: media.list,
    location,
    isAppend: !!append,
    createdAt: now,
  };

  if (append) {
    // 追加：只新增记录，并递增愿望上的记录计数
    const addResult = await checkinsCollection.add({ data: newCheckIn });
    await wishesCollection.doc(event.wishId).update({
      data: {
        checkInCount: _.inc(1),
        lastCheckInAt: now,
        updatedAt: now,
      },
    });
    const inserted = await checkinsCollection.doc(addResult._id).get();
    return {
      code: 0,
      data: { checkIn: inserted.data, wish },
      message: '记录已追加',
    };
  }

  // 首次完成：事务内写记录 + 置为已完成
  const transactionResult = await db.runTransaction(async (transaction) => {
    const addResult = await transaction.collection('checkins').add({ data: newCheckIn });
    await transaction.collection('wishes').doc(event.wishId).update({
      data: {
        status: 'completed',
        completedAt: now,
        checkInCount: _.inc(1),
        lastCheckInAt: now,
        updatedAt: now,
      },
    });
    return { checkInId: addResult._id };
  });

  const checkInQuery = await checkinsCollection.doc(transactionResult.checkInId).get();
  return {
    code: 0,
    data: {
      checkIn: checkInQuery.data,
      wish: { ...wish, status: 'completed', completedAt: new Date() },
    },
    message: '打卡成功',
  };
}

/**
 * 跳过内容直接完成：不产生打卡记录
 */
async function _handleComplete(openid, event) {
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
  if (wish.status === 'completed') {
    // 幂等：重复点击不报错
    return { code: 0, data: { wish }, message: '该愿望已完成' };
  }
  if (wish.status !== 'ongoing') {
    return { code: 1002, data: null, message: '该愿望当前状态无法完成' };
  }

  const now = db.serverDate();
  await wishesCollection.doc(event.wishId).update({
    data: {
      status: 'completed',
      completedAt: now,
      checkInCount: wish.checkInCount || 0,
      updatedAt: now,
    },
  });

  return {
    code: 0,
    data: { wish: { ...wish, status: 'completed', completedAt: new Date() } },
    message: '已完成',
  };
}

/**
 * 查询打卡列表：今天要做 / 待打卡 / 已完成
 * 返回 { today, ongoing, completed, stats }
 */
async function _handleList(openid) {
  const { couple } = await _checkCouple(openid);

  const ongoingQuery = await wishesCollection
    .where({ coupleId: couple._id, status: 'ongoing' })
    .get();

  const completedQuery = await wishesCollection
    .where({ coupleId: couple._id, status: 'completed' })
    .orderBy('completedAt', 'desc')
    .get();

  // 已完成愿望的打卡记录（用于显示首图、记录数与图片数）
  const completedIds = completedQuery.data.map((w) => w._id);
  let checkins = [];
  if (completedIds.length > 0) {
    const checkinQuery = await checkinsCollection
      .where({ coupleId: couple._id, wishId: _.in(completedIds) })
      .orderBy('createdAt', 'asc')
      .get();
    checkins = checkinQuery.data;
  }

  const recordMap = {};
  checkins.forEach((c) => {
    if (!recordMap[c.wishId]) {
      recordMap[c.wishId] = { count: 0, mediaCount: 0, firstImage: null };
    }
    const entry = recordMap[c.wishId];
    entry.count += 1;
    const media = c.mediaList || [];
    entry.mediaCount += media.length;
    if (!entry.firstImage) {
      const img = media.find((m) => m.type !== 'video');
      if (img) entry.firstImage = img;
    }
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const today = [];
  const upcoming = [];
  ongoingQuery.data.forEach((w) => {
    const planned = w.plannedDate ? new Date(w.plannedDate) : null;
    const item = { ...w, wishTitle: w.title, wishCategory: w.category, overdueDays: 0 };
    if (planned) {
      const plannedStart = new Date(planned);
      plannedStart.setHours(0, 0, 0, 0);
      if (plannedStart.getTime() <= startOfToday.getTime()) {
        item.overdueDays = Math.floor(
          (startOfToday.getTime() - plannedStart.getTime()) / (24 * 60 * 60 * 1000)
        );
        today.push(item);
        return;
      }
    }
    upcoming.push(item);
  });

  today.sort((a, b) => new Date(a.plannedDate) - new Date(b.plannedDate));

  const completed = completedQuery.data.map((w) => {
    const record = recordMap[w._id] || { count: 0, mediaCount: 0, firstImage: null };
    return {
      ...w,
      wishTitle: w.title,
      wishCategory: w.category,
      recordCount: record.count,
      mediaCount: record.mediaCount,
      coverMedia: record.firstImage,
    };
  });

  // 最近记录（供红点与动态条使用，按时间倒序，最多 20 条）
  const recentRecords = checkins
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map((c) => ({
      _id: c._id,
      wishId: c.wishId,
      checkInBy: c.checkInBy,
      note: c.note || '',
      mediaList: c.mediaList || [],
      createdAt: c.createdAt,
    }));

  return {
    code: 0,
    data: {
      today,
      ongoing: upcoming,
      completed,
      recentRecords,
      stats: {
        todayCount: today.length,
        ongoingCount: upcoming.length,
        completedCount: completed.length,
      },
    },
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
  await checkinsCollection.doc(event.checkInId).remove();

  if (checkIn.wishId) {
    const wishQuery = await wishesCollection.doc(checkIn.wishId).get();
    if (wishQuery.data) {
      const updateData = { updatedAt: db.serverDate() };
      const remainCount = Math.max(0, (wishQuery.data.checkInCount || 1) - 1);
      updateData.checkInCount = remainCount;
      // 恢复愿望状态为 ongoing
      if (event.restoreWish) {
        updateData.status = 'ongoing';
        updateData.completedAt = null;
      }
      // 已无任何记录且未显式要求恢复时，仍保持完成态（跳过完成的愿望本就没有记录）
      await wishesCollection.doc(checkIn.wishId).update({ data: updateData });
    }
  }

  return {
    code: 0,
    data: null,
    message: '已删除打卡记录',
  };
}

/**
 * 查询某个愿望下的全部打卡记录（按时间正序）
 * 入参：{ wishId }
 */
async function _handleListByWish(openid, event) {
  const { couple } = await _checkCouple(openid);

  if (!event.wishId) {
    return { code: 1004, data: null, message: '缺少愿望ID' };
  }

  const wishQuery = await wishesCollection.doc(event.wishId).get();
  if (!wishQuery.data) {
    return { code: 1004, data: null, message: '愿望不存在' };
  }
  if (wishQuery.data.coupleId !== couple._id) {
    return { code: 1003, data: null, message: '无权查看此愿望' };
  }

  const recordsQuery = await checkinsCollection
    .where({ coupleId: couple._id, wishId: event.wishId })
    .orderBy('createdAt', 'asc')
    .get();

  return {
    code: 0,
    data: { records: recordsQuery.data, wish: wishQuery.data },
    message: 'ok',
  };
}


module.exports = exports;
