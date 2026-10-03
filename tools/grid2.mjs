// 自定义分辨率亮度网格（校验字形/轮廓结构）：node grid2.mjs <png> [cols=24] [rows=8]
import fs from 'node:fs'
import zlib from 'node:zlib'

function decode(file) {
  const buf = fs.readFileSync(file)
  let p = 8, w = 0, h = 0, ct = 0, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len)
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9] } else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), ch = ct === 6 ? 4 : ct === 4 ? 2 : 3, stride = w * ch
  const out = Buffer.alloc(h * stride); let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++], row = raw.subarray(q, q + stride); q += stride
    const cur = out.subarray(y * stride, (y + 1) * stride), prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cur[x] = v & 255
    }
  }
  return { w, h, ch, stride, out }
}

const [file, cols = '24', rows = '8'] = process.argv.slice(2)
const C = parseInt(cols, 10), R = parseInt(rows, 10)
const im = decode(file)
const lum = (x, y) => { const i = y * im.stride + x * im.ch; return 0.299 * im.out[i] + 0.587 * im.out[i + 1] + 0.114 * im.out[i + 2] }
console.log(file.split(/[\\/]/).pop(), `${im.w}x${im.h}`, `grid ${R}x${C}`)
for (let r = 0; r < R; r++) {
  const row = []
  for (let c = 0; c < C; c++) {
    let s = 0, n = 0
    for (let y = Math.floor(r * im.h / R); y < (r + 1) * im.h / R; y += 4)
      for (let x = Math.floor(c * im.w / C); x < (c + 1) * im.w / C; x += 4) { s += lum(x, y); n++ }
    row.push(Math.round(s / Math.max(n, 1)))
  }
  console.log(String(r).padStart(2) + ' | ' + row.map(v => String(v).padStart(3)).join(''))
}
