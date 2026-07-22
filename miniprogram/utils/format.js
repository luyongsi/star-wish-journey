// utils/format.js — 格式化工具：日期格式化、相对时间、文本截断

/**
 * 补零
 * @param {number} n
 * @returns {string}
 */
function _pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|string|number} date - 日期对象/字符串/时间戳
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatDateTime(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

/**
 * 格式化为 YYYY年MM月
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatMonth(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${_pad(d.getMonth() + 1)}月`;
}

/**
 * 相对时间（如"3天前"、"刚刚"、"2小时前"）
 * @param {Date|string|number} date
 * @returns {string}
 */
function formatRelativeTime(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

/**
 * 文本截断
 * @param {string} text - 原文
 * @param {number} maxLen - 最大长度
 * @returns {string}
 */
function truncate(text, maxLen = 30) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

/**
 * 计算两个日期间隔天数
 * @param {Date|string|number} startDate
 * @param {Date|string|number} [endDate] - 默认当前时间
 * @returns {number}
 */
function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * 格式化文件大小
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

module.exports = {
  formatDate,
  formatDateTime,
  formatMonth,
  formatRelativeTime,
  truncate,
  daysBetween,
  formatFileSize,
};
