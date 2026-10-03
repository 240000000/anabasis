// analyze-imgrows.mjs —— 量化「图片点云」的逐行结构：反推每个粒子对应的图片像素，
// 按行（图片 y 行）与列统计 z（深度）与 y（高度）分布，用来判断「上下两行凸出」是深度还是高度问题。
// 用法：node analyze-imgrows.mjs <art.html> <image.png>
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
const b = await puppeteer.launch({
    executablePath: edge, headless: true, protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files']
})
try {
    const p = await b.newPage()
    const errs = []
    p.on('pageerror', e => errs.push(String(e.message).slice(0, 300)))
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await p.waitForFunction('window.__DIAG__ && window.__DIAG__.formation', { timeout: 90000 })
    await (await p.$('#img-file')).uploadFile(path.resolve(img))
    await p.waitForFunction('window.__IMG_ATTR__ && window.__IMG_ATTR__.n > 0 && window.__DIAG__.imgWeight > 0.99', { timeout: 120000 })

    const r = await p.evaluate(() => {
        const A = window.__IMG_ATTR__, P = A.p
        const n = A.n, w = A.w, h = A.h, s = A.s || 15.0 / Math.max(w, h)
        const rows = new Map(), cols = new Map()
        let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, sumZ = 0
        let lumSum = 0
        for (let i = 0; i < n; i++) {
            const x = P[i * 3] / s + w / 2, y = -P[i * 3 + 1] / s + h / 2, z = P[i * 3 + 2]
            const rw = Math.min(h - 1, Math.max(0, Math.round(y))), cl = Math.min(w - 1, Math.max(0, Math.round(x)))
            if (!rows.has(rw)) rows.set(rw, { n: 0, zMin: Infinity, zMax: -Infinity, zSum: 0, yMin: Infinity, yMax: -Infinity })
            const R = rows.get(rw)
            R.n++; R.zSum += z; R.zMin = Math.min(R.zMin, z); R.zMax = Math.max(R.zMax, z)
            R.yMin = Math.min(R.yMin, P[i * 3 + 1]); R.yMax = Math.max(R.yMax, P[i * 3 + 1])
            if (!cols.has(cl)) cols.set(cl, { n: 0, zSum: 0 })
            const C = cols.get(cl); C.n++; C.zSum += z
            minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1])
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); sumZ += z
            lumSum += P[i * 3 + 2]  // 注：z 已含与亮度相关的项
        }
        const rowList = Array.from(rows.entries()).sort((a, b2) => a[0] - b2[0])
            .map(([row, R]) => [row, R.n, +R.yMin.toFixed(3), +R.yMax.toFixed(3), +(R.zSum / R.n).toFixed(3), +R.zMin.toFixed(3), +R.zMax.toFixed(3)])
        const colList = Array.from(cols.entries()).sort((a, b2) => a[0] - b2[0]).map(([c, C]) => [c, C.n, +(C.zSum / C.n).toFixed(3)])
        // 深度最极端的行
        const byAbsZ = rowList.slice().sort((a, b2) => Math.max(Math.abs(b2[5]), Math.abs(b2[6])) - Math.max(Math.abs(a[5]), Math.abs(a[6])))
        return {
            meta: { n, w, h, s, mu: A.mu, relief: A.relief, fit: A.fit, imgWeight: window.__DIAG__.imgWeight, samples: window.__DIAG__.img.samples, mode: window.__DIAG__.img.mode },
            span: { minY: +minY.toFixed(3), maxY: +maxY.toFixed(3), minZ: +minZ.toFixed(3), maxZ: +maxZ.toFixed(3), meanZ: +(sumZ / n).toFixed(3) },
            rowCount: rowList.length,
            firstRows: rowList.slice(0, 12),
            lastRows: rowList.slice(-12),
            topAbsZRows: byAbsZ.slice(0, 8),
            colCount: colList.length,
            firstCols: colList.slice(0, 6),
            lastCols: colList.slice(-6)
        }
    })
    console.log(JSON.stringify({ ...r, errs }, null, 1))
} finally { await b.close() }
