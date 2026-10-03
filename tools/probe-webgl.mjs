// WebGL 可用性探针：headless Edge 下能否拿到 GL 上下文 + three.js UMD 能否加载
import fs from 'node:fs'
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
if (!edge) { console.error('Edge not found'); process.exit(1) }

const flagSets = [
  ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  ['--no-sandbox', '--disable-gpu'],
]
const html = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="64" height="64"></canvas>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>
<script>
window.__R = (function(){
  const c = document.getElementById('c')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const out = { gl: !!gl, three: typeof THREE, rev: (typeof THREE !== 'undefined') ? THREE.REVISION : null }
  if (gl) { const d = gl.getExtension('WEBGL_debug_renderer_info'); out.renderer = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }
  if (typeof THREE !== 'undefined') {
    try {
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: false }); r.setSize(64,64)
      const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50,1,0.1,100); cam.position.z = 3
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0.5,0.5,0, -0.5,0.5,0],3))
      const m = new THREE.ShaderMaterial({ vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=8.0;}',
        fragmentShader: 'void main(){gl_FragColor=vec4(1.0,0.9,0.0,1.0);}' })
      s.add(new THREE.Points(g, m)); r.render(s, cam)
      const px = new Uint8Array(4); gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px)
      out.shaderRendered = true; out.pixel = Array.from(px)
    } catch (e) { out.threeError = String(e && e.message || e) }
  }
  return out
})()
</script></body></html>`
fs.writeFileSync('D:/harness/work/particle-art/_probe.html', html)

for (const args of flagSets) {
  let browser
  try {
    browser = await puppeteer.launch({ executablePath: edge, headless: true, args })
    const page = await browser.newPage()
    await page.goto('file:///D:/harness/work/particle-art/_probe.html', { waitUntil: 'networkidle0', timeout: 60000 })
    const r = await page.evaluate(() => window.__R)
    console.log(JSON.stringify({ args: args.join(' '), ...r }))
  } catch (e) {
    console.log(JSON.stringify({ args: args.join(' '), error: String(e && e.message || e).slice(0, 200) }))
  } finally { if (browser) await browser.close() }
}
