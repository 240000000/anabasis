// shot-url.mjs —— 任意 URL 的通用整页/视口截图（给发布验收用）
// 用法：node shot-url.mjs <url> <out.png> [w] [h] [full]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const puppeteer = require(process.env.PUPPETEER_CORE || [
    'C:/Users/1/.dsh/profiles/web/node_modules/puppeteer-core',
    'puppeteer-core',
].find(p => { try { require.resolve(p); return true } catch { return false } }) || 'puppeteer-core')
const edge = (process.env.EDGE_PATH ? [process.env.EDGE_PATH] : [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
]).find(fs.existsSync)

const [url, out, wArg, hArg, fullArg] = process.argv.slice(2)
if (!url || !out) { console.error('usage: node shot-url.mjs <url> <out.png> [w] [h] [full]'); process.exit(1) }
const browser = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars']
})
try {
    const page = await browser.newPage()
    await page.setViewport({ width: parseInt(wArg || '1440', 10), height: parseInt(hArg || '900', 10), deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 })
    await new Promise(r => setTimeout(r, 2500))
    await page.screenshot({ path: path.resolve(out), fullPage: fullArg === 'full' })
    console.log(JSON.stringify({ ok: true, url, out, title: await page.title() }))
} finally { await browser.close() }
