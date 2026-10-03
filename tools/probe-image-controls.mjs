// probe-image-controls.mjs —— 把「图片 → 粒子」面板上每个按钮/下拉都点一遍，
// 逐步记录 diag / 状态行 / 控制台异常，用于抓 onclick 拼写错或状态机死锁。
// 用法：node probe-image-controls.mjs <art.html> <image.png>
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

const [html, img] = process.argv.slice(2)
const url = 'file:///' + path.resolve(html).replace(/\\/g, '/')
const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 180000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--allow-file-access-from-files']
})
const out = { steps: [], pageErrors: [] }
try {
    const page = await browser.newPage()
    page.on('pageerror', e => out.pageErrors.push(String(e.message).slice(0, 300)))
    await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForSelector('#img-file', { timeout: 60000 })
    const input = await page.$('#img-file')
    await input.uploadFile(path.resolve(img))
    await page.waitForFunction('window.__DIAG__ && window.__DIAG__.img && window.__DIAG__.imgWeight > 0.99', { timeout: 90000 })

    const snap = async (label) => {
        const s = await page.evaluate(() => ({
            formation: window.__DIAG__.formation, imgWeight: window.__DIAG__.imgWeight,
            samples: window.__DIAG__.img ? window.__DIAG__.img.samples : null,
            mode: window.__DIAG__.img ? window.__DIAG__.img.mode : null,
            colored: window.__DIAG__.img ? window.__DIAG__.img.colored : null,
            lock: window.__DIAG__.img ? window.__DIAG__.img.lock : null,
            status: (document.getElementById('img-status') || {}).textContent
        }))
        out.steps.push({ step: label, ...s })
    }
    const click = async (sel) => { await page.click(sel); await new Promise(r => setTimeout(r, 900)) }
    const setSelect = async (v) => { await page.select('#img-mode', v); await new Promise(r => setTimeout(r, 900)) }

    await snap('upload')
    await click('#imginvert-btn'); await snap('invert:on')
    await click('#imginvert-btn'); await snap('invert:off')
    await setSelect('alpha'); await snap('mode:alpha')
    await setSelect('edge'); await snap('mode:edge')
    await setSelect('luma'); await snap('mode:luma')
    await click('#imgcolor-btn'); await snap('color:off')
    await click('#imgcolor-btn'); await snap('color:on')
    await click('#imglock-btn'); await snap('lock:on')
    await click('#imglock-btn'); await snap('lock:off')
    await page.click('button[onclick="morphToImageNow()"]'); await new Promise(r => setTimeout(r, 900)); await snap('morphToImage')
    await page.click('button[onclick="clearImage()"]'); await new Promise(r => setTimeout(r, 1200)); await snap('clear')
    // 清图后自动循环应恢复到内置四态，不该崩
    const after = await page.evaluate(() => ({ diag: window.__DIAG__, alive: !!document.querySelector('#canvas-container canvas') }))
    out.afterClear = { formation: after.diag.formation, imgWeight: after.diag.imgWeight, img: after.diag.img, alive: after.alive }
    console.log(JSON.stringify(out, null, 1))
} finally { await browser.close() }
