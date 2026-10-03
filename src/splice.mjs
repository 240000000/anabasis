// 把 _sketch.js 注入 anabasis-3d.html 的脚本位，并把 p5 CDN 换成 three.js
import fs from 'node:fs'
const [html, js] = process.argv.slice(2)
let h = fs.readFileSync(html, 'utf8')
const j = fs.readFileSync(js, 'utf8')

const s = h.lastIndexOf('<script>')
if (s < 0) throw new Error('<script> not found')
const e = h.indexOf('</script>', s)
if (e < 0) throw new Error('</script> not found')
h = h.slice(0, s) + '<script>\n' + j.trimEnd() + '\n    </script>' + h.slice(e + '</script>'.length)

h = h.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/p5\.js[^"]*"><\/script>/,
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>')

fs.writeFileSync(html, h)
console.log(JSON.stringify({ ok: true, bytes: h.length, three: /three\.min\.js/.test(h), p5left: /p5\.min\.js/.test(h), lines: h.split('\n').length }))
