// rows-profile.mjs —— 零依赖 PNG 解码，输出「按水平带」的亮度剖面，用于把渲染图与源图逐带对照。
// 用法：node rows-profile.mjs <png> [bands=32] [threshold=40]
import fs from 'node:fs'
import zlib from 'node:zlib'

const file = process.argv[2]
const BANDS = +(process.argv[3] || 32)
const THR = +(process.argv[4] || 40)

function decode(p) {
    const buf = fs.readFileSync(p)
    let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0, idat = []
    while (off < buf.length) {
        const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8)
        const data = buf.subarray(off + 8, off + 8 + len)
        if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
        else if (type === 'IDAT') idat.push(data)
        else if (type === 'IEND') break
        off += 12 + len
    }
    if (bitDepth !== 8) throw new Error('只支持 8bit：' + bitDepth)
    const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
    if (!ch) throw new Error('不支持 colorType ' + colorType)
    const raw = zlib.inflateSync(Buffer.concat(idat))
    const stride = W * ch, out = Buffer.alloc(H * stride)
    let prev = Buffer.alloc(stride)
    for (let y = 0; y < H; y++) {
        const ft = raw[y * (stride + 1)]
        const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
        const cur = Buffer.from(line)
        for (let x = 0; x < stride; x++) {
            const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
            if (ft === 1) cur[x] = (cur[x] + a) & 255
            else if (ft === 2) cur[x] = (cur[x] + b) & 255
            else if (ft === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255
            else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
        }
        cur.copy(out, y * stride); prev = cur
    }
    return { W, H, ch, data: out }
}

const { W, H, ch, data } = decode(file)
const bandH = Math.max(1, Math.floor(H / BANDS))
const rows = []
for (let b = 0; b < BANDS; b++) {
    const y0 = b * bandH, y1 = Math.min(H, b === BANDS - 1 ? H : y0 + bandH)
    let sum = 0, cnt = 0, bright = 0
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * ch
        const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        sum += L; cnt++; if (L > THR) bright++
    }
    rows.push({ band: b, y0, y1, meanLum: +(sum / cnt).toFixed(1), brightPct: +(100 * bright / cnt).toFixed(1) })
}
console.log(`${file} ${W}x${H} ch=${ch} bands=${BANDS} thr=${THR}`)
console.log('band   y0   y1   meanLum  bright%')
for (const r of rows) console.log(`${String(r.band).padStart(3)} ${String(r.y0).padStart(5)} ${String(r.y1).padStart(5)}   ${String(r.meanLum).padStart(6)}  ${String(r.brightPct).padStart(6)}`)
