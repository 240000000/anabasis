// 采样 PNG 指定行列的像素（用于定位画布边缘异常亮带）
import fs from 'node:fs'
import zlib from 'node:zlib'

function decode(file) {
  const buf = fs.readFileSync(file)
  let p = 8, w = 0, h = 0, ct = 0, bd = 0, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let q = 0
  for (let y = 0; y < h; y++) {
    const f = raw[q++]
    const row = raw.subarray(q, q + stride); q += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
      let v = row[x]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cur[x] = v & 255
    }
  }
  return { w, h, ch, px: out, get: (x, y) => { const i = y * stride + x * ch; return [out[i], out[i + 1], out[i + 2]] } }
}

const img = decode(process.argv[2])
const ys = (process.argv[3] || '10,275,550,825,1089').split(',').map(Number)
const xs = (process.argv[4] || '0,60,120,300,550,900,1000,1030,1060,1090,1099').split(',').map(Number)
console.log(`${img.w}x${img.h} ch=${img.ch}`)
for (const y of ys) {
  console.log('y=' + String(y).padStart(4) + '  ' + xs.map(x => `x${x}:${img.get(x, y).join(',')}`).join('  '))
}
