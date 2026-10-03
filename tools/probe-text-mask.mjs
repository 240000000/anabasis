// 文字 → 粒子 无视觉自检：把「排版栅格」与「粒子点云」各投影成稀疏 ASCII 图
// 用法: node probe-text-mask.mjs <art.html> "<文字>" [cols] [rows]
// 本机没有视觉模型，字形是否正确只能这样看：ASCII 图能直接读出笔画结构
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const [htmlPath, text, colsArg = '96', rowsArg = '48'] = process.argv.slice(2)
if (!htmlPath || !text) { console.error('usage: node probe-text-mask.mjs <art.html> "<text>" [cols] [rows]'); process.exit(1) }
const cols = parseInt(colsArg, 10), rows = parseInt(rowsArg, 10)

const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/1/.dsh/profiles/web/node_modules/puppeteer-core')
const edge = (process.env.EDGE_PATH ? [process.env.EDGE_PATH] : [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]).find(fs.existsSync)
if (!edge) { console.error('Edge not found'); process.exit(1) }

const abs = fs.realpathSync(htmlPath)
const q = 'bare=1&frames=1&shape=4&text=' + encodeURIComponent(text)
const url = 'file:///' + abs.replace(/\\/g, '/') + '?' + q

const browser = await puppeteer.launch({
  executablePath: edge, headless: true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars']
})
try {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)))
  await page.setViewport({ width: 1110, height: 1110, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 })
  await page.waitForFunction('window.__READY__ === true', { timeout: 600000 })
  const r = await page.evaluate(({ cols, rows }) => {
    const W = Math.max(320, Math.min(1024, params.txtRes | 0));
    const AR = Math.max(0.7, Math.min(3.4, camera.aspect * 0.96));
    const H = Math.max(160, Math.round(W / AR));
    const raster = drawTextRaster(textInfo.text, W, H);
    const d = raster.cv.getContext('2d').getImageData(0, 0, W, H).data;
    const g1 = [], g2 = [];
    for (let r_ = 0; r_ < rows; r_++) { g1.push(new Array(cols).fill(0)); g2.push(new Array(cols).fill(0)); }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 40) g1[(y * rows / H) | 0][(x * cols / W) | 0]++;
      }
    }
    // 粒子点云 → 池像素坐标 → 同一张网格（验证「点云确实落在字形上」）
    const A = window.__IMG_ATTR__, s = A.s, pw = A.w, ph = A.h;
    for (let i = 0; i < A.n; i++) {
      const px = A.p[i * 3] / s + pw / 2, py = (-A.p[i * 3 + 1]) / s + ph / 2;
      const gx = (px * cols / pw) | 0, gy = (py * rows / ph) | 0;
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) g2[gy][gx]++;
    }
    return { W, H, g1, g2, text: textInfo, samples: imgPool.n, formation: formLabel() };
  }, { cols, rows })

  const ascii = (g, thr) => g.map(row => row.map(v => v >= thr ? '#' : (v > 0 ? '.' : ' ')).join('')).join('\n')
  const cell = (r.W / cols) * (r.H / rows)
  console.log('text    : ' + JSON.stringify(r.text))
  console.log('raster  : ' + r.W + '×' + r.H + '  → 网格 ' + cols + '×' + rows + '（每格 ≈ ' + cell.toFixed(0) + ' px）')
  console.log('samples : ' + r.samples + ' · formation: ' + r.formation)
  console.log('\n── 排版栅格（独立于粒子）──\n' + ascii(r.g1, Math.max(1, cell * 0.10)))
  console.log('\n── 粒子点云投影（应与上图同形）──\n' + ascii(r.g2, 1))
  console.log('\npageErrors: ' + JSON.stringify(errs))
} finally {
  await browser.close()
}
