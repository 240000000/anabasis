// render-anim.mjs —— 从作品里逐帧截出动画序列（单次页面会话内推进模拟，避免每帧重新 boot）
// 用法: node render-anim.mjs <art.html> <outDir> "<query>" <frames> [stepPerFrame] [px]
//   例: node render-anim.mjs anabasis-3d.html out/anim-whale "shape=0" 48 6 700
// query 里不用带 frames/bare/size，脚本会自动补（?frames=1&bare=1 保底）
import fs from 'node:fs'
import path from 'node:path'
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

const [html, outDir, query = '', nArg = '48', stepArg = '6', pxArg = '700'] = process.argv.slice(2)
if (!html || !outDir) { console.error('usage: node render-anim.mjs <art.html> <outDir> "<query>" <frames> [stepPerFrame] [px]'); process.exit(1) }
const N = parseInt(nArg, 10), STEP = parseInt(stepArg, 10), PX = parseInt(pxArg, 10)
const dir = path.resolve(outDir); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })

const q = new URLSearchParams(query)
q.delete('frames'); q.delete('bare'); q.delete('size')
const url = 'file:///' + path.resolve(html).replace(/\\/g, '/') + '?frames=1&bare=1&' + q.toString()

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--allow-file-access-from-files']
})
try {
    const page = await browser.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)))
    await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.waitForFunction('!!window.__READY__ && typeof window.__ADVANCE__ === "function"', { timeout: 180000 })
    const canvas = await page.$('#canvas-container canvas')
    const t0 = Date.now()
    const marks = []
    for (let i = 0; i < N; i++) {
        if (i > 0) marks.push(await page.evaluate((k) => window.__ADVANCE__(k, 1 / 60), STEP))
        await canvas.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png') })
        if (i % 12 === 0) console.log('  frame', i, 't=', marks.length ? marks[marks.length - 1].time : 0)
    }
    const box = await canvas.boundingBox()
    console.log(JSON.stringify({
        ok: true, frames: N, stepPerFrame: STEP, canvas: [Math.round(box.width), Math.round(box.height)],
        simTimeEnd: marks.length ? marks[marks.length - 1].time : 0,
        secs: +((Date.now() - t0) / 1000).toFixed(1), dir, errors: errs
    }, null, 1))
} finally { await browser.close() }
