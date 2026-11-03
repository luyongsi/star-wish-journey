// utils/location.js — 位置选择（PRD §6.2 D6 / §9.1）
// 仅在用户主动点击时调起，不做后台定位

/**
 * 从详细地址中解析城市名
 * 「广东省深圳市南山区xx路」→ 深圳市
 * 「浙江省杭州市西湖区」→ 杭州市
 * @param {string} address
 * @returns {string}
 */
function parseCity(address) {
  if (!address || typeof address !== 'string') return '';
  // 去掉省市之间的空白
  const text = address.trim().replace(/\s+/g, '');

  // 直辖市优先（避免「北京市朝阳区」被匹配成「市」）
  const municipality = /^(北京|上海|天津|重庆)市?/.exec(text);
  if (municipality) return `${municipality[1]}市`;

  // 自治州 / 地区 / 盟 优先于「市」，避免被省名吞掉
  const autonomous = /^(?:.*?(?:省|自治区))?([^省自治区]*?(?:自治州|地区|盟))/.exec(text);
  if (autonomous && autonomous[1]) return autonomous[1];

  // 地级市：取省/自治区之后的第一段「xx市」
  const cityMatch = /^(?:.*?(?:省|自治区))?([^省自治区]*?市)/.exec(text);
  if (cityMatch && cityMatch[1]) return cityMatch[1];

  return '';
}

/**
 * 调起地图选点
 * @returns {Promise<Object|null>} { name, address, latitude, longitude, city } 或 null（用户取消）
 */
function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: (res) => {
        const address = res.address || '';
        resolve({
          name: res.name || '',
          address,
          latitude: Number(res.latitude) || 0,
          longitude: Number(res.longitude) || 0,
          city: parseCity(address),
        });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') !== -1) {
          resolve(null);
          return;
        }
        if (msg.indexOf('auth') !== -1 || msg.indexOf('deny') !== -1) {
          reject(new Error('需要位置权限才能添加位置'));
          return;
        }
        if (msg.indexOf('privacy') !== -1) {
          reject(new Error('请先同意位置信息授权'));
          return;
        }
        reject(new Error('选择位置失败，请重试'));
      },
    });
  });
}

module.exports = {
  chooseLocation,
  parseCity,
};
