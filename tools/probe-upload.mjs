// probe-upload.mjs —— 走真实用户路径的验收：把本地图片塞进 <input type=file>，
// 等它被识别成粒子形态，再整页截图（顺带得到含新面板的界面图）。
// 用法：node probe-upload.mjs <art.html> <image.png> <out.png> [width]
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

const [html, img, out, wArg] = process.argv.slice(2)
if (!html || !img || !out) { console.error('usage: node probe-upload.mjs <art.html> <image.png> <out.png> [width]'); process.exit(1) }
const W = parseInt(wArg || '1400', 10)
const url = 'file:///' + path.resolve(html).replace(/\\/g, '/')

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 180000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
        '--hide-scrollbars', '--disable-lcd-text', '--allow-file-access-from-files']
})
try {
    const page = await browser.newPage()
    const logs = []
    page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300)))
    page.on('pageerror', e => logs.push('PAGEERROR: ' + String(e.message).slice(0, 400)))
    await page.setViewport({ width: W, height: 1300, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForSelector('#img-file', { timeout: 60000 })

    // ── 真实路径：input type=file 的 change 事件 → handleImageFile → FileReader → 识别 → 形变
    const input = await page.$('#img-file')
    await input.uploadFile(path.resolve(img))

    await page.waitForFunction('window.__DIAG__ && window.__DIAG__.img && window.__DIAG__.imgWeight > 0.99', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 700))       // 等形变落定 + 一帧稳定

    const st = await page.evaluate(() => ({
        diag: window.__DIAG__ || null,
        status: (document.getElementById('img-status') || {}).textContent || null,
        colorBtn: (document.getElementById('imgcolor-btn') || {}).textContent || null,
        lockBtn: (document.getElementById('imglock-btn') || {}).textContent || null,
        modeSelect: (document.getElementById('img-mode') || {}).value || null
    }))
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    await page.screenshot({ path: path.resolve(out), fullPage: true })
    console.log(JSON.stringify({ ok: true, out: path.resolve(out), st, logs: logs.slice(-12) }, null, 1))
} finally { await browser.close() }
