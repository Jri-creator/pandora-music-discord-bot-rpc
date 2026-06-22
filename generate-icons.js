#!/usr/bin/env node
// generate-icons.js — creates minimal valid PNG icons in Pandora blue
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, r, g, b) {
  // Minimal PNG generator — solid color square
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    let crc = 0xffffffff;
    for (const byte of crcData) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  // Build raw image rows (filter byte 0 + RGB per pixel)
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0; // filter none
  for (let x = 0; x < size; x++) {
    row[1 + x*3]   = r;
    row[1 + x*3+1] = g;
    row[1 + x*3+2] = b;
  }
  const rows = Buffer.concat(Array(size).fill(row));
  const compressed = zlib.deflateSync(rows);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.join(__dirname, 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Pandora blue: #3668FF → rgb(54, 104, 255)
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), createPNG(size, 54, 104, 255));
  console.log(`✓ icon${size}.png`);
}
console.log('Icons generated in extension/icons/');
