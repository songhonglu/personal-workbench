// _gen-icons.js — 纯 Node 生成 PWA 图标（零依赖：手写 PNG 编码器 + 2x 超采样抗锯齿）
// 设计：绿色圆角方块(#2f7d51，与入口页一致) + 白色对勾，内容在 maskable 安全区内
const zlib = require('zlib');
const fs = require('fs');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘制 ---------- */
const BG = [0x2f, 0x7d, 0x51];      // #2f7d51 入口页同款绿
const FG = [0xff, 0xff, 0xff];
const RADIUS = 0.22;                 // 圆角比例
// 对勾折线（相对坐标，全部落在 maskable 中心 40% 安全区内）
const PTS = [[0.27, 0.52], [0.43, 0.675], [0.73, 0.325]];
const STROKE = 0.088;

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function inRoundedRect(x, y, s, r) {
  if (x < 0 || y < 0 || x > s || y > s) return false;
  const rr = r * s;
  const cx = Math.min(Math.max(x, rr), s - rr);
  const cy = Math.min(Math.max(y, rr), s - rr);
  return (x >= rr && x <= s - rr) || (y >= rr && y <= s - rr) || Math.hypot(x - cx, y - cy) <= rr;
}
function inCheck(x, y, s) {
  const sw = STROKE * s / 2;
  for (let i = 0; i < PTS.length - 1; i++) {
    const [ax, ay] = PTS[i], [bx, by] = PTS[i + 1];
    if (distToSeg(x, y, ax * s, ay * s, bx * s, by * s) <= sw) return true;
  }
  return false;
}
function render(size) {
  const SS = 2, S = size * SS;   // 2x 超采样
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x * SS + sx + 0.5), py = (y * SS + sy + 0.5);
          let col = null;
          if (inRoundedRect(px, py, S, RADIUS)) col = inCheck(px, py, S) ? FG : BG;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a++; }
        }
      }
      const i = (y * size + x) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; buf[i + 3] = 255; }
    }
  }
  return encodePNG(size, size, buf);
}

fs.writeFileSync('icon-512.png', render(512));
fs.writeFileSync('icon-192.png', render(192));
console.log('✅ icon-512.png', fs.statSync('icon-512.png').size, 'bytes');
console.log('✅ icon-192.png', fs.statSync('icon-192.png').size, 'bytes');
