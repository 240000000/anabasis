// 归潮 · 运行时诊断：检查目标点云数量、粒子是否收敛、画布实际像素
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const puppeteer = require(process.env.PUPPETEER_CORE || [
    'C:/Users/1/.dsh/profiles/web/node_modules/puppeteer-core',  // 本机 DSH web profile 自带的副本
    'puppeteer-core',                                            // 或在仓库里 npm i puppeteer-core
].find(p => { try { require.resolve(p); return true } catch { return false } }) || 'puppeteer-core')
const edge = (process.env.EDGE_PATH ? [process.env.EDGE_PATH] : [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]).find(fs.existsSync)

const abs = fs.realpathSync(process.argv[2])
const frames = process.argv[3] || '200'
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--disable-gpu', '--no-sandbox'] })
try {
  const page = await browser.newPage()
  page.on('console', m => console.log('[page]', m.text()))
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  await page.setViewport({ width: 1280, height: 1300, deviceScaleFactor: 1 })
  await page.goto('file:///' + abs.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForFunction('typeof attractors !== "undefined" && particles.length > 0', { timeout: 60000 })
  const out = await page.evaluate((n) => {
    // 同步推进 n 帧
    for (let i = 0; i < n; i++) tick(stepCount++)
    const cv = document.querySelector('#canvas-container canvas')
    const c2 = cv.getContext('2d')
    const dpr = cv.width / 1200
    const img = c2.getImageData(0, 0, cv.width, cv.height).data
    const lum = (x, y) => { const i = ((y * dpr | 0) * cv.width + (x * dpr | 0)) * 4; return (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]).toFixed(1) }
    let maxL = 0, over50 = 0
    const N = 12
    const densMap = Array.from({ length: N }, () => new Array(N).fill(0))
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4
        const l = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]
        if (l > maxL) maxL = l
        if (l > 50) {
          over50++
          densMap[Math.min(N - 1, (y / (cv.height / N)) | 0)][Math.min(N - 1, (x / (cv.width / N)) | 0)]++
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y
        }
      }
    }
    const d = particles.map(p => Math.hypot(p.hx - p.x, p.hy - p.y))
    d.sort((a, b) => a - b)
    const aX = attractors.map(a => a.x), aY = attractors.map(a => a.y)
    return {
      canvas: [cv.width, cv.height], dpr, attractors: attractors.length, particles: particles.length,
      whaleCenter: [whaleCx | 0, whaleCy | 0],
      attractorBBox: [Math.min(...aX) | 0, Math.min(...aY) | 0, Math.max(...aX) | 0, Math.max(...aY) | 0],
      distToHome: { p10: d[(d.length * 0.1) | 0].toFixed(1), median: d[(d.length / 2) | 0].toFixed(1), p90: d[(d.length * 0.9) | 0].toFixed(1) },
      pixelLum: { center: lum(600, 600), body: lum(500, 560), back: lum(700, 500), bgCorner: lum(60, 60), head: lum(950, 600) },
      maxLum: +maxL.toFixed(1), pixelsOver50: over50, brightBBox: over50 ? [bx0, by0, bx1, by1] : null,
      brightDensity12x12: densMap.map(r => r.map(v => String(v).padStart(5)).join('')),
      bucketHist: (() => { const b = new Array(24).fill(0); for (const p of particles) b[p.b]++; return b })()
    }
  }, parseInt(frames, 10))
  console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
