// utils/date.js — 日期工具（v1.1）：计划日期、日期选择、相对显示

/**
 * 补零
 */
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 转为 YYYY-MM-DD（本地时区）
 * @param {Date|string|number} date
 * @returns {string}
 */
function toDateKey(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 今天（本地 00:00）的时间戳
 */
function todayStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 解析 'YYYY-MM-DD' 为本地 00:00 的 Date
 * @param {string} value
 * @returns {Date|null}
 */
function parseDateKey(value) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!matched) return null;
  const d = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 计划日期显示文案
 * @param {Date|string|null} plannedDate
 * @param {number} [overdueDays]
 * @returns {{ text: string, overdue: boolean, isToday: boolean }}
 */
function formatPlannedDate(plannedDate, overdueDays) {
  if (!plannedDate) {
    return { text: '未计划', overdue: false, isToday: false };
  }
  const d = new Date(plannedDate);
  if (isNaN(d.getTime())) {
    return { text: '未计划', overdue: false, isToday: false };
  }
  const planned = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = todayStart();
  const diffDays = Math.round((planned - today) / (24 * 60 * 60 * 1000));

  let label = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diffDays === 0) label = '今天';
  else if (diffDays === 1) label = '明天';
  else if (diffDays === -1) label = '昨天';
  else if (diffDays > 1 && diffDays < 7) label = `${diffDays} 天后`;

  const overdue = diffDays < 0;
  if (overdue) {
    const overdueCount = typeof overdueDays === 'number' ? overdueDays : Math.abs(diffDays);
    return {
      text: overdueCount > 0 ? `已过期 ${overdueCount} 天` : '已过期',
      overdue: true,
      isToday: false,
    };
  }
  return { text: label, overdue: false, isToday: diffDays === 0 };
}

/**
 * 计算两个日期间隔天数（起点当天算 1 天）
 */
function daysSince(startDate) {
  if (!startDate) return 0;
  const s = new Date(startDate);
  if (isNaN(s.getTime())) return 0;
  const sMid = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const diff = Math.floor((todayStart() - sMid) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff + 1 : 0;
}

/**
 * 生成日期选择器的快捷选项
 * @returns {Array<{ label: string, value: string }>}
 */
function quickDateOptions() {
  const today = todayStart();
  const result = [{ label: '今天', value: toDateKey(today) }];

  // 本周六（若今天就是周六则取下一个周六）
  const d = new Date(today);
  const dow = d.getDay();
  const addDays = dow === 6 ? 7 : (6 - dow + 7) % 7;
  const saturday = today + addDays * 24 * 60 * 60 * 1000;
  result.push({ label: '本周六', value: toDateKey(saturday) });

  // 明天
  result.push({ label: '明天', value: toDateKey(today + 24 * 60 * 60 * 1000) });

  return result;
}

module.exports = {
  toDateKey,
  parseDateKey,
  todayStart,
  formatPlannedDate,
  daysSince,
  quickDateOptions,
};
