// probe-src.mjs —— 快速验收「原图对照卡」交互（不跑 3.6s 形变，秒级出结果）：
// 用 ?img= 让图片在 boot 时载入 → 卡出现 → 依次点 放大 / 显示原图(关) / 显示原图(开) / × ，每步量几何。
// 用法：node probe-src.mjs <art.html> <image.png> <outDir> [w] [h]
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
if (!html || !img || !outDir) { console.error('usage: node probe-src.mjs <art.html> <image.png> <outDir> [w] [h]'); process.exit(1) }
const W = parseInt(wArg || '1600', 10), H = parseInt(hArg || '900', 10)
const url = 'file:///' + path.resolve(html).replace(/\\/g, '/') + '?img=' + encodeURIComponent('file:///' + path.resolve(img).replace(/\\/g, '/'))
fs.mkdirSync(path.resolve(outDir), { recursive: true })

const READ = () => {
    const q = s => document.querySelector(s)
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }
    const card = q('#src-card'), cv = q('#canvas-container canvas'), area = q('.canvas-area')
    const show = card ? getComputedStyle(card).display !== 'none' : false
    const pane = q('#compare-pane'), pim = q('#pane-img')
    return {
        cardShown: show, big: card ? card.classList.contains('big') : null, cardRect: show ? R(card) : null,
        cardOverlapCanvas: (show && cv) ? (R(card).x + R(card).w <= R(cv).x + R(cv).w + 0.6) : null,
        cap: (q('#src-cap') || {}).textContent || null,
        sideBtn: (q('#imgsrc-btn') || {}).textContent || null,
        split: area ? area.classList.contains('split') : null,
        splitBtn: (q('#split-btn') || {}).textContent || null,
        paneShown: pane ? getComputedStyle(pane).display : null,
        paneRect: pane && getComputedStyle(pane).display !== 'none' ? R(pane) : null,
        paneImgNat: pim ? pim.naturalWidth + 'x' + pim.naturalHeight : null,
        canvasRect: R(cv), areaRect: R(area),
        scrollY: document.documentElement.scrollHeight - innerHeight,
        status: (q('#img-status') || {}).textContent || null
    }
}

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 180000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
        '--hide-scrollbars', '--disable-lcd-text', '--allow-file-access-from-files']
})
const out = { url }
try {
    const page = await browser.newPage()
    const logs = []
    page.on('pageerror', e => logs.push('PAGEERROR: ' + String(e.message).slice(0, 300)))
    page.on('console', m => { if (m.type() === 'error') logs.push('console.error: ' + m.text().slice(0, 200)) })
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction('!!window.__DIAG__', { timeout: 120000 })
    await page.waitForFunction('window.__DIAG__.img && window.__DIAG__.img.samples > 0', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 1200))
    out.onLoad = await page.evaluate(READ)
    const p = n => path.join(path.resolve(outDir), n)
    await page.screenshot({ path: p('src-onload.png') })

    const click = async sel => { await page.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); else throw new Error('no ' + s); }, sel); await new Promise(r => setTimeout(r, 350)) }
    await click('#src-card .src-btn')                       // 放大
    out.big = await page.evaluate(READ)
    await page.screenshot({ path: p('src-big.png') })
    await click('#imgsrc-btn')                              // 显示原图：关
    out.off = await page.evaluate(READ)
    await click('#imgsrc-btn')                              // 显示原图：开
    out.on = await page.evaluate(READ)
    await click('#src-card .src-btn:nth-of-type(2)')        // × 关闭
    out.closed = await page.evaluate(READ)
    await click('#imgsrc-btn')                              // 重新打开小卡
    await click('#split-btn')                               // 对比分屏：开
    out.splitOn = await page.evaluate(READ)
    await page.screenshot({ path: p('src-split.png') })
    await click('#split-btn')                               // 对比分屏：关
    out.splitOff = await page.evaluate(READ)
    out.logs = logs
    console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
