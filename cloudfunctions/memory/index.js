// cloudfunctions/memory/index.js — 回忆录云函数
// switch(action): timeline / detail / footprints / achievements / annualReport

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
      case 'footprints':
        return await _handleFootprints(openid, event);
      case 'achievements':
        return await _handleAchievements(openid, event);
      case 'annualReport':
        return await _handleAnnualReport(openid, event);
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

/**
 * 足迹：返回带位置的打卡点 + 按城市聚合
 * 入参：{ limit?: number }
 */
async function _handleFootprints(openid, event) {
  const { couple } = await _checkCouple(openid);
  const limit = Math.min(Number(event.limit) || 500, 1000);

  const allQuery = await checkinsCollection
    .where({ coupleId: couple._id })
    .orderBy('createdAt', 'desc')
    .get();

  // 关联愿望标题
  const wishIds = [...new Set(allQuery.data.map((c) => c.wishId).filter(Boolean))];
  const wishesMap = {};
  if (wishIds.length > 0) {
    const wishesQuery = await wishesCollection.where({ _id: _.in(wishIds) }).get();
    wishesQuery.data.forEach((w) => {
      wishesMap[w._id] = w;
    });
  }

  const points = [];
  const cityMap = {};

  allQuery.data.forEach((c) => {
    const loc = c.location;
    if (!loc || !loc.latitude || !loc.longitude) return;

    const wish = wishesMap[c.wishId] || null;
    const city = loc.city || '其他地点';

    points.push({
      checkInId: c._id,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      name: loc.name || '',
      address: loc.address || '',
      city,
      wishTitle: wish ? wish.title : '愿望打卡',
      wishCategory: wish ? wish.category : 'other',
      createdAt: c.createdAt,
    });

    if (!cityMap[city]) {
      cityMap[city] = { city, count: 0, lastAt: null };
    }
    cityMap[city].count += 1;
    const t = new Date(c.createdAt).getTime();
    if (!cityMap[city].lastAt || t > new Date(cityMap[city].lastAt).getTime()) {
      cityMap[city].lastAt = c.createdAt;
    }
  });

  // 同一坐标合并（保留 6 位小数精度）
  const merged = {};
  points.forEach((p) => {
    const key = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
    if (!merged[key]) {
      merged[key] = { ...p, count: 1 };
    } else {
      merged[key].count += 1;
    }
  });

  const cities = Object.values(cityMap).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return new Date(b.lastAt) - new Date(a.lastAt);
  });
  // 「其他地点」永远排最后
  cities.sort((a, b) => (a.city === '其他地点' ? 1 : b.city === '其他地点' ? -1 : 0));

  const markers = Object.values(merged).slice(0, limit);

  return {
    code: 0,
    data: {
      markers,
      cities,
      totalPoints: points.length,
      totalCities: cities.filter((c) => c.city !== '其他地点').length,
    },
    message: 'ok',
  };
}

/**
 * 成就（12 项，按情侣维度计算）
 */
const ACHIEVEMENT_DEFS = [
  { id: 'ACH-01', name: '初次愿望', icon: '🏅', desc: '创建第 1 个愿望',
    check: (ctx) => ({ done: ctx.wishTotal >= 1, current: ctx.wishTotal, target: 1 }) },
  { id: 'ACH-02', name: '成双成对', icon: '💑', desc: '双方各创建至少 1 个愿望',
    check: (ctx) => ({ done: ctx.bothCreated, current: ctx.bothCreated ? 2 : 1, target: 2 }) },
  { id: 'ACH-03', name: '美食家', icon: '🍜', desc: '完成 5 个美食类愿望',
    check: (ctx) => ({ done: ctx.categoryDone.food >= 5, current: ctx.categoryDone.food, target: 5 }) },
  { id: 'ACH-04', name: '旅行家', icon: '✈️', desc: '完成 3 个旅行类愿望',
    check: (ctx) => ({ done: ctx.categoryDone.travel >= 3, current: ctx.categoryDone.travel, target: 3 }) },
  { id: 'ACH-05', name: '运动健将', icon: '⚽', desc: '完成 3 个运动类愿望',
    check: (ctx) => ({ done: ctx.categoryDone.sport >= 3, current: ctx.categoryDone.sport, target: 3 }) },
  { id: 'ACH-06', name: '光影时刻', icon: '🎬', desc: '完成 3 个电影类愿望',
    check: (ctx) => ({ done: ctx.categoryDone.movie >= 3, current: ctx.categoryDone.movie, target: 3 }) },
  { id: 'ACH-07', name: '居家能手', icon: '🏠', desc: '完成 3 个居家类愿望',
    check: (ctx) => ({ done: ctx.categoryDone.home >= 3, current: ctx.categoryDone.home, target: 3 }) },
  { id: 'ACH-08', name: '小有成就', icon: '🌟', desc: '累计完成 10 个愿望',
    check: (ctx) => ({ done: ctx.completedTotal >= 10, current: ctx.completedTotal, target: 10 }) },
  { id: 'ACH-09', name: '百愿千寻', icon: '💯', desc: '累计完成 50 个愿望',
    check: (ctx) => ({ done: ctx.completedTotal >= 50, current: ctx.completedTotal, target: 50 }) },
  { id: 'ACH-10', name: '连续打卡', icon: '🔥', desc: '连续 7 个自然日每天至少 1 条记录',
    check: (ctx) => ({ done: ctx.maxStreak >= 7, current: ctx.maxStreak, target: 7 }) },
  { id: 'ACH-11', name: '记录达人', icon: '📸', desc: '累计上传 50 个照片或视频',
    check: (ctx) => ({ done: ctx.mediaTotal >= 50, current: ctx.mediaTotal, target: 50 }) },
  { id: 'ACH-12', name: '形影不离', icon: '💞', desc: '在一起满 365 天',
    check: (ctx) => ({ done: ctx.days >= 365, current: ctx.days, target: 365 }) },
];

/**
 * 计算连续打卡天数
 * @param {Array<Date>} dates
 * @returns {number}
 */
function _maxDailyStreak(dates) {
  const dayKeys = [...new Set(
    dates
      .map((d) => {
        const t = new Date(d);
        if (isNaN(t.getTime())) return null;
        return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      })
      .filter((v) => v !== null)
  )].sort((a, b) => a - b);

  let max = 0;
  let current = 0;
  let prev = null;
  dayKeys.forEach((day) => {
    if (prev !== null && day - prev === 24 * 60 * 60 * 1000) {
      current += 1;
    } else {
      current = 1;
    }
    max = Math.max(max, current);
    prev = day;
  });
  return max;
}

/**
 * 成就墙
 * 入参：{ refresh?: boolean } —— 默认读缓存（10 分钟内有效）
 * 说明：12 项成就需扫描该情侣全部历史数据，按 PRD §10 的要求做缓存，
 *       写操作（打卡/建愿望）后前端传 refresh=true 强制重算。
 */
const ACHIEVEMENT_CACHE_MS = 10 * 60 * 1000;
const _achievementCache = {};

async function _handleAchievements(openid, event) {
  const { couple } = await _checkCouple(openid);

  const cached = _achievementCache[couple._id];
  const forceRefresh = event && event.refresh;
  if (!forceRefresh && cached && Date.now() - cached.at < ACHIEVEMENT_CACHE_MS) {
    return { code: 0, data: cached.data, message: 'ok(cached)' };
  }

  const wishesQuery = await wishesCollection.where({ coupleId: couple._id }).get();
  const checkinsQuery = await checkinsCollection.where({ coupleId: couple._id }).get();

  const wishes = wishesQuery.data;
  const checkins = checkinsQuery.data;

  const categoryDone = {};
  wishes.forEach((w) => {
    if (w.status === 'completed' && categoryDone[w.category] !== undefined) {
      categoryDone[w.category] += 1;
    } else if (w.status === 'completed') {
      categoryDone[w.category] = 1;
    }
  });

  const creators = new Set(wishes.map((w) => w.createdBy).filter(Boolean));
  const completedTotal = wishes.filter((w) => w.status === 'completed').length;
  const mediaTotal = checkins.reduce(
    (sum, c) => sum + ((c.mediaList && c.mediaList.length) || 0),
    0
  );

  // 在一起天数
  let days = 0;
  if (couple.anniversary) {
    const start = new Date(couple.anniversary);
    const now = new Date();
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    days = Math.floor((t - s) / (24 * 60 * 60 * 1000)) + 1;
  }

  const ctx = {
    wishTotal: wishes.length,
    bothCreated: creators.size >= 2,
    completedTotal,
    categoryDone,
    maxStreak: _maxDailyStreak(checkins.map((c) => c.createdAt)),
    mediaTotal,
    days: Math.max(0, days),
  };

  const list = ACHIEVEMENT_DEFS.map((def) => {
    const r = def.check(ctx);
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      desc: def.desc,
      achieved: r.done,
      current: Math.min(r.current, r.target),
      target: r.target,
      progressText: r.done
        ? '已达成'
        : def.id === 'ACH-12'
          ? `还有 ${Math.max(0, r.target - r.current)} 天`
          : def.id === 'ACH-10'
            ? `连续 ${r.current}/${r.target} 天`
            : `还差 ${Math.max(0, r.target - r.current)} 个`,
    };
  });

  const data = {
    list,
    achievedCount: list.filter((a) => a.achieved).length,
    total: list.length,
  };
  _achievementCache[couple._id] = { at: Date.now(), data };

  return { code: 0, data, message: 'ok' };
}

/**
 * 年度报告
 * 入参：{ year?: number }
 */
async function _handleAnnualReport(openid, event) {
  const { couple } = await _checkCouple(openid);

  const now = new Date();
  const year = Number(event.year) || now.getFullYear();
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const wishesQuery = await wishesCollection.where({ coupleId: couple._id }).get();
  const checkinsQuery = await checkinsCollection.where({ coupleId: couple._id }).get();

  const inRange = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };

  const createdWishes = wishesQuery.data.filter((w) => inRange(w.createdAt));
  const completedWishes = wishesQuery.data.filter(
    (w) => w.status === 'completed' && inRange(w.completedAt)
  );
  const yearCheckins = checkinsQuery.data.filter((c) => inRange(c.createdAt));

  // 月度分布
  const monthly = new Array(12).fill(0);
  yearCheckins.forEach((c) => {
    const m = new Date(c.createdAt).getMonth();
    monthly[m] += 1;
  });
  let topMonth = 0;
  monthly.forEach((v, i) => {
    if (v > monthly[topMonth]) topMonth = i;
  });
  const hasMonthlyData = monthly.some((v) => v > 0);

  // 最爱的分类（按已完成愿望）
  const categoryCount = {};
  completedWishes.forEach((w) => {
    categoryCount[w.category] = (categoryCount[w.category] || 0) + 1;
  });
  let topCategory = null;
  let topCount = 0;
  Object.entries(categoryCount).forEach(([cat, count]) => {
    if (count > topCount) {
      topCount = count;
      topCategory = cat;
    }
  });

  // 年度最佳瞬间：第一条带媒体的记录，否则第一条记录
  const sorted = yearCheckins
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const withMedia = sorted.find((c) => c.mediaList && c.mediaList.length > 0);
  const best = withMedia || sorted[0] || null;

  let bestMoment = null;
  if (best) {
    let wishTitle = '愿望打卡';
    let wishCategory = 'other';
    if (best.wishId) {
      const wishQuery = await wishesCollection.doc(best.wishId).get();
      if (wishQuery.data) {
        wishTitle = wishQuery.data.title;
        wishCategory = wishQuery.data.category;
      }
    }
    const firstMedia = (best.mediaList || []).find((m) => m.type !== 'video') ||
      (best.mediaList || [])[0] || null;
    bestMoment = {
      checkInId: best._id,
      wishTitle,
      wishCategory,
      media: firstMedia,
      createdAt: best.createdAt,
    };
  }

  // 在一起天数
  let days = 0;
  if (couple.anniversary) {
    const s = new Date(couple.anniversary);
    const sMid = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const tMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    days = Math.max(0, Math.floor((tMid - sMid) / (24 * 60 * 60 * 1000)) + 1);
  }

  return {
    code: 0,
    data: {
      year,
      wishCreated: createdWishes.length,
      wishCompleted: completedWishes.length,
      checkInTotal: yearCheckins.length,
      monthly,
      topMonth: hasMonthlyData ? { month: topMonth + 1, count: monthly[topMonth] } : null,
      topCategory: topCategory ? { category: topCategory, count: topCount } : null,
      bestMoment,
      anniversaryDays: days,
      couple,
    },
    message: 'ok',
  };
}


module.exports = exports;
