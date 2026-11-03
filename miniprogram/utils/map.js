// utils/map.js — 地图坐标工具（足迹标记与缩放）

const EARTH_RADIUS = 6378137;

/**
 * 经纬度转 Web Mercator 米制坐标
 */
function lngLatToMeter(lng, lat) {
  const x = (lng * Math.PI * EARTH_RADIUS) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * EARTH_RADIUS);
  return { x, y };
}

/**
 * 计算一组点的外接矩形（米制）
 * @param {Array<{latitude:number, longitude:number}>} points
 * @returns {{minX,maxX,minY,maxY,centerLng,centerLat}|null}
 */
function bounds(points) {
  if (!points || points.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((p) => {
    const m = lngLatToMeter(Number(p.longitude), Number(p.latitude));
    minX = Math.min(minX, m.x);
    maxX = Math.max(maxX, m.x);
    minY = Math.min(minY, m.y);
    maxY = Math.max(maxY, m.y);
  });

  return { minX, maxX, minY, maxY };
}

/**
 * 根据外接矩形估算地图缩放级别（微信地图 scale 3~20）
 * @param {Array} points
 * @param {number} [viewportWidthPx=340]
 * @returns {number}
 */
function calcScale(points, viewportWidthPx) {
  const b = bounds(points);
  if (!b) return 5;

  const widthPx = viewportWidthPx || 340;
  const spanX = Math.max(b.maxX - b.minX, 1);
  const spanY = Math.max(b.maxY - b.minY, 1);
  const span = Math.max(spanX, spanY);

  // Web Mercator：世界宽度 = 2 * PI * R，缩放级别 z 下 1 像素 = 世界宽度 / (256 * 2^z)
  const worldWidth = 2 * Math.PI * EARTH_RADIUS;
  const scale = Math.log2((worldWidth * widthPx) / (256 * span));

  return Math.max(3, Math.min(16, Math.round(scale)));
}

/**
 * 计算地图中心点
 * @param {Array} points
 * @returns {{latitude:number, longitude:number}}
 */
function center(points) {
  if (!points || points.length === 0) {
    return { latitude: 34.26, longitude: 108.94 };
  }
  let lat = 0;
  let lng = 0;
  points.forEach((p) => {
    lat += Number(p.latitude) || 0;
    lng += Number(p.longitude) || 0;
  });
  return { latitude: lat / points.length, longitude: lng / points.length };
}

/**
 * 计算视图参数（中心 + 缩放）
 * @param {Array} points
 * @param {number} [viewportWidthPx]
 */
function viewport(points, viewportWidthPx) {
  return {
    center: center(points),
    scale: calcScale(points, viewportWidthPx),
  };
}

module.exports = {
  bounds,
  calcScale,
  center,
  viewport,
};
