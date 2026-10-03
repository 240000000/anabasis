// shots-ui.mjs —— 交互界面出图（宽屏 1600×900）：空白态 / 图片态（含原图对照卡）/ 对比分屏态
// 用法：node shots-ui.mjs <art.html> <image.png> <outDir> [w] [h]
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

const [html, img, outDir, wArg, hArg] = process.argv.slice(2)
if (!html || !img || !outDir) { console.error('usage: node shots-ui.mjs <art.html> <image.png> <outDir> [w] [h]'); process.exit(1) }
const W = parseInt(wArg || '1600', 10), H = parseInt(hArg || '900', 10)
const base = 'file:///' + path.resolve(html).replace(/\\/g, '/')
const imgURL = 'file:///' + path.resolve(img).replace(/\\/g, '/')
const p = n => path.join(path.resolve(outDir), n)
fs.mkdirSync(path.resolve(outDir), { recursive: true })

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
        '--hide-scrollbars', '--disable-lcd-text', '--allow-file-access-from-files']
})
try {
    const page = await browser.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)))
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })

    // 1) 空白态：粒子场铺满右侧
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__DIAG__', { timeout: 120000 })
    await new Promise(r => setTimeout(r, 1500))
    await page.screenshot({ path: p('ui-wide-empty.png') })
    const geo1 = await page.evaluate(() => { const c = document.querySelector('#canvas-container canvas').getBoundingClientRect(); return [c.width, c.height] })

    // 2) 图片态：显式 shape=4（立刻成形，便于对照）+ 原图对照卡
    await page.goto(base + '?shape=4&cam=0.4,0.18,17.5&img=' + encodeURIComponent(imgURL), { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__DIAG__ && window.__DIAG__.img && window.__DIAG__.img.samples > 0', { timeout: 120000 })
    await new Promise(r => setTimeout(r, 1500))
    await page.screenshot({ path: p('ui-wide-image.png') })

    // 3) 对比分屏
    await page.evaluate(() => document.getElementById('split-btn').click())
    await new Promise(r => setTimeout(r, 900))
    await page.screenshot({ path: p('ui-wide-split.png') })

    console.log(JSON.stringify({ ok: true, canvas: geo1, errors: errs, files: ['ui-wide-empty.png', 'ui-wide-image.png', 'ui-wide-split.png'] }, null, 1))
} finally { await browser.close() }
