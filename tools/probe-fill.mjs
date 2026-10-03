// probe-fill.mjs —— 验收「画布铺满右侧区域 + 原图对照卡」：
// 1) 量画布/区域/原图卡的实际几何（宽高是否铺满、页面有无溢出滚动、绘制缓冲是否与 CSS 一致）
// 2) 走真实上传路径，量上传后的几何与卡内容，并逐控件点一遍开关
// 3) 产出：整页截图 + 画布裁剪截图（画布裁剪图可用于像素统计）
// 用法：node probe-fill.mjs <art.html> <image.png> <outDir> [width] [height]
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
if (!html || !img || !outDir) { console.error('usage: node probe-fill.mjs <art.html> <image.png> <outDir> [w] [h]'); process.exit(1) }
const W = parseInt(wArg || '1600', 10), H = parseInt(hArg || '900', 10)
const url = 'file:///' + path.resolve(html).replace(/\\/g, '/')
fs.mkdirSync(path.resolve(outDir), { recursive: true })

const MEASURE = () => {
    const q = s => document.querySelector(s)
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }
    const cv = q('#canvas-container canvas')
    const card = q('#src-card'), im = q('#src-img'), area = q('.canvas-area')
    const a = R(area), c = R(cv)
    return {
        viewport: [innerWidth, innerHeight],
        docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        areaRect: a, canvasCssRect: c,
        drawBuffer: cv ? [cv.width, cv.height] : null,
        fillRatio: (a && c) ? { w: +(c.w / a.w).toFixed(3), h: +(c.h / a.h).toFixed(3) } : null,
        overflow: (a && c) ? { dw: +(c.w - a.w).toFixed(1), dh: +(c.h - a.h).toFixed(1), scrollY: document.documentElement.scrollHeight - innerHeight } : null,
        card: card ? { display: getComputedStyle(card).display, big: card.classList.contains('big'), rect: R(card), cap: (q('#src-cap') || {}).textContent } : null,
        srcImg: im ? { shown: getComputedStyle(im).display, nat: im.naturalWidth + 'x' + im.naturalHeight, rect: R(im), head: (im.getAttribute('src') || '').slice(0, 32) } : null,
        sideBtn: (q('#imgsrc-btn') || {}).textContent || null,
        status: (q('#img-status') || {}).textContent || null,
        imgWeight: window.__DIAG__ ? window.__DIAG__.imgWeight : null,
        samples: window.__DIAG__ && window.__DIAG__.img ? window.__DIAG__.img.samples : null
    }
}

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
        '--hide-scrollbars', '--disable-lcd-text', '--allow-file-access-from-files']
})
const out = {}
try {
    const page = await browser.newPage()
    const logs = []
    page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 240)))
    page.on('pageerror', e => logs.push('PAGEERROR: ' + String(e.message).slice(0, 400)))
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__DIAG__', { timeout: 120000 })
    await new Promise(r => setTimeout(r, 900))
    out.empty = await page.evaluate(MEASURE)
    const p = n => path.join(path.resolve(outDir), n)
    await page.screenshot({ path: p('fill-empty.png') })
    { const c = out.empty.canvasCssRect; await page.screenshot({ path: p('fill-canvas-empty.png'), clip: { x: c.x, y: c.y, width: c.w, height: c.h } }) }

    // ── 真实上传路径
    const input = await page.$('#img-file')
    await input.uploadFile(path.resolve(img))
    await page.waitForFunction('window.__DIAG__ && window.__DIAG__.imgWeight > 0.99', { timeout: 240000 })
    await new Promise(r => setTimeout(r, 900))
    out.uploaded = await page.evaluate(MEASURE)
    await page.screenshot({ path: p('fill-uploaded.png') })
    { const c = out.uploaded.canvasCssRect; await page.screenshot({ path: p('fill-canvas-img.png'), clip: { x: c.x, y: c.y, width: c.w, height: c.h } }) }

    // ── 原图卡放大
    await page.evaluate(() => document.querySelectorAll('#src-card .src-btn')[0].click())
    await new Promise(r => setTimeout(r, 400))
    out.big = await page.evaluate(MEASURE)
    await page.screenshot({ path: p('fill-card-big.png') })

    // ── 侧栏开关：关 → 开
    await page.evaluate(() => document.getElementById('imgsrc-btn').click())
    await new Promise(r => setTimeout(r, 250))
    out.toggleOff = await page.evaluate(MEASURE)
    await page.evaluate(() => document.getElementById('imgsrc-btn').click())
    await new Promise(r => setTimeout(r, 250))
    out.toggleOn = await page.evaluate(MEASURE)

    // ── 窗口缩放：画布应重新贴合，不出现溢出
    await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 })
    await new Promise(r => setTimeout(r, 700))
    out.resized = await page.evaluate(MEASURE)
    await page.screenshot({ path: p('fill-resized.png') })

    out.logs = logs.slice(-14)
    console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
