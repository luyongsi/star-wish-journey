// cloudfunctions/pair/index.js — 贴贴云函数
// switch(action): create / join / unbind / info
// 公共鉴权: _checkCouple()

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');

const MAX_PAIR_CODE_RETRY = 5;

/**
 * 生成 6 位贴贴码，确保在 pending 态 couples 中唯一
 * @returns {Promise<string>}
 */
async function _generatePairCode() {
  for (let i = 0; i < MAX_PAIR_CODE_RETRY; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await couplesCollection
      .where({ pairCode: code, status: 'pending' })
      .count();
    if (existing.total === 0) {
      return code;
    }
  }
  throw new Error('贴贴码生成失败，请重试');
}

/**
 * 校验 openid 属于 active couple
 * @param {string} openid
 * @returns {Promise<Object>} couple 文档
 * @throws {Error} code 1001 未贴贴
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
  return coupleQuery.data;
}

/**
 * 获取用户和伴侣信息
 * @param {Object} couple
 * @returns {Promise<Object>}
 */
async function _getPartnerInfo(couple) {
  const openid = cloud.getWXContext().OPENID;
  const partnerOpenid = couple.userA === openid ? couple.userB : couple.userA;

  let partner = null;
  if (partnerOpenid) {
    const partnerQuery = await usersCollection.where({ openid: partnerOpenid }).get();
    if (partnerQuery.data.length > 0) {
      partner = partnerQuery.data[0];
    }
  }

  // 计算在一起天数：起点当天计为第 1 天
  const anniversaryDays = calcAnniversaryDays(couple.anniversary);

  return { partner, anniversaryDays };
}

/**
 * 贴贴云函数主入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'create':
        return await _handleCreate(openid);
      case 'join':
        return await _handleJoin(openid, event.pairCode);
      case 'unbind':
        return await _handleUnbind(openid);
      case 'info':
        return await _handleInfo(openid);
      case 'updateProfile':
        return await _handleUpdateProfile(openid, event);
      case 'anniversary':
        return await _handleAnniversary(openid, event);
      default:
        return { code: 1004, data: null, message: '未知的 action: ' + action };
    }
  } catch (err) {
    console.error('[pair] action=' + action + ' 失败:', err);
    return {
      code: err.code || 500,
      data: null,
      message: err.message || '操作失败',
    };
  }
};

/**
 * 发起贴贴：生成贴贴码，创建 pending couple
 */
async function _handleCreate(openid) {
  // 查询用户
  const userQuery = await usersCollection.where({ openid }).get();
  if (userQuery.data.length === 0) {
    return { code: 1003, data: null, message: '用户不存在' };
  }
  const user = userQuery.data[0];

  // 检查是否已有 active couple
  if (user.coupleId) {
    const existingCouple = await couplesCollection.doc(user.coupleId).get();
    if (existingCouple.data && existingCouple.data.status === 'active') {
      return { code: 1002, data: null, message: '已经贴贴，无需重复操作' };
    }
  }

  // 生成贴贴码
  const pairCode = await _generatePairCode();

  // 创建 couple 记录
  const newCouple = {
    userA: openid,
    userB: '',
    status: 'pending',
    pairCode,
    anniversary: null,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const addResult = await couplesCollection.add({ data: newCouple });

  // 更新用户的 coupleId
  await usersCollection.doc(user._id).update({
    data: { coupleId: addResult._id, updatedAt: db.serverDate() },
  });

  const couple = {
    _id: addResult._id,
    ...newCouple,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    code: 0,
    data: { couple, pairCode },
    message: '贴贴码已生成',
  };
}

/**
 * 加入贴贴：通过贴贴码加入
 */
async function _handleJoin(openid, pairCode) {
  if (!pairCode || !/^\d{6}$/.test(pairCode)) {
    return { code: 1004, data: null, message: '贴贴码应为6位数字' };
  }

  // 查询用户
  const userQuery = await usersCollection.where({ openid }).get();
  if (userQuery.data.length === 0) {
    return { code: 1003, data: null, message: '用户不存在' };
  }
  const user = userQuery.data[0];

  // 检查是否已有 active couple
  if (user.coupleId) {
    const existingCouple = await couplesCollection.doc(user.coupleId).get();
    if (existingCouple.data && existingCouple.data.status === 'active') {
      return { code: 1002, data: null, message: '已经贴贴，无需重复操作' };
    }
  }

  // 查找 pending couple
  const coupleQuery = await couplesCollection
    .where({ pairCode, status: 'pending' })
    .get();

  if (coupleQuery.data.length === 0) {
    return { code: 1002, data: null, message: '贴贴码无效或已被使用' };
  }

  const couple = coupleQuery.data[0];

  // 不能加入自己创建的贴贴
  if (couple.userA === openid) {
    return { code: 1002, data: null, message: '不能加入自己发起的贴贴' };
  }

  // 事务更新：couple 状态变更 + userB coupleId
  // 并发安全：在事务内重新读取 couple，仅当仍是 pending 且 userB 为空时才允许绑定，
  // 防止同一贴贴码被两人同时输入时产生双人绑定。
  try {
    const transactionResult = await db.runTransaction(async (transaction) => {
      const coupleRef = transaction.collection('couples').doc(couple._id);
      const latestQuery = await coupleRef.get();
      const latest = latestQuery && latestQuery.data;

      if (!latest || latest.status !== 'pending' || latest.userB) {
        const err = new Error('贴贴码已被使用');
        err.code = 1002;
        throw err;
      }

      const now = db.serverDate();
      await coupleRef.update({
        data: {
          userB: openid,
          status: 'active',
          anniversary: now,
          boundAt: now,
          pairCode: '',
          updatedAt: now,
        },
      });

      // 更新 userB 的 coupleId
      await transaction.collection('users').doc(user._id).update({
        data: { coupleId: couple._id, updatedAt: now },
      });

      return { coupleId: couple._id };
    });

    // 获取更新后的 couple
    const updatedCoupleQuery = await couplesCollection.doc(transactionResult.coupleId).get();
    const updatedCouple = updatedCoupleQuery.data;
    updatedCouple.anniversary = updatedCouple.anniversary || new Date();

    return {
      code: 0,
      data: { couple: updatedCouple },
      message: '贴贴成功',
    };
  } catch (err) {
    if (err.code === 1002) {
      return { code: 1002, data: null, message: '贴贴码已被使用' };
    }
    throw err;
  }
}

/**
 * 解除贴贴
 */
async function _handleUnbind(openid) {
  let couple;
  try {
    couple = await _checkCouple(openid);
  } catch (err) {
    return { code: err.code, data: null, message: err.message };
  }

  const now = db.serverDate();

  // 更新 couple 状态
  await couplesCollection.doc(couple._id).update({
    data: { status: 'unbound', updatedAt: now },
  });

  // 清空双方 coupleId
  await usersCollection.where({ openid: couple.userA }).update({
    data: { coupleId: '', updatedAt: now },
  });
  if (couple.userB) {
    await usersCollection.where({ openid: couple.userB }).update({
      data: { coupleId: '', updatedAt: now },
    });
  }

  return {
    code: 0,
    data: null,
    message: '已解除贴贴',
  };
}

/**
 * 获取贴贴信息 + 伴侣信息 + 在一起天数
 * 注意：不使用 _checkCouple()，因为 pending 状态的 couple 也需要能查询
 */
async function _handleInfo(openid) {
  // 查询用户
  const userQuery = await usersCollection.where({ openid }).get();
  if (userQuery.data.length === 0 || !userQuery.data[0].coupleId) {
    return { code: 1001, data: null, message: '未贴贴' };
  }

  const user = userQuery.data[0];
  const coupleQuery = await couplesCollection.doc(user.coupleId).get();
  if (!coupleQuery.data) {
    return { code: 1001, data: null, message: '未贴贴' };
  }

  const couple = coupleQuery.data;

  // status 为 pending/active 都能正常返回，只有 unbound 才报未贴贴
  if (couple.status === 'unbound') {
    return { code: 1001, data: null, message: '已解除贴贴' };
  }

  const { partner, anniversaryDays } = await _getPartnerInfo(couple);

  // 获取当前用户信息
  const currentUser = userQuery.data[0] || null;

  return {
    code: 0,
    data: { couple, partner, currentUser, anniversaryDays },
    message: 'ok',
  };
}

/**
 * 计算在一起天数（起点当天算第 1 天）
 * @param {Date|string|null} anniversary
 * @returns {number}
 */
function calcAnniversaryDays(anniversary) {
  if (!anniversary) return 0;
  const start = new Date(anniversary);
  if (isNaN(start.getTime())) return 0;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today - startDay) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff + 1 : 0;
}

/**
 * 解析 'YYYY-MM-DD'
 * @param {string} value
 * @returns {Date|null}
 */
function parseDateOnly(value) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!matched) return null;
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

/**
 * 更新本人资料：昵称、头像
 * 入参：{ nickName?, avatarUrl? }
 */
async function _handleUpdateProfile(openid, event) {
  const userQuery = await usersCollection.where({ openid }).get();
  if (userQuery.data.length === 0) {
    return { code: 1003, data: null, message: '用户不存在' };
  }
  const user = userQuery.data[0];

  const updateData = { updatedAt: db.serverDate() };

  if (event.nickName !== undefined) {
    const nickName = String(event.nickName || '').trim();
    if (nickName.length > 20) {
      return { code: 1004, data: null, message: '昵称不能超过20个字' };
    }
    updateData.nickName = nickName;
  }

  if (event.avatarUrl !== undefined) {
    updateData.avatarUrl = String(event.avatarUrl || '');
  }

  await usersCollection.doc(user._id).update({ data: updateData });

  return {
    code: 0,
    data: { ...user, ...updateData },
    message: '资料已保存',
  };
}

/**
 * 修改在一起纪念日（couple 维度，双方共享）
 * 入参：{ anniversary: 'YYYY-MM-DD' | null }
 */
async function _handleAnniversary(openid, event) {
  const couple = await _checkCouple(openid);

  let anniversary = null;
  if (event.anniversary) {
    anniversary = parseDateOnly(event.anniversary);
    if (!anniversary) {
      return { code: 1004, data: null, message: '纪念日格式不正确' };
    }
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (anniversary.getTime() > todayMidnight.getTime()) {
      return { code: 1004, data: null, message: '纪念日不能选择未来日期' };
    }
  } else {
    // 清除时回落到贴贴成功日
    anniversary = couple.boundAt || couple.anniversary || null;
  }

  await couplesCollection.doc(couple._id).update({
    data: { anniversary, updatedAt: db.serverDate() },
  });

  return {
    code: 0,
    data: {
      couple: { ...couple, anniversary },
      anniversaryDays: calcAnniversaryDays(anniversary),
    },
    message: '纪念日已更新',
  };
}


module.exports = exports;
