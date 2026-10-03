// check-live.mjs —— 对已部署的线上作品做端到端自检（不是只看 HTTP 200）
// 用法：node tools/check-live.mjs <url> [out.png] [query]
//   例：node tools/check-live.mjs https://240000000.github.io/anabasis/anabasis-3d.html
//       node tools/check-live.mjs https://240000000.github.io/anabasis/anabasis-3d.html live.png "frames=150&shape=2&bare=1"
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
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
]).find(fs.existsSync)

const [url, outPng, query] = process.argv.slice(2)
if (!url) { console.error('usage: node check-live.mjs <url> [out.png] [query]'); process.exit(1) }
const target = url + (query ? (url.includes('?') ? '&' : '?') + query : '')

const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 600000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars']
})
let code = 0
try {
    const page = await browser.newPage()
    const errs = [], failed = []
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)))
    page.on('requestfailed', r => failed.push(r.url().slice(0, 120)))
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    const t0 = Date.now()
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120000 })
    // 注意：__DIAG__ 有两个阶段 —— initializeSystem() 只放 {points}，reportImage() 每帧才填满 weights/formation。
    // 必须等到完整 diag，否则会读到只有 points 的占位对象（formation 为 undefined → 误判失败）。
    const diag = await page.waitForFunction(
        '(window.__DIAG__ && window.__DIAG__.points && window.__DIAG__.formation && window.__DIAG__.weights) ? window.__DIAG__ : null',
        { timeout: 120000 }).then(h => h.jsonValue())
    const shot = outPng ? path.resolve(outPng) : null
    if (shot) await page.screenshot({ path: shot })
    const size = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null })
    const ok = errs.length === 0 && diag && diag.points > 0 && Array.isArray(diag.weights) && size && size[0] > 0
    if (!ok) code = 2
    console.log(JSON.stringify({
        ok, url: target, loadMs: Date.now() - t0,
        diag: { points: diag.points, formation: diag.formation, weights: diag.weights, glitch: diag.glitch, cam: diag.cam },
        canvas: size, pageErrors: errs, failedRequests: failed.filter(u => !/favicon/.test(u)),
        screenshot: shot
    }, null, 1))
} catch (e) {
    console.log(JSON.stringify({ ok: false, url: target, fatal: String(e.message).slice(0, 300) }, null, 1))
    code = 1
} finally { await browser.close() }
process.exit(code)
