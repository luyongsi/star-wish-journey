// cloudfunctions/wish/index.js — 愿望云函数
// switch(action): create / update / delete / list / draw / start / return
//                 today / todayAction / plan / complete
// 公共鉴权: _checkCouple()
//
// v1.1 变更（PRD §5 / §6.1）：
// - 愿望支持计划日期 plannedDate、封面图 coverUrl、打卡记录计数 checkInCount
// - 抽取支持分类筛选 + 避开近期 + 收藏加权（权重 3）
// - 「放回」保留 drawnAt，7 天内不再抽到
// - 新增每日一抽（today / todayAction）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');
const wishesCollection = db.collection('wishes');
const checkinsCollection = db.collection('checkins');
const dailyDrawsCollection = db.collection('dailyDraws');

const VALID_CATEGORIES = ['food', 'travel', 'sport', 'movie', 'home', 'other'];
const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 200;

// 抽取规则
const FAVORITE_WEIGHT = 3;        // 收藏愿望权重
const RECENT_DAYS = 7;            // 默认避开近期天数
const FALLBACK_DAYS = 3;          // 候选不足时放宽到
const MIN_CANDIDATES = 1;         // 候选为空才放宽（每抽一次都会写入 drawnAt，阈值设高会让避重失效）
const TODAY_DRAW_MAX_SWITCH = 3;  // 每日一抽「换一个」上限

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
        return await _handleDraw(openid, event);
      case 'start':
        return await _handleStart(openid, event);
      case 'return':
        return await _handleReturn(openid, event);
      case 'today':
        return await _handleToday(openid, event);
      case 'todayAction':
        return await _handleTodayAction(openid, event);
      case 'detail':
        return await _handleDetail(openid, event);
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
  const description = event.description || '';
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { code: 1004, data: null, message: '愿望描述不能超过200个字' };
  }

  const now = db.serverDate();
  const newWish = {
    coupleId: couple._id,
    members,
    title,
    description,
    category: event.category || 'other',
    status: 'pending',
    createdBy: openid,
    drawnAt: null,
    plannedDate: null,
    completedAt: null,
    isFavorite: false,
    coverUrl: event.coverUrl || '',
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: now,
    updatedAt: now,
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
  if (event.coverUrl !== undefined) {
    updateData.coverUrl = event.coverUrl || '';
  }
  if (event.description !== undefined && event.description.length > MAX_DESCRIPTION_LENGTH) {
    return { code: 1004, data: null, message: '愿望描述不能超过200个字' };
  }
  if (event.plannedDate !== undefined) {
    const planned = _parseDate(event.plannedDate);
    if (event.plannedDate && !planned) {
      return { code: 1004, data: null, message: '计划日期格式不正确' };
    }
    updateData.plannedDate = planned;
    // 待抽取的愿望设置计划日期后视为「已安排」，转为进行中
    if (planned && wish.status === 'pending') {
      updateData.status = 'ongoing';
    }
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
 * 解析日期入参，支持 'YYYY-MM-DD' 与时间戳 / Date
 * @param {string|number|Date|null} value
 * @returns {Date|null}
 */
function _parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // 'YYYY-MM-DD' 按本地时区当天 00:00 解析，避免被当成 UTC
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (matched) {
    const d = new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
      0,
      0,
      0,
      0
    );
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 判断愿望是否在最近 N 天内被抽中过
 */
function _drawnWithin(wish, days, now) {
  if (!wish.drawnAt) return false;
  const drawn = new Date(wish.drawnAt);
  if (isNaN(drawn.getTime())) return false;
  return now.getTime() - drawn.getTime() <= days * 24 * 60 * 60 * 1000;
}

/**
 * 按避重天数筛出候选；为空时返回 null 表示需要放宽
 * 说明：每次抽取都会写入 drawnAt，若按「少于 N 个」放宽，第二轮必然放宽导致避重形同虚设，
 * 因此只在严格条件下无候选（即池子已被避重规则抽空）时才放宽。
 */
function _filterByRecent(all, days, now) {
  if (days === null) return all;
  const list = all.filter((w) => !_drawnWithin(w, days, now));
  return list.length >= MIN_CANDIDATES ? list : null;
}

/**
 * 按收藏权重加权随机
 * @param {Array} candidates
 * @returns {Object}
 */
function _weightedPick(candidates) {
  const weights = candidates.map((w) => (w.isFavorite ? FAVORITE_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let point = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    point -= weights[i];
    if (point <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * 计算抽取候选集（含阶梯放宽）
 * 放宽时优先返回「最久没被抽过」的那批，避免刚抽过的愿望立刻再次出现
 * @returns {{ candidates: Array, relaxed: boolean }}
 */
function _pickCandidates(all, excludeDays) {
  const now = new Date();
  if (excludeDays === null || excludeDays === 0) {
    return { candidates: all, relaxed: false };
  }

  // 按入参天数 → 3 天 → 不限 阶梯放宽
  const steps = [excludeDays, FALLBACK_DAYS]
    .filter((d, i, arr) => d && arr.indexOf(d) === i);

  for (const days of steps) {
    const list = _filterByRecent(all, days, now);
    if (list) return { candidates: list, relaxed: days !== excludeDays };
  }

  // 全部放宽：只保留「最久未抽」的那批（从未抽过的排最前）
  const sorted = all.slice().sort((a, b) => {
    const at = a.drawnAt ? new Date(a.drawnAt).getTime() : 0;
    const bt = b.drawnAt ? new Date(b.drawnAt).getTime() : 0;
    return at - bt;
  });
  const oldest = sorted[0];
  const oldestAt = oldest.drawnAt ? new Date(oldest.drawnAt).getTime() : 0;
  const candidates = sorted.filter((w) => {
    const t = w.drawnAt ? new Date(w.drawnAt).getTime() : 0;
    return t === oldestAt;
  });

  return { candidates, relaxed: true };
}

/**
 * 抽取愿望（分类筛选 + 避开近期 + 收藏加权）
 * 入参：{ category?, excludeDays?: number|null }
 */
async function _handleDraw(openid, event) {
  const { couple } = await _checkCouple(openid);

  const where = { coupleId: couple._id, status: 'pending' };
  if (event.category && event.category !== 'all') {
    if (!VALID_CATEGORIES.includes(event.category)) {
      return { code: 1004, data: null, message: '无效的分类' };
    }
    where.category = event.category;
  }

  const pendingQuery = await wishesCollection.where(where).get();

  if (pendingQuery.data.length === 0) {
    return { code: 0, data: { wish: null, relaxed: false }, message: '愿望池空了' };
  }

  const excludeDays =
    event.excludeDays === undefined ? RECENT_DAYS : event.excludeDays;
  const strictCount = excludeDays
    ? pendingQuery.data.filter((w) => !_drawnWithin(w, excludeDays, new Date())).length
    : pendingQuery.data.length;
  const { candidates, relaxed } = _pickCandidates(pendingQuery.data, excludeDays);
  const wish = _weightedPick(candidates);

  // 记录抽取时间（放回不清空，用于避开近期）
  await wishesCollection.doc(wish._id).update({
    data: { drawnAt: db.serverDate() },
  });

  return {
    code: 0,
    data: { wish: { ...wish, drawnAt: new Date() }, relaxed, strictCount },
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

  const updateData = { status: 'ongoing', updatedAt: db.serverDate() };
  if (event.plannedDate !== undefined) {
    const planned = _parseDate(event.plannedDate);
    if (event.plannedDate && !planned) {
      return { code: 1004, data: null, message: '计划日期格式不正确' };
    }
    updateData.plannedDate = planned;
  }

  await wishesCollection.doc(event.wishId).update({ data: updateData });

  return {
    code: 0,
    data: { ...wish, ...updateData },
    message: '开始执行',
  };
}

/**
 * 放回愿望（保留 pending，保留 drawnAt 以便 7 天内不再抽到）
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

  if (wishQuery.data.status !== 'pending') {
    return { code: 1002, data: null, message: '该愿望当前状态无法放回' };
  }

  // v1.1：放回不清空 drawnAt，避免刚放回就再次抽中同一条
  await wishesCollection.doc(event.wishId).update({
    data: { returnedAt: db.serverDate(), updatedAt: db.serverDate() },
  });

  return {
    code: 0,
    data: null,
    message: '已放回愿望池',
  };
}

/**
 * 生成当天的日期键（按北京时间，集群时区）
 */
function _todayKey(now) {
  const d = now || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 读取（或首次生成）当天的今日愿望
 * 幂等键：coupleId + 日期，保证双方当天看到同一条
 * 入参：{ category? }
 */
async function _handleToday(openid, event) {
  const { couple } = await _checkCouple(openid);

  const dateKey = _todayKey();
  const docId = `${couple._id}_${dateKey}`;

  const existing = await dailyDrawsCollection.doc(docId).get();
  if (existing.data) {
    return {
      code: 0,
      data: _buildTodayResult(existing.data, openid, null),
      message: 'ok',
    };
  }

  // 首次生成：从 pending 中按避重规则挑一条
  const where = { coupleId: couple._id, status: 'pending' };
  if (event.category && event.category !== 'all') {
    if (!VALID_CATEGORIES.includes(event.category)) {
      return { code: 1004, data: null, message: '无效的分类' };
    }
    where.category = event.category;
  }
  const pendingQuery = await wishesCollection.where(where).get();
  const pending = pendingQuery.data;

  if (pending.length === 0) {
    return { code: 0, data: { date: dateKey, wish: null }, message: '愿望池空了' };
  }

  const { candidates } = _pickCandidates(pending, RECENT_DAYS);
  const wish = _weightedPick(candidates);

  const record = {
    _id: docId,
    coupleId: couple._id,
    date: dateKey,
    wishId: wish._id,
    status: 'pending',      // pending | selected
    switchCount: 0,
    hiddenBy: [],           // 点了「明天再说」的 openid
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };

  try {
    await dailyDrawsCollection.add({ data: record });
  } catch (err) {
    // 并发下可能已被对方创建，回读即可
    const retry = await dailyDrawsCollection.doc(docId).get();
    if (retry.data) {
      return { code: 0, data: _buildTodayResult(retry.data, openid, null), message: 'ok' };
    }
    throw err;
  }

  return {
    code: 0,
    data: _buildTodayResult(record, openid, wish),
    message: 'ok',
  };
}

/**
 * 组装今日愿望返回结构
 */
function _buildTodayResult(record, openid, wishOverride) {
  return {
    date: record.date,
    wishId: record.wishId,
    status: record.status,
    switchCount: record.switchCount || 0,
    switchLeft: Math.max(0, TODAY_DRAW_MAX_SWITCH - (record.switchCount || 0)),
    maxSwitch: TODAY_DRAW_MAX_SWITCH,
    hidden: (record.hiddenBy || []).includes(openid),
    wish: wishOverride || null,
  };
}

/**
 * 今日愿望操作
 * 入参：{ action?: 'select'|'switch'|'hide' }
 */
async function _handleTodayAction(openid, event) {
  const { couple } = await _checkCouple(openid);

  const op = event.op;
  if (!['select', 'switch', 'hide'].includes(op)) {
    return { code: 1004, data: null, message: '未知的操作' };
  }

  const dateKey = _todayKey();
  const docId = `${couple._id}_${dateKey}`;
  const recordQuery = await dailyDrawsCollection.doc(docId).get();
  if (!recordQuery.data) {
    return { code: 1004, data: null, message: '今天的愿望还没生成' };
  }
  const record = recordQuery.data;

  // 1) 就今天：愿望转进行中 + 计划日期今天，记录置为已选定
  if (op === 'select') {
    if (record.status === 'selected') {
      return { code: 0, data: _buildTodayResult(record, openid, null), message: '已选定' };
    }
    const wishQuery = await wishesCollection.doc(record.wishId).get();
    if (!wishQuery.data) {
      return { code: 1004, data: null, message: '愿望不存在' };
    }
    if (wishQuery.data.status !== 'pending') {
      return { code: 1002, data: null, message: '该愿望当前状态无法开始' };
    }

    const now = db.serverDate();
    await wishesCollection.doc(record.wishId).update({
      data: { status: 'ongoing', plannedDate: _parseDate(dateKey), updatedAt: now },
    });
    await dailyDrawsCollection.doc(docId).update({
      data: { status: 'selected', updatedAt: now },
    });

    const updated = { ...record, status: 'selected' };
    const wish = { ...wishQuery.data, status: 'ongoing', plannedDate: _parseDate(dateKey) };
    return { code: 0, data: _buildTodayResult(updated, openid, wish), message: '就今天' };
  }

  // 2) 换一个：情侣当天累计上限 3 次
  if (op === 'switch') {
    if (record.status === 'selected') {
      return { code: 1002, data: null, message: '今天已选定，不能再换' };
    }
    const used = record.switchCount || 0;
    if (used >= TODAY_DRAW_MAX_SWITCH) {
      return { code: 1002, data: null, message: '今天换够了，明天再来' };
    }

    const pendingQuery = await wishesCollection.where({
      coupleId: couple._id,
      status: 'pending',
    }).get();
    const others = pendingQuery.data.filter((w) => w._id !== record.wishId);
    if (others.length === 0) {
      return { code: 1002, data: null, message: '没有其它愿望可换了' };
    }

    const { candidates } = _pickCandidates(others, RECENT_DAYS);
    const wish = _weightedPick(candidates);
    const now = db.serverDate();

    await dailyDrawsCollection.doc(docId).update({
      data: { wishId: wish._id, switchCount: used + 1, updatedAt: now },
    });

    const updated = { ...record, wishId: wish._id, switchCount: used + 1 };
    return { code: 0, data: _buildTodayResult(updated, openid, wish), message: '已换一个' };
  }

  // 3) 明天再说：仅对当前用户隐藏
  const hiddenBy = record.hiddenBy || [];
  if (!hiddenBy.includes(openid)) {
    hiddenBy.push(openid);
    await dailyDrawsCollection.doc(docId).update({
      data: { hiddenBy, updatedAt: db.serverDate() },
    });
  }
  const updated = { ...record, hiddenBy };
  return { code: 0, data: _buildTodayResult(updated, openid, null), message: '明天再说' };
}


/**
 * 查询单个愿望详情
 * 入参：{ wishId }
 */
async function _handleDetail(openid, event) {
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

  return {
    code: 0,
    data: { wish: wishQuery.data },
    message: 'ok',
  };
}


module.exports = exports;
