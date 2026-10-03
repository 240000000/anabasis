// 归潮 · 静态定格渲染器：把 p5 动画以 ?frames=N&bare=1 同步跑到第 N 帧，再截取纯画布 PNG
// 用法: node render-art.mjs <art.html> <out.png> [frames]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const [htmlPath, outPath, frames = '1240', mode = 'canvas'] = process.argv.slice(2)
if (!htmlPath || !outPath) { console.error('usage: node render-art.mjs <art.html> <out.png> [frames] [canvas|full]'); process.exit(1) }

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
if (!edge) { console.error('Edge not found'); process.exit(1) }

const abs = fs.realpathSync(htmlPath)
const url = 'file:///' + abs.replace(/\\/g, '/') + `?frames=${frames}` + (mode === 'full' ? '' : '&bare=1')
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--disable-gpu', '--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 1300, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 })
  await page.waitForFunction('window.__READY__ === true', { timeout: 600000 })
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  let box
  if (mode === 'full') {
    // 整页（含侧栏 UI）截图；超高时按比例降采样以满足内联预览的 1900px/边上限
    const h = await page.evaluate(() => document.body.scrollHeight)
    const dsf = Math.min(1, 1880 / h)
    if (dsf < 1) { await page.setViewport({ width: 1280, height: 1300, deviceScaleFactor: dsf }); await new Promise(r => setTimeout(r, 400)) }
    box = { pageHeight: h, deviceScaleFactor: dsf }
    await page.screenshot({ path: outPath, fullPage: true })
  } else {
    const el = await page.$('#canvas-container canvas')
    if (!el) throw new Error('canvas not found')
    box = await el.boundingBox()
    await el.screenshot({ path: outPath })
  }
  const stat = fs.statSync(outPath)
  console.log(JSON.stringify({ ok: true, out: path.resolve(outPath), frames, canvas: box, bytes: stat.size }))
} finally {
  await browser.close()
}
