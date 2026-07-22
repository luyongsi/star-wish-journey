// generate-tab-icons.js — 生成小程序 tabBar 图标 (81x81px PNG)
// 无外部依赖，纯 Node.js 生成
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 81;
const OUT_DIR = path.join(__dirname, 'miniprogram', 'assets', 'tab');

// 颜色
const GRAY = [153, 153, 153];     // #999999 未选中
const PINK = [255, 107, 157];     // #FF6B9D 选中
const TRANSPARENT = [0, 0, 0, 0];

// --- PNG 编码器 ---
function createPNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA data (width*height*4)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // IDAT: raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([signature, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', iend)]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// CRC32
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

// --- 像素画布 ---
function createCanvas() {
  return new Uint8Array(SIZE * SIZE * 4); // all transparent
}

function setPixel(pixels, x, y, color, alpha = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
  pixels[idx + 3] = alpha;
}

function fillRect(pixels, x, y, w, h, color, alpha = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(pixels, x + dx, y + dy, color, alpha);
    }
  }
}

function fillCircle(pixels, cx, cy, r, color, alpha = 255) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) {
        setPixel(pixels, cx + x, cy + y, color, alpha);
      }
    }
  }
}

function drawLine(pixels, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const steps = Math.max(dx, dy);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + (dx * i) / steps * Math.sign(x2 - x1));
    const y = Math.round(y1 + (dy * i) / steps * Math.sign(y2 - y1));
    fillRect(pixels, x, y, thickness, thickness, color);
  }
}

// --- 图标绘制函数 ---

// 愿望池: 三条横线 (列表图标)
function drawPoolIcon(color) {
  const pixels = createCanvas();
  const margin = 18;
  const lineH = 6;
  const gap = 14;
  const startY = (SIZE - (lineH * 3 + gap * 2)) / 2;
  for (let i = 0; i < 3; i++) {
    fillRect(pixels, margin, Math.round(startY) + i * (lineH + gap), SIZE - margin * 2, lineH, color);
  }
  return pixels;
}

// 抽取: 骰子 (方框 + 三个点)
function drawDrawIcon(color) {
  const pixels = createCanvas();
  const boxX = 18, boxY = 18, boxW = 45, boxH = 45;
  // 边框
  const bw = 4;
  fillRect(pixels, boxX, boxY, boxW, bw, color);
  fillRect(pixels, boxX, boxY + boxH - bw, boxW, bw, color);
  fillRect(pixels, boxX, boxY, bw, boxH, color);
  fillRect(pixels, boxX + boxW - bw, boxY, bw, boxH, color);
  // 三个点 (骰子)
  fillCircle(pixels, 30, 30, 4, color);
  fillCircle(pixels, 51, 30, 4, color);
  fillCircle(pixels, 40, 51, 4, color);
  return pixels;
}

// 打卡: 相机图标
function drawCheckinIcon(color) {
  const pixels = createCanvas();
  // 机身
  const bodyX = 14, bodyY = 22, bodyW = 53, bodyH = 38;
  const bw = 4;
  fillRect(pixels, bodyX, bodyY, bodyW, bw, color);
  fillRect(pixels, bodyX, bodyY + bodyH - bw, bodyW, bw, color);
  fillRect(pixels, bodyX, bodyY, bw, bodyH, color);
  fillRect(pixels, bodyX + bodyW - bw, bodyY, bw, bodyH, color);
  // 顶部凸起 (闪光灯)
  fillRect(pixels, 30, bodyY - 6, 18, 6, color);
  // 镜头
  fillCircle(pixels, 40, 41, 11, color);
  fillCircle(pixels, 40, 41, 6, [0, 0, 0, 0], 0); // 中心透明
  return pixels;
}

// 我的: 人像图标
function drawProfileIcon(color) {
  const pixels = createCanvas();
  // 头 (圆)
  fillCircle(pixels, 40, 28, 12, color);
  // 身体 (半圆/梯形)
  for (let y = 46; y < 68; y++) {
    for (let x = 18; x < 63; x++) {
      const dx = x - 40;
      const dy = y - 68;
      if (dx * dx + dy * dy <= 22 * 22) {
        setPixel(pixels, x, y, color);
      }
    }
  }
  return pixels;
}

// --- 生成所有图标 ---
const icons = [
  { name: 'pool', draw: drawPoolIcon },
  { name: 'draw', draw: drawDrawIcon },
  { name: 'checkin', draw: drawCheckinIcon },
  { name: 'profile', draw: drawProfileIcon },
];

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

let count = 0;
for (const icon of icons) {
  // 未选中 (灰色)
  const inactivePixels = icon.draw(GRAY);
  const inactivePNG = createPNG(SIZE, SIZE, inactivePixels);
  fs.writeFileSync(path.join(OUT_DIR, `${icon.name}.png`), inactivePNG);
  count++;

  // 选中 (粉色)
  const activePixels = icon.draw(PINK);
  const activePNG = createPNG(SIZE, SIZE, activePixels);
  fs.writeFileSync(path.join(OUT_DIR, `${icon.name}-active.png`), activePNG);
  count++;
}

console.log(`✅ 已生成 ${count} 个 tabBar 图标到 ${OUT_DIR}`);
console.log('文件列表:');
for (const icon of icons) {
  console.log(`  ${icon.name}.png / ${icon.name}-active.png`);
}
