// 洄游 · Anabasis 3D 定格渲染器（headless Edge + SwiftShader WebGL）
// 用法: node render-3d.mjs <art.html> <out.png> "<query>" [canvas|full]
//   query 例: "frames=200&shape=0&cam=0.5,0.15,17.5"、"frames=378"（形变途中）、"frames=260&glitch=1"
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const [htmlPath, outPath, query = 'frames=200&shape=0', mode = 'canvas'] = process.argv.slice(2)
if (!htmlPath || !outPath) { console.error('usage: node render-3d.mjs <art.html> <out.png> "<query>" [canvas|full]'); process.exit(1) }

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
const qs = query + (mode === 'full' ? '' : '&bare=1')
const url = 'file:///' + abs.replace(/\\/g, '/') + '?' + qs

const browser = await puppeteer.launch({
  executablePath: edge, headless: true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars']
})
const T0 = Date.now()
try {
  const page = await browser.newPage()
  const logs = []
  page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300)))
  page.on('pageerror', e => logs.push('pageerror: ' + String(e.message).slice(0, 300)))
  // 出图模式固定 1110×1110（画布钉死在 0,0 的 1100×1100）；整页模式给侧栏留宽度
  const VW = mode === 'full' ? 1440 : 1110
  const VH = mode === 'full' ? 1240 : 1110
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 })
  await page.waitForFunction('window.__READY__ === true', { timeout: 600000 })
  const diag = await page.evaluate(() => window.__DIAG__ || null)
  const timing = await page.evaluate(() => window.__TIMING__ || null)
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  let info
  if (mode === 'full') {
    const h = await page.evaluate(() => document.body.scrollHeight)
    const dsf = Math.min(1, 1880 / h)
    if (dsf < 1) { await page.setViewport({ width: VW, height: VH, deviceScaleFactor: dsf }); await new Promise(r => setTimeout(r, 400)) }
    await page.screenshot({ path: outPath, fullPage: true })
    info = { pageHeight: h, deviceScaleFactor: dsf }
  } else {
    const el = await page.$('#canvas-container canvas')
    if (!el) throw new Error('canvas not found')
    info = await el.boundingBox()
    await el.screenshot({ path: outPath })
  }
  console.log(JSON.stringify({ ok: true, out: path.resolve(outPath), qs, canvas: info, bytes: fs.statSync(outPath).size, ms: Date.now() - T0, timing, diag, logs }, null, 1))
} finally {
  await browser.close()
}
