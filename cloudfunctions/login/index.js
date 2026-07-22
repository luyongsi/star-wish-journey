// cloudfunctions/login/index.js — 登录云函数
// 获取 openid，查/建 users 记录，返回 { user, couple: null }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const usersCollection = db.collection('users');
const couplesCollection = db.collection('couples');

/**
 * 登录云函数
 * 1. 获取 openid
 * 2. 查询 users 记录，不存在则创建
 * 3. 查询 couple 信息
 * @returns {{ code: number, data: { user: Object, couple: Object|null }, message: string }}
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { code: 1003, data: null, message: '无法获取用户身份' };
  }

  try {
    // 查询用户记录
    let userRecord = null;
    const userQuery = await usersCollection.where({ openid }).get();

    if (userQuery.data.length > 0) {
      // 用户已存在
      userRecord = userQuery.data[0];
      // 更新 updatedAt
      await usersCollection.doc(userRecord._id).update({
        data: { updatedAt: db.serverDate() },
      });
      userRecord.updatedAt = new Date();
    } else {
      // 新用户，创建记录
      const newUser = {
        openid,
        nickName: '',
        avatarUrl: '',
        coupleId: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      };
      const addResult = await usersCollection.add({ data: newUser });
      userRecord = {
        _id: addResult._id,
        ...newUser,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // 查询情侣信息
    let couple = null;
    if (userRecord.coupleId) {
      const coupleQuery = await couplesCollection.doc(userRecord.coupleId).get();
      if (coupleQuery.data) {
        couple = coupleQuery.data;
      }
    }

    return {
      code: 0,
      data: { user: userRecord, couple },
      message: 'ok',
    };
  } catch (err) {
    console.error('[login] 登录失败:', err);
    return {
      code: 500,
      data: null,
      message: '登录失败: ' + err.message,
    };
  }
};
