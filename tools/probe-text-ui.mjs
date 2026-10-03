// 文字 → 粒子 UI 真实交互自检：在侧栏里真的敲字、点按钮、切对齐、清空
// 用法: node probe-text-ui.mjs <art.html> <out.png> ["<文字>"] [w] [h]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const [htmlPath, outPath, text = '把文字交给粒子', wArg = '1600', hArg = '1000'] = process.argv.slice(2)
if (!htmlPath || !outPath) { console.error('usage: node probe-text-ui.mjs <art.html> <out.png> ["text"] [w] [h]'); process.exit(1) }
const VW = parseInt(wArg, 10), VH = parseInt(hArg, 10)

const puppeteer = require(process.env.PUPPETEER_CORE || 'C:/Users/1/.dsh/profiles/web/node_modules/puppeteer-core')
const edge = (process.env.EDGE_PATH ? [process.env.EDGE_PATH] : [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]).find(fs.existsSync)
if (!edge) { console.error('Edge not found'); process.exit(1) }

const abs = fs.realpathSync(htmlPath)
const url = 'file:///' + abs.replace(/\\/g, '/')
const steps = []
const browser = await puppeteer.launch({
  executablePath: edge, headless: true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars']
})
try {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)))
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 })
  await page.waitForFunction('window.__DIAG__ && window.__DIAG__.formation', { timeout: 300000 })

  const snap = async label => {
    const s = await page.evaluate(() => ({
      diag: { formation: window.__DIAG__.formation, text: window.__DIAG__.text, samples: window.__DIAG__.img && window.__DIAG__.img.samples, mode: window.__DIAG__.img && window.__DIAG__.img.mode },
      imgStatus: (document.getElementById('img-status') || {}).textContent,
      txtStatus: (document.getElementById('txt-status') || {}).textContent
    }))
    steps.push({ label, ...s })
  }
  await snap('初始')

  // 1) 侧栏真的输入文字，再点「生成粒子文字」
  await page.click('#txt-input')
  await page.type('#txt-input', text)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '生成粒子文字')
    b.click()
  })
  await page.waitForFunction('window.__DIAG__ && window.__DIAG__.text', { timeout: 120000 })
  await new Promise(r => setTimeout(r, 900))
  await snap('点击生成')

  // 2) Ctrl+Enter 直接生成（改文字后走快捷键）
  await page.click('#txt-input')
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control')
  await new Promise(r => setTimeout(r, 1200))
  await snap('Ctrl+Enter')

  // 3) 切左对齐
  await page.select('#txt-align', 'left')
  await new Promise(r => setTimeout(r, 1200))
  await snap('左对齐')

  // 4) 改起始字号滑杆（应自动重新排版）
  await page.evaluate(() => { const el = document.getElementById('txtMaxSize'); el.value = '360'; el.dispatchEvent(new Event('input')); })
  await new Promise(r => setTimeout(r, 1200))
  await snap('字号 360')

  // 5) 示例文字按钮
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '示例文字').click() })
  await new Promise(r => setTimeout(r, 1500))
  await snap('示例文字')

  // 6) 清空输入
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '清空输入').click() })
  await new Promise(r => setTimeout(r, 900))
  await snap('清空输入')

  // 回到一段居中的较长文字，出图留档
  await page.evaluate(t => {
    document.getElementById('txt-align').value = 'center';
    setTextAlign('center');
    document.getElementById('txt-input').value = t;
    generateTextFormation();
  }, text + '\n长度不限 · 中英文混排 · 自动折行缩放')
  await page.waitForFunction('window.__DIAG__ && window.__DIAG__.text && window.__DIAG__.text.lines > 1', { timeout: 120000 })
  await new Promise(r => setTimeout(r, 2600))
  await snap('出图前')

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  await page.screenshot({ path: outPath, fullPage: true })
  const diag = await page.evaluate(() => window.__DIAG__)
  console.log(JSON.stringify({ ok: errs.length === 0, out: path.resolve(outPath), bytes: fs.statSync(outPath).size, steps, diag, pageErrors: errs }, null, 1))
} finally {
  await browser.close()
}
