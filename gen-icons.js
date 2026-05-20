// One-off: generates the PWA / iOS app icons (icon-180/192/512.png).
// Pure Node — no dependencies. Re-run with `node gen-icons.js` to tweak.
const zlib = require("zlib");
const fs = require("fs");

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

function makePNG(size) {
  const bg = [18, 100, 74]; // deep green background
  const bar = [255, 255, 255]; // white bars
  const accent = [46, 196, 138]; // bright green — tallest bar

  // Three ascending bars (a tiny "growth" chart) on a green field.
  const barW = size * 0.16;
  const gap = size * 0.07;
  const totalW = barW * 3 + gap * 2;
  const startX = (size - totalW) / 2;
  const baseY = size * 0.74; // bars sit on this line
  const heights = [size * 0.2, size * 0.32, size * 0.46];
  const bars = heights.map((h, i) => ({
    x0: startX + i * (barW + gap),
    x1: startX + i * (barW + gap) + barW,
    y0: baseY - h,
    y1: baseY,
    color: i === 2 ? accent : bar,
  }));

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // PNG filter byte per row
    for (let x = 0; x < size; x++) {
      let c = bg;
      for (const b of bars) {
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) c = b.color;
      }
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
      raw[off + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [180, 192, 512]) {
  fs.writeFileSync(`${__dirname}/icon-${s}.png`, makePNG(s));
  console.log(`wrote icon-${s}.png`);
}
