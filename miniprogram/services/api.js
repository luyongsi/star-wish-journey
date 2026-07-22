// services/api.js — 汇总导出所有 service
const auth = require('./auth');
const pair = require('./pair');
const wish = require('./wish');
const checkin = require('./checkin');
const media = require('./media');
const memory = require('./memory');

module.exports = {
  auth,
  pair,
  wish,
  checkin,
  media,
  memory,
};
