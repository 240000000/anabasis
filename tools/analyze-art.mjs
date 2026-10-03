// 归潮 · 出图自检：零依赖解码 PNG（zlib + 反滤波），输出亮度网格 / 高亮包围盒 / 冷暖占比
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
const buf = fs.readFileSync(file)
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png')

let pos = 8, w = 0, h = 0, bitDepth = 8, colorType = 6, interlace = 0
const idat = []
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos)
  const type = buf.toString('ascii', pos + 4, pos + 8)
  const data = buf.subarray(pos + 8, pos + 8 + len)
  if (type === 'IHDR') {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4)
    bitDepth = data[8]; colorType = data[9]; interlace = data[12]
  } else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  pos += 12 + len
}
if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png: depth=${bitDepth} interlace=${interlace}`)
const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
if (!ch) throw new Error('unsupported colorType ' + colorType)

const raw = zlib.inflateSync(Buffer.concat(idat))
const stride = w * ch
const px = Buffer.alloc(h * stride)
for (let y = 0; y < h; y++) {
  const ft = raw[y * (stride + 1)]
  const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
  const out = px.subarray(y * stride, (y + 1) * stride)
  const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
  for (let i = 0; i < stride; i++) {
    const a = i >= ch ? out[i - ch] : 0
    const b = prev[i]
    const c = i >= ch ? prev[i - ch] : 0
    let v = src[i]
    if (ft === 1) v += a
    else if (ft === 2) v += b
    else if (ft === 3) v += (a + b) >> 1
    else if (ft === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
    }
    out[i] = v & 0xff
  }
}

const G = 12
const grid = Array.from({ length: G }, () => new Array(G).fill(0))
const counts = Array.from({ length: G }, () => new Array(G).fill(0))
let bright = 0, minX = w, maxX = -1, minY = h, maxY = -1, warm = 0, cool = 0, sum = 0
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * stride + x * ch
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += lum
    const gy = Math.min(G - 1, Math.floor(y / (h / G))), gx = Math.min(G - 1, Math.floor(x / (w / G)))
    grid[gy][gx] += lum; counts[gy][gx]++
    if (lum > 40) {
      bright++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (r > b + 8) warm++; else if (b > r + 8) cool++
    }
  }
}
const rows = grid.map((row, gy) => row.map((v, gx) => Math.round(v / counts[gy][gx])).join(' '))
console.log(JSON.stringify({
  file, size: [w, h],
  meanLum: +(sum / (w * h)).toFixed(2),
  brightPixels: bright,
  brightRatio: +(bright / (w * h)).toFixed(4),
  brightBBox: bright ? [minX, minY, maxX, maxY] : null,
  warmVsCool: { warm, cool, warmRatio: +(warm / Math.max(1, warm + cool)).toFixed(3) },
  lumGrid: rows,
}, null, 1))
