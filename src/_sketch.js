// ═══════════════════════════════════════════════════════════════════════════
// 洄游 · Anabasis — 3D 可旋转粒子形态场
// 效果对标 https://endfield.hypergryph.com/#lore 的粒子场：
//   实现参考了其 bundle 中反解出的着色器结构 ——
//     vertex: vAlpha = 0.6 * alpha * distanceAlpha * (-0.25*layer + 1.25) * pointActive
//             gl_PointSize = size * pointSizeScale * distanceAlpha + 4.0
//             4 条 glitch 带：|mvPosition.y - gy| < glitchYRange 时 mvPosition.x += glitchXOffset * gx
//             形态形变：vec3 pos = mix(src, target, progress)
//     fragment: 圆形点精灵 —— center = gl_PointCoord - 0.5 / radius=0.5 / 越界 discard
//               coreRadius + featherWidth + innerGlowStrength 三段辉光
//   配色取自其 CSS：#fffa00（酸性黄）、#00ffa2（薄荷绿）、#ff1aac（品红）、#191919（底）
// ═══════════════════════════════════════════════════════════════════════════

if (typeof THREE !== 'undefined') THREE.ColorManagement.enabled = false;

// ── 参数 ───────────────────────────────────────────────────────────────────
let params = {
    seed: 52052,
    particleCount: 60000,
    pointSize: 0.05,
    morphDur: 3.6,
    dwell: 4.5,
    glitch: 0.45,
    drift: 1.0,
    rotateSpeed: 0.30,
    // ── 图片 → 粒子（第五形态：把上传的图片识别成点云）──
    imgMode: 'luma',        // luma 亮度阈值 / alpha 透明通道 / edge 边缘检测
    imgThreshold: 110,      // 识别阈值 0–255
    imgRes: 240,            // 采样精度：图片最长边缩到多少像素再采样
    imgRelief: 0.5,         // 亮度 → 深度起伏（0 = 纯薄片）
    imgFit: 0.82,           // 图片铺多大：相对默认机位可视范围的占比（1.0 = 顶满画面，上下两行必顶到边上）
    imgInvert: false,       // 反色识别（深底浅图 / 浅底深图）
    imgColor: true,         // true = 用图片自身颜色；false = 单色（用主色着色）
    imgLock: false,         // 锁定图片形态（不参与自动循环）
    // ── 文字 → 粒子（任意长度文本：自动折行 + 自动缩放字号 → 栅格化 → 复用同一套点云管线）──
    txtMaxSize: 220,        // 起始字号 px（实际字号会按文本多少自动放大/缩小到恰好铺满）
    txtRes: 900,            // 排版精度：栅格画布宽度 px（越大字形越细腻、采样池越大）
    txtLineGap: 1.16,       // 行距（相对字号）
    txtAlign: 'center',     // center 居中 / left 左对齐
    colorPalette: ['#fffa00', '#00ffa2', '#ff1aac']
};
let defaultParams = { ...params };

// 出图 / 外部控制开关（静态定格渲染用）
const SIZE = 1100;                       // 画布逻辑边长
const FIT_DIST = 17.5;                   // 默认机位距离：图片铺点的可视范围基准（fov 46° → 可见半高 ≈7.43 世界单位）
const Q = new URLSearchParams(location.search);
const FRAMES = Q.get('frames') ? parseInt(Q.get('frames'), 10) : 0;
const BARE = Q.get('bare') === '1';
const FORCE_SHAPE = Q.get('shape') !== null ? parseInt(Q.get('shape'), 10) : -1;
const FORCE_GLITCH = Q.get('glitch') === '1';
const CAM = (Q.get('cam') || '').split(',').map(Number);
const IMG_URL = Q.get('img') || '';      // 直接给图片地址（http(s) / file:// / data:），无头出图与分享链接用
if (Q.get('count')) params.particleCount = parseInt(Q.get('count'), 10);
if (Q.get('size')) params.pointSize = parseFloat(Q.get('size'));
if (Q.get('imode')) params.imgMode = Q.get('imode');
if (Q.get('thr')) params.imgThreshold = parseFloat(Q.get('thr'));
if (Q.get('res')) params.imgRes = parseInt(Q.get('res'), 10);
if (Q.get('relief')) params.imgRelief = parseFloat(Q.get('relief'));
if (Q.get('fit')) params.imgFit = parseFloat(Q.get('fit'));
if (Q.get('invert') === '1') params.imgInvert = true;
if (Q.get('imgcolor') === '0') params.imgColor = false;
if (Q.get('imglock') === '1') params.imgLock = true;
// 文字 → 粒子：?text=任意文字（长度不限）直接排版成粒子文字；?tres= 栅格宽度 / ?tmax= 起始字号 / ?talign=left
const TEXT_Q = Q.get('text') || '';
if (Q.get('tres')) params.txtRes = parseInt(Q.get('tres'), 10);
if (Q.get('tmax')) params.txtMaxSize = parseInt(Q.get('tmax'), 10);
if (Q.get('talign')) params.txtAlign = Q.get('talign');
const SRC_Q = Q.get('src');              // 原图对照卡：缺省自动（有图就显示）／?src=1 强制开／?src=0 强制关
if (BARE) {
    // 出图模式：把容器链全部钉死成 SIZE×SIZE，避免模板的 max-width:1000px + overflow:hidden 把画布右侧裁掉 100px 并露出白底
    const s = document.createElement('style');
    s.textContent = [
        'html,body{margin:0!important;padding:0!important;background:#08090a!important;overflow:hidden!important}',
        '.sidebar,.subtitle{display:none!important}',
        '.container{display:block!important;width:' + SIZE + 'px!important;height:' + SIZE + 'px!important;max-width:none!important;margin:0!important;padding:0!important;gap:0!important;background:#08090a!important;border-radius:0!important;box-shadow:none!important}',
        '.canvas-area{display:block!important;width:' + SIZE + 'px!important;height:' + SIZE + 'px!important;max-width:none!important;margin:0!important;padding:0!important;background:#08090a!important}',
        '#stage{display:block!important;width:' + SIZE + 'px!important;height:' + SIZE + 'px!important;max-width:none!important;margin:0!important;padding:0!important;gap:0!important}',
        '#compare-pane{display:none!important}',
        '#canvas-container{width:' + SIZE + 'px!important;height:' + SIZE + 'px!important;max-width:none!important;margin:0!important;padding:0!important;overflow:visible!important;background:#08090a!important;border-radius:0!important;box-shadow:none!important}',
        '#canvas-container canvas{display:block!important;width:' + SIZE + 'px!important;height:' + SIZE + 'px!important;max-width:none!important}',
        '.loading{display:none!important}'
    ].join('');
    document.head.appendChild(s);
}

const FORMATION_COUNT = 4;                                   // 内置形态数
const FORMATION_NAMES = ['鲸 · 骨架', '棱镜环', '归潮', '星壳'];
const IMG_FORMATION = 4;                                     // 第五形态「上传的图片」的权重索引
const CYCLE_GAP = 4.2;   // 故障脉冲周期（秒）

// ── 确定性随机（同种子同云图）─────────────────────────────────────────────
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function seedRng(salt) { return mulberry32((params.seed * 2654435761 + salt * 40503) >>> 0); }

// ── 三.js 设施 ─────────────────────────────────────────────────────────────
let renderer, scene, camera, points, geo, mat, uniforms, glowSprite;
let clockTime = 0;
let camAz = 0.4, camPol = 0.18, camDist = 17.5;
let camAzV = 0, camPolV = 0;
let dragging = false, lastPX = 0, lastPY = 0, autoRotate = true;
let morphIndex = 0, phase = 'dwell', phaseT = 0;
const w = new THREE.Vector4(1, 0, 0, 0);
const wTarget = new THREE.Vector4(1, 0, 0, 0);
// 五维权重 [鲸, 环, 归潮, 星壳, 图片]：前四维走 uW(vec4)，第五维走 uImgW
let curW = [1, 0, 0, 0, 0], morphFrom = [1, 0, 0, 0, 0], morphToIdx = 1, imgW = 0;
// 图片 → 粒子 状态
let imgPool = null;        // {w,h,n,px:[x,y,lum,r,g,b]*n} 采样池
let imgFormation = null;   // {pos:Float32Array(n*3), col:Float32Array(n*3)} 当前粒子数下的图片形态
let imgSource = null;      // 图片元素（改阈值/精度时重新采样用）
let imgLabel = '';
// 文字 → 粒子 状态
let textInfo = null;       // 最近一次生成的文字排版信息（有值 = 第五形态来自文字而非图片）
// 视口与原图对照卡
let viewW = SIZE, viewH = SIZE;   // 交互模式填满右侧区域（可非正方形）；出图模式恒为 SIZE×SIZE
let srcShown = SRC_Q !== '0';     // 原图对照卡是否显示
let splitView = false;            // 对比分屏（左原图 / 右粒子）
let resizeTimer = 0;
let glitchStrength = 0, lastBurstIndex = -1;
const gBands = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
let diag = {};

// ── 形态点云生成 ───────────────────────────────────────────────────────────
// 1) 鲸骨架：沿用《归潮》的 19 控制点闭合曲线，栅格化后采样内部像素，
//    再用「离轮廓的远近」决定 z 厚度 —— 边缘薄成壳、腹部鼓成体，三维可旋转后成透镜状躯体
const WHALE_CTRL = [
    [1005, 600], [930, 520], [820, 486], [680, 470], [540, 480],
    [430, 512], [372, 560], [196, 452], [286, 600], [196, 748],
    [372, 640], [452, 668], [560, 682], [690, 676], [770, 700],
    [812, 776], [856, 662], [930, 644], [990, 620]
];
function catmullPath(P, seg) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
        const p0 = P[(i - 1 + P.length) % P.length], p1 = P[i], p2 = P[(i + 1) % P.length], p3 = P[(i + 2) % P.length];
        for (let s = 0; s < seg; s++) {
            const t = s / seg, t2 = t * t, t3 = t2 * t;
            out.push([
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            ]);
        }
    }
    return out;
}
function makeCanvas(w_, h_) { const c = document.createElement('canvas'); c.width = w_; c.height = h_; return c; }

function sampleAlpha(canvas, step, want, rng, mapper) {
    const ctx = canvas.getContext('2d');
    const { width: W, height: H } = canvas;
    const img = ctx.getImageData(0, 0, W, H).data;
    const pool = [];
    for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
            const a = img[4 * (y * W + x) + 3];
            if (a > 128) pool.push(x, y, a);
        }
    }
    const n = pool.length / 3;
    const arr = new Float32Array(want * 3);
    for (let i = 0; i < want; i++) {
        const k = (n > 0 ? Math.floor(rng() * n) : 0) * 3;
        const p = mapper(n > 0 ? pool[k] : 0, n > 0 ? pool[k + 1] : 0, n > 0 ? pool[k + 2] : 255, rng, canvas);
        arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2];
    }
    return arr;
}

function buildWhale(count, rng) {
    const W = 1200, H = 1200, path = catmullPath(WHALE_CTRL, 18);
    const fill = makeCanvas(W, H), fc = fill.getContext('2d');
    fc.fillStyle = '#fff'; fc.beginPath();
    path.forEach((p, i) => i ? fc.lineTo(p[0], p[1]) : fc.moveTo(p[0], p[1]));
    fc.closePath(); fc.fill();
    // 边缘掩膜：粗描轮廓，用来判定"离边缘多近"
    const edge = makeCanvas(W, H), ec = edge.getContext('2d');
    ec.strokeStyle = '#fff'; ec.lineWidth = 46; ec.lineJoin = 'round'; ec.beginPath();
    path.forEach((p, i) => i ? ec.lineTo(p[0], p[1]) : ec.moveTo(p[0], p[1]));
    ec.closePath(); ec.stroke();
    const eimg = ec.getImageData(0, 0, W, H).data;
    const S = 17.0 / 1200;   // 像素 → 世界单位
    return sampleAlpha(fill, 4, count, rng, (x, y, a, r) => {
        const nearEdge = eimg[4 * (y * W + x) + 3] > 128;
        const zAmp = nearEdge ? 0.22 : (0.55 + r() * 1.75);
        const z = (r() * 2 - 1) * zAmp;
        return [(x - 600) * S, -(y - 600) * S, z];
    });
}

// 2) 棱镜环：三只互相倾斜的环 + 中轴脊柱 —— 任意角度都能读出体积
function buildRing(count, rng) {
    const arr = new Float32Array(count * 3);
    const R = [6.4, 5.3, 3.9], tilt = [[0, 0], [1.15, 0.2], [0.42, 1.25]];
    for (let i = 0; i < count; i++) {
        let x, y, z;
        if (i % 11 === 10) {                        // 中轴脊柱
            const t = rng() * 2 - 1;
            x = (rng() - 0.5) * 0.5; y = (rng() - 0.5) * 0.5; z = t * 7.4;
        } else {
            const k = i % 3, a = rng() * Math.PI * 2, rr = R[k] + (rng() - 0.5) * 0.55;
            const bx = Math.cos(a) * rr, by = Math.sin(a) * rr, bz = (rng() - 0.5) * 0.42;
            const [tx, ty] = tilt[k];
            // rotX(tx) 后 rotY(ty)
            let y1 = by * Math.cos(tx) - bz * Math.sin(tx), z1 = by * Math.sin(tx) + bz * Math.cos(tx);
            x = bx * Math.cos(ty) + z1 * Math.sin(ty); y = y1; z = -bx * Math.sin(ty) + z1 * Math.cos(ty);
        }
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    return arr;
}

// 3) 归潮（粒子图片）：离屏画布写汉字，取字形像素 → 薄片点云（可旋转的"粒子图片"）
function buildWord(count, rng) {
    const W = 1200, H = 1200, cv = makeCanvas(W, H), c = cv.getContext('2d');
    c.fillStyle = '#fff';
    c.font = '900 470px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('归潮', W / 2, H / 2 + 18);
    const S = 15.4 / 1200;
    return sampleAlpha(cv, 4, count, rng, (x, y, a, r) => [
        (x - W / 2) * S, -(y - H / 2) * S, (r() * 2 - 1) * 0.34
    ]);
}

// 4) 星壳：斐波那契球壳 + 纬度带明暗
function buildShell(count, rng) {
    const arr = new Float32Array(count * 3), R = 6.6, GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GA;
        const rr = R + (rng() - 0.5) * 0.75;
        arr[i * 3] = Math.cos(th) * r * rr;
        arr[i * 3 + 1] = y * rr;
        arr[i * 3 + 2] = Math.sin(th) * r * rr;
    }
    return arr;
}

// ── 着色器（结构对标参考站）───────────────────────────────────────────────
const VERT = `
uniform vec4 uW;                 // 前四个形态的权重（形变 = 权重插值）
uniform float uImgW;             // 第五形态「上传并识别出来的图片」的权重
uniform vec3 uC0, uC1, uC2, uC3, uC4; // 每个形态的状态色（uC4 = 图片形态的着色倍率）
uniform float uTime, uSize, uPointScale, uDrift, uScatter, uActive, uFlicker;
uniform float uFadeStart, uFadeDistance;
uniform vec4 uG0, uG1, uG2, uG3; // 4 条故障带：xy = (y0,x0)，zw = (y1,x1)
uniform float uGlitchYRange, uGlitchXOffset, uGlitchStrength;
attribute vec3 aP1, aP2, aP3;
attribute vec3 aImgP, aImgC;     // 图片形态：世界坐标 + 取样到的像素色
attribute vec4 aRnd;             // x 相位 / y 尺寸·色差 / z 层级 / w 活性
varying float vAlpha;
varying vec3 vColor;
varying float vDistanceAlpha;
varying float vG;

void glitchBand(inout vec4 mvPos, vec4 band) {
    float gy0 = band.x, gx0 = band.y, gy1 = band.z, gx1 = band.w;
    float sy = mvPos.y;                     // 屏幕空间 y 坐标
    if (abs(sy - gy0) < uGlitchYRange) { mvPos.x += uGlitchXOffset * gx0; }
    if (abs(sy - gy1) < uGlitchYRange) { mvPos.x += uGlitchXOffset * gx1; }
}

void main() {
    vec4 wgt = uW;
    float iw = uImgW;                        // 图片形态权重（无图时为 0）
    vec3 pos = position * wgt.x + aP1 * wgt.y + aP2 * wgt.z + aP3 * wgt.w + aImgP * iw;
    vec3 col = uC0 * wgt.x + uC1 * wgt.y + uC2 * wgt.z + uC3 * wgt.w + aImgC * uC4 * iw;

    // 权重"尖度"：1 = 完全落定，越小 = 多态混合 → 形变途中向外炸开
    float spike = dot(wgt, wgt) + iw * iw;
    float scatter = 1.0 - clamp((spike - 0.5) / 0.5, 0.0, 1.0);

    float ph = aRnd.x * 6.2831853;
    pos.x += sin(uTime * 0.63 + ph) * 0.46 * uDrift;
    pos.y += cos(uTime * 0.57 + ph * 1.7) * 0.46 * uDrift;
    pos.z += sin(uTime * 0.49 + ph * 2.3) * 0.46 * uDrift;

    vec3 dir = normalize(vec3(aRnd.x - 0.5, aRnd.y - 0.5, aRnd.z - 0.5) + 1e-4);
    // 炸开位移必须留在取景内：云半径约 7、相机 18 处可见半高约 8.6 个世界单位，故取 1.0–4.0
    pos += dir * scatter * uScatter * (0.5 + 1.5 * aRnd.w);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float viewZ = -mvPosition.z;
    float distanceAlpha = 1.0 - clamp((viewZ - uFadeStart) / max(uFadeDistance - uFadeStart, 0.001), 0.0, 1.0);

    glitchBand(mvPosition, uG0);
    glitchBand(mvPosition, uG1);
    glitchBand(mvPosition, uG2);
    glitchBand(mvPosition, uG3);

    vAlpha = uActive * distanceAlpha * (-0.25 * aRnd.z + 1.25) * (0.35 + 0.65 * aRnd.w) * (1.0 + uFlicker * (aRnd.y - 0.5));
    vDistanceAlpha = distanceAlpha;
    vColor = col * (0.82 + 0.4 * aRnd.y);
    vG = uGlitchStrength;

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(uSize * uPointScale / max(viewZ, 0.1) * (0.55 + 0.9 * aRnd.y) + uSize * uPointScale / 220.0 + 1.6, 1.0, 64.0);
}`;

const FRAG = `
precision highp float;
uniform float uCoreRadius, uFeather, uInnerGlow;
uniform vec3 uGlitchTint;
varying float vAlpha;
varying vec3 vColor;
varying float vDistanceAlpha;
varying float vG;

void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    float radius = 0.5;
    if (dist > radius) { discard; }                       // 圆形点精灵

    float feather = 1.0 - smoothstep(uCoreRadius * vDistanceAlpha, 0.5, dist);
    float core = 1.0 - smoothstep(0.0, max(uCoreRadius * (0.30 + 0.70 * vDistanceAlpha), 0.02), dist);
    float a = vAlpha * (feather * 0.55 + core * uInnerGlow);

    vec3 c = mix(vColor, uGlitchTint, vG * 0.55) * (1.0 + 0.6 * vG);   // 故障带整体染色增亮
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;

function colors() {
    const p = params.colorPalette;
    uniforms.uC0.value.set(p[0]);
    uniforms.uC1.value.set(p[1]);
    uniforms.uC2.value.copy(uniforms.uC0.value).lerp(uniforms.uC1.value, 0.45);  // 归潮：黄绿过渡
    uniforms.uC3.value.set(p[2]);
    // 图片形态着色倍率：显原色 → 白（不改动图片颜色）；单色 → 用主色给图片染色
    if (uniforms.uC4) uniforms.uC4.value.set(params.imgColor ? 0xffffff : p[0]);
}

// ── 视口尺寸：交互模式把画布铺满右侧整块区域（宽高各算，非正方形）────────────
// 出图模式（?frames= / ?bare=1）恒为 SIZE×SIZE —— 历史出图与验收数字保持可复现
function sizeToArea(first) {
    if (!renderer) return;
    if (BARE || FRAMES > 0) {
        viewW = SIZE; viewH = SIZE;
    } else {
        const host = document.getElementById('canvas-container');
        const r = host ? host.getBoundingClientRect() : null;
        viewW = Math.max(320, Math.round((r && r.width) || SIZE));
        viewH = Math.max(280, Math.round((r && r.height) || SIZE));
    }
    renderer.setSize(viewW, viewH, false);
    if (camera) { camera.aspect = viewW / viewH; camera.updateProjectionMatrix(); }
    if (uniforms) uniforms.uPointScale.value = viewH / 2;   // 点精灵像素尺寸随视口高度（原为 SIZE/2）
    if (!first && imgPool && imgFormation) {                // 视口变了：图片重新铺点，继续贴合可视范围
        assignImage(params.particleCount >>> 0);
        applyImageFormation();
    }
}
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeToArea(false); reportImage(); }, 140);
});

// ── 初始化 ─────────────────────────────────────────────────────────────────
function initThree() {
    const host = document.getElementById('canvas-container');
    const old = host.querySelector('canvas'); if (old) old.remove();
    renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: false, preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x08090a, 1);
    const cv = renderer.domElement;
    cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';
    cv.style.borderRadius = '12px'; cv.style.cursor = 'grab';
    host.appendChild(cv);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);

    // 背景辉光（柔光晕，衬出粒子云）
    const gc = makeCanvas(256, 256), gx = gc.getContext('2d');
    const gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,250,0,0.55)');
    gr.addColorStop(0.35, 'rgba(0,255,162,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
    glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending,
        depthTest: false, depthWrite: false, transparent: true, opacity: 0.5
    }));
    glowSprite.scale.set(46, 46, 1); glowSprite.position.set(0, 0, -34);
    scene.add(glowSprite);

    uniforms = {
        uW: { value: w },
        uC0: { value: new THREE.Color('#fffa00') }, uC1: { value: new THREE.Color('#00ffa2') },
        uC2: { value: new THREE.Color('#fffa00') }, uC3: { value: new THREE.Color('#ff1aac') },
        uC4: { value: new THREE.Color('#ffffff') },
        uImgW: { value: 0 },
        uTime: { value: 0 }, uSize: { value: params.pointSize }, uPointScale: { value: SIZE / 2 },
        uDrift: { value: params.drift }, uScatter: { value: 2.0 }, uActive: { value: 1.0 },
        uFlicker: { value: 0.55 },
        uFadeStart: { value: 13.0 }, uFadeDistance: { value: 31.0 },
        uG0: { value: gBands[0] }, uG1: { value: gBands[1] }, uG2: { value: gBands[2] }, uG3: { value: gBands[3] },
        uGlitchYRange: { value: 10.0 }, uGlitchXOffset: { value: 0.55 }, uGlitchStrength: { value: 0 },
        uCoreRadius: { value: 0.22 }, uFeather: { value: 1.0 }, uInnerGlow: { value: 0.95 },
        uGlitchTint: { value: new THREE.Color('#ff1aac') }
    };
    mat = new THREE.ShaderMaterial({
        uniforms, vertexShader: VERT, fragmentShader: FRAG,
        blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false
    });
    buildCloud();
    bindPointer(cv);
    colors();
}

function buildCloud() {
    const n = params.particleCount >>> 0;
    const r1 = seedRng(11), r2 = seedRng(22), r3 = seedRng(33), r4 = seedRng(44), rr = seedRng(77);
    const p0 = buildWhale(n, r1), p1 = buildRing(n, r2), p2 = buildWord(n, r3), p3 = buildShell(n, r4);
    const rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
        rnd[i * 4] = rr();                 // 相位
        rnd[i * 4 + 1] = rr();             // 尺寸 / 色差
        rnd[i * 4 + 2] = rr();             // 层级（-0.25*layer+1.25）
        rnd[i * 4 + 3] = 0.55 + rr() * 0.45; // 活性
    }
    if (geo) geo.dispose();
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
    geo.setAttribute('aP1', new THREE.BufferAttribute(p1, 3));
    geo.setAttribute('aP2', new THREE.BufferAttribute(p2, 3));
    geo.setAttribute('aP3', new THREE.BufferAttribute(p3, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    // 第五形态（图片）：有图就按当前粒子数重新铺一遍，无图给零数组（着色器里 iw=0 不参与）
    if (imgPool) assignImage(n);
    geo.setAttribute('aImgP', new THREE.BufferAttribute(imgFormation ? imgFormation.pos : new Float32Array(n * 3), 3));
    geo.setAttribute('aImgC', new THREE.BufferAttribute(imgFormation ? imgFormation.col : new Float32Array(n * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);
    if (points) { scene.remove(points); points.geometry.dispose(); }
    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    diag.points = n;
}

// ── 状态推进 ───────────────────────────────────────────────────────────────
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = t => t * t * (3 - 2 * t);

function step(dt) {
    clockTime += dt;
    const NC = formCount();
    if (FORCE_SHAPE >= 0) {
        // 出图：锁定在指定形态（索引 4 = 上传并识别出来的图片）
        morphIndex = ((FORCE_SHAPE % NC) + NC) % NC;
        morphToIdx = morphIndex; phase = 'dwell'; phaseT = 0; curW = oneHot(morphIndex);
    } else if (params.imgLock && imgFormation) {
        morphIndex = IMG_FORMATION; morphToIdx = IMG_FORMATION; phase = 'dwell'; phaseT = 0; curW = oneHot(IMG_FORMATION);
    } else {
        phaseT += dt;
        if (phase === 'dwell') {
            if (phaseT >= params.dwell) morphTo((morphIndex + 1) % NC);
        } else if (phaseT >= params.morphDur) {
            morphIndex = morphToIdx; morphToIdx = morphIndex; phase = 'dwell'; phaseT = 0; curW = oneHot(morphIndex);
        }
        if (phase === 'morph') {
            // 多态插值：形变起点那套权重整体淡出，目标形态整体淡入（支持任意形态互形变，含图片形态）
            const t = smooth(Math.min(1, phaseT / params.morphDur));
            const wv = [0, 0, 0, 0, 0];
            for (let i = 0; i < 5; i++) wv[i] = morphFrom[i] * (1 - t) + (i === morphToIdx ? t : 0);
            curW = wv;
        }
    }
    w.set(curW[0], curW[1], curW[2], curW[3]);
    imgW = curW[IMG_FORMATION];
    wTarget.set(w.x, w.y, w.z, w.w);
    uniforms.uImgW.value = imgW;

    // 故障脉冲：按 clockTime 周期确定性触发（同帧号同画面）
    if (FORCE_GLITCH) {
        const r = mulberry32((params.seed * 7919 + 12345) >>> 0);
        for (let i = 0; i < 4; i++) gBands[i].set(r() * 14 - 7, r() * 2 - 1, r() * 14 - 7, r() * 2 - 1);
        glitchStrength = 1;
    } else {
        const bi = Math.floor(clockTime / CYCLE_GAP);
        if (bi !== lastBurstIndex) {
            lastBurstIndex = bi;
            const r = mulberry32((params.seed * 7919 + bi * 104729) >>> 0);
            for (let i = 0; i < 4; i++) gBands[i].set(r() * 14 - 7, r() * 2 - 1, r() * 14 - 7, r() * 2 - 1);
            glitchStrength = 1;
        }
        glitchStrength = Math.max(0, glitchStrength - dt * (1.6 / Math.max(0.15, 0.30 * params.glitch)));
    }

    // 相机：自动旋转 + 拖拽惯性
    if (autoRotate && !dragging) camAz += params.rotateSpeed * dt;
    camAz += camAzV * dt; camPol += camPolV * dt;
    camAzV *= Math.pow(0.03, dt); camPolV *= Math.pow(0.03, dt);
    camPol = Math.max(-1.35, Math.min(1.35, camPol));

    uniforms.uTime.value = clockTime;
    uniforms.uDrift.value = params.drift;
    uniforms.uSize.value = params.pointSize;
    uniforms.uGlitchStrength.value = glitchStrength * params.glitch;
    uniforms.uG0.value.copy(gBands[0]); uniforms.uG1.value.copy(gBands[1]);
    uniforms.uG2.value.copy(gBands[2]); uniforms.uG3.value.copy(gBands[3]);
    uniforms.uActive.value = 1.0;

    const cp = Math.cos(camPol), sp = Math.sin(camPol);
    camera.position.set(Math.sin(camAz) * cp * camDist, sp * camDist + 0.6, Math.cos(camAz) * cp * camDist);
    camera.lookAt(0, 0, 0);

    diag = {
        points: params.particleCount, time: +clockTime.toFixed(2), phase,
        weights: [+w.x.toFixed(3), +w.y.toFixed(3), +w.z.toFixed(3), +w.w.toFixed(3)],
        imgWeight: +imgW.toFixed(3),
        img: imgPool ? {
            label: imgLabel, mode: params.imgMode, thr: params.imgThreshold, invert: params.imgInvert,
            res: [imgPool.w, imgPool.h], samples: imgPool.n, colored: params.imgColor, lock: params.imgLock
        } : null,
        text: textInfo ? {
            chars: textInfo.chars, glyphs: textInfo.glyphs, lines: textInfo.lines,
            size: textInfo.size, res: [textInfo.w, textInfo.h], align: params.txtAlign
        } : null,
        formation: formLabel(),
        glitch: +glitchStrength.toFixed(3), cam: { az: +camAz.toFixed(3), pol: +camPol.toFixed(3), dist: camDist },
        autoRotate
    };
    window.__DIAG__ = diag;
}

function render() { renderer.render(scene, camera); }

// ── 交互 ───────────────────────────────────────────────────────────────────
function bindPointer(cv) {
    cv.addEventListener('pointerdown', e => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', e => {
        if (!dragging) return;
        camAz -= (e.clientX - lastPX) * 0.006; camPol += (e.clientY - lastPY) * 0.006;
        camAzV = -(e.clientX - lastPX) * 0.006 * 8; camPolV = (e.clientY - lastPY) * 0.006 * 8;
        lastPX = e.clientX; lastPY = e.clientY;
    });
    const up = e => { dragging = false; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); camDist = Math.max(7, Math.min(46, camDist * Math.exp(e.deltaY * 0.0009))); }, { passive: false });
    cv.addEventListener('dblclick', () => { lastBurstIndex = Math.floor(clockTime / CYCLE_GAP); glitchStrength = 1; burstRound = 0; });
}
let burstRound = 0;

// ── 图片 → 粒子：识别上传的图片，铺成第五形态的点云 ──────────────────────────
function formCount() { return imgFormation ? FORMATION_COUNT + 1 : FORMATION_COUNT; }
function oneHot(k) { const v = [0, 0, 0, 0, 0]; v[k] = 1; return v; }
function morphTo(idx) { morphFrom = curW.slice(); morphToIdx = idx; phase = 'morph'; phaseT = 0; }
function formName(i) { return i === IMG_FORMATION ? ((textInfo ? '' : '图片 · ') + (imgLabel || '未载入')) : FORMATION_NAMES[i]; }
function formLabel() { return phase === 'dwell' ? formName(morphIndex) : formName(morphIndex) + ' → ' + formName(morphToIdx); }
function setImgStatus(t) { const el = document.getElementById('img-status'); if (el) el.textContent = t; }

// 1) 识别：按 imgMode / imgThreshold / imgRes 把图片采样成候选点池（与粒子数无关，可复用）
function buildImagePool(imgEl) {
    const iw = imgEl.naturalWidth || imgEl.width, ih = imgEl.naturalHeight || imgEl.height;
    if (!iw || !ih) { imgPool = null; return; }
    // 文字形态自带采样精度（_poolRes = 排版栅格宽度，字形需要高分辨率才锐），图片才用滑杆 imgRes
    const maxSide = Math.max(32, Math.min(1024, ((imgEl && imgEl._poolRes) || params.imgRes) | 0));
    let W, H;
    if (iw >= ih) { W = maxSide; H = Math.max(8, Math.round(maxSide * ih / iw)); }
    else { H = maxSide; W = Math.max(8, Math.round(maxSide * iw / ih)); }
    const cv = makeCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.clearRect(0, 0, W, H);
    cx.drawImage(imgEl, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;
    const N = W * H, L = new Float32Array(N), A = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        A[i] = d[i * 4 + 3] / 255;
    }
    const thr = Math.max(1, Math.min(255, params.imgThreshold));
    const inv = !!params.imgInvert;
    const px = [];
    if (params.imgMode === 'edge') {
        // Sobel 梯度幅值（/4 归一到 0..~360）：照片与线稿都靠它取轮廓
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                const i = y * W + x;
                if (A[i] < 0.05) continue;
                const gx = (L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - 1] + L[i + W - 1]);
                const gy = (L[i + W - 1] + 2 * L[i + W] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - W] + L[i - W + 1]);
                // 亮度已归一到 0..1，×63.75 把 Sobel 幅值拉到 0..360（和 0–255 的阈值同一量纲）
                let m = Math.sqrt(gx * gx + gy * gy) * 63.75;
                if (inv) m = 360 - m;
                if (m >= thr) px.push(x, y, L[i], d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255);
            }
        }
    } else {
        for (let i = 0; i < N; i++) {
            let v = params.imgMode === 'alpha' ? A[i] : L[i];
            if (inv) v = 1 - v;
            if (v * 255 >= thr && A[i] > 0.02) {
                px.push(i % W, (i / W) | 0, L[i], d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255);
            }
        }
    }
    let lsum = 0;
    for (let i = 2; i < px.length; i += 6) lsum += px[i];
    const mu = px.length ? lsum / (px.length / 6) : 0.5;   // 入选点平均亮度：浮雕以此为 0 基准，避免整片云前后偏移
    imgPool = { w: W, h: H, n: px.length / 6, px: Float32Array.from(px), mu };
}

// 2) 铺点：候选点池 → n 个粒子的目标坐标与颜色（种子化洗牌，粒子多于样本时叠抖动）
function assignImage(n) {
    if (!imgPool || !imgPool.n) { imgFormation = null; return; }
    const pool = imgPool, m = pool.n;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const rng = seedRng(55);
    const idx = new Uint32Array(m);
    for (let i = 0; i < m; i++) idx[i] = i;
    for (let i = m - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    // 铺多大由可视范围决定并留边距：旧版固定 15 个世界单位 ≈ 整幅可视高（14.86 单位）→ 上下两行顶到画面上下边缘外
    const halfH = Math.tan(((camera ? camera.fov : 46) * Math.PI) / 360) * FIT_DIST;
    const halfW = halfH * (camera ? camera.aspect : 1);
    const fit = Math.max(0.3, Math.min(1.4, params.imgFit || 0.82));
    const s = fit * Math.min((2 * halfH) / pool.h, (2 * halfW) / pool.w);
    const mu = pool.mu === undefined ? 0.5 : pool.mu;
    for (let i = 0; i < n; i++) {
        const k = idx[i % m] * 6, extra = i >= m;
        const jx = extra ? (rng() - 0.5) * s * 1.7 : 0, jy = extra ? (rng() - 0.5) * s * 1.7 : 0;
        pos[i * 3] = (pool.px[k] + jx - pool.w / 2) * s;
        pos[i * 3 + 1] = -(pool.px[k + 1] + jy - pool.h / 2) * s;
        pos[i * 3 + 2] = (pool.px[k + 2] - mu) * params.imgRelief * 2 + (rng() - 0.5) * 0.16;
        if (params.imgColor) {
            col[i * 3] = Math.min(1, pool.px[k + 3] * 1.18);
            col[i * 3 + 1] = Math.min(1, pool.px[k + 4] * 1.18);
            col[i * 3 + 2] = Math.min(1, pool.px[k + 5] * 1.18);
        } else {
            const g = 0.5 + 0.5 * pool.px[k + 2];     // 单色：亮度当灰度，颜色交给 uC4（主色）
            col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = g;
        }
    }
    imgFormation = { pos, col, s };
}

function applyImageFormation() {
    if (!geo) return;
    const n = params.particleCount >>> 0;
    if (imgPool) assignImage(n);
    geo.setAttribute('aImgP', new THREE.BufferAttribute(imgFormation ? imgFormation.pos : new Float32Array(n * 3), 3));
    geo.setAttribute('aImgC', new THREE.BufferAttribute(imgFormation ? imgFormation.col : new Float32Array(n * 3), 3));
    // 调试把手：外部脚本可直接读图片形态的点位/颜色（排查「哪一行凸出来」这类几何问题）
    window.__IMG_ATTR__ = {
        p: geo.attributes.aImgP.array, c: geo.attributes.aImgC.array,
        n, w: imgPool ? imgPool.w : 0, h: imgPool ? imgPool.h : 0,
        s: imgFormation ? imgFormation.s : 0,
        mu: imgPool ? imgPool.mu : 0.5, relief: params.imgRelief, fit: params.imgFit
    };
}

// ── 原图对照卡（右上角浮层）：显示上传的原图，可放大与粒子图 A/B 对照 ──────────
function updateSrcCard() {
    const card = document.getElementById('src-card');
    const pane = document.getElementById('compare-pane');
    const usable = !!(imgSource && imgSource.src) && !BARE;
    if (pane) {                                   // 分屏左半的原图跟着换图
        const pim = document.getElementById('pane-img');
        if (pim && usable && pim.getAttribute('src') !== imgSource.src) pim.setAttribute('src', imgSource.src);
    }
    if (!card) return;
    const showCard = usable && srcShown && !splitView;   // 分屏时左半已经在显示原图，右上小卡自动收起
    card.style.display = showCard ? 'block' : 'none';
    if (!usable) return;
    const im = document.getElementById('src-img');
    if (im && im.getAttribute('src') !== imgSource.src) im.setAttribute('src', imgSource.src);
    const cap = document.getElementById('src-cap');
    if (cap) {
        const nat = (imgSource.naturalWidth || 0) + '×' + (imgSource.naturalHeight || 0);
        cap.textContent = (imgLabel || 'image') + ' · 原图 ' + nat
            + (imgPool ? ' · 采样 ' + imgPool.w + '×' + imgPool.h + ' → ' + imgPool.n + ' 点' : '');
    }
}
function toggleSrcCard(btn) {
    srcShown = !srcShown;
    if (btn) btn.textContent = '显示原图：' + (srcShown ? '开' : '关');
    updateSrcCard();
}
function toggleSrcBig(btn) {
    const card = document.getElementById('src-card');
    if (!card) return;
    const big = card.classList.toggle('big');
    if (btn) btn.textContent = big ? '缩小' : '放大';
    updateSrcCard();
}
function hideSrcCard() {
    srcShown = false;
    const b = document.getElementById('imgsrc-btn');
    if (b) b.textContent = '显示原图：关';
    updateSrcCard();
}
// 对比分屏：左半显示原图、右半是粒子画布 —— 宽屏时把右侧空间用满
function toggleSplit(btn) {
    if (!imgSource) { setImgStatus('先上传一张图片，再开对比分屏'); return; }
    splitView = !splitView;
    const area = document.querySelector('.canvas-area');
    if (area) area.classList.toggle('split', splitView);
    if (btn) btn.textContent = '对比分屏：' + (splitView ? '开' : '关');
    sizeToArea(false);
    updateSrcCard();
}

function reportImage() {
    updateSrcCard();
    const kind = textInfo ? '文字' : '图片';
    if (!imgPool) { setImgStatus(imgSource ? (kind + '：识别出 0 个点，阈值太高或模式不匹配，换个模式试试') : '未加载图片'); return; }
    const modeName = { luma: '亮度阈值', alpha: '透明通道', edge: '边缘检测' }[params.imgMode] || params.imgMode;
    const cover = imgPool.n >= params.particleCount ? '1:1' : (params.particleCount / Math.max(1, imgPool.n)).toFixed(1) + ':1';
    setImgStatus(kind + '：' + (imgLabel || 'image') + ' · 识别 ' + imgPool.w + '×' + imgPool.h + ' → ' + imgPool.n + ' 个点 · '
        + modeName + ' / 阈值 ' + params.imgThreshold + (params.imgInvert ? ' / 反色' : '')
        + ' · ' + (params.imgColor ? '原色' : '单色') + (params.imgLock ? ' · 已锁定' : '')
        + ' · 尺寸 ' + (params.imgFit || 0.82).toFixed(2) + ' / 浮雕 ' + params.imgRelief.toFixed(2)
        + ' · 粒子覆盖 ' + cover);
    if (textInfo) {
        setTxtStatus('文字 ' + textInfo.chars + ' 字 → ' + textInfo.lines + ' 行 · 字号 ' + textInfo.size + 'px · 栅格 '
            + textInfo.w + '×' + textInfo.h + ' → ' + imgPool.n + ' 个点 · 粒子覆盖 ' + cover
            + (params.imgLock ? ' · 已锁定' : ''));
    }
}

function onImageReady(im) {
    imgSource = im;
    buildImagePool(im);
    applyImageFormation();
    srcShown = true;                             // 新图进来 → 原图对照卡自动出现
    const sbtn = document.getElementById('imgsrc-btn');
    if (sbtn) sbtn.textContent = '显示原图：开';
    if (!imgPool || !imgPool.n) { reportImage(); return; }
    // 上传即锁定：刚识别出来的图片形态不该被自动循环在几秒后带走（想继续循环点「锁定图片形态」解锁）
    params.imgLock = true;
    const lbtn = document.getElementById('imglock-btn');
    if (lbtn) lbtn.textContent = '锁定图片形态：开';
    reportImage();
    if (FORCE_SHAPE < 0) morphTo(IMG_FORMATION);   // 传完立刻长出来
}

function loadImageURL(url) {
    return new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => { onImageReady(im); res(im); };
        im.onerror = () => rej(new Error('图片加载失败：' + String(url).slice(0, 96)));
        im.src = url;
    });
}

function handleImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { setImgStatus('不是图片文件：' + (file.type || '未知类型')); return; }
    imgLabel = file.name || 'image';
    const fr = new FileReader();
    fr.onload = () => loadImageURL(fr.result).catch(e => setImgStatus(e.message));
    fr.onerror = () => setImgStatus('读取文件失败');
    fr.readAsDataURL(file);
}

function morphToImageNow() {
    if (!imgFormation) { setImgStatus(textInfo ? '先生成一段文字粒子（侧栏「文字 → 粒子」）' : '先上传一张图片（也可以把图直接拖到画布上 / Ctrl+V 粘贴）'); return; }
    if (FORCE_SHAPE >= 0) return;
    if (curW[IMG_FORMATION] > 0.995) {          // 已经在图片形态：不重复形变（避免「图片 → 图片」空转），只把标签摆正
        morphIndex = IMG_FORMATION; morphToIdx = IMG_FORMATION; phase = 'dwell'; phaseT = 0; curW = oneHot(IMG_FORMATION);
        reportImage(); return;
    }
    morphTo(IMG_FORMATION);
}
function clearImage() {
    imgPool = null; imgFormation = null; imgSource = null; imgLabel = '';
    textInfo = null;                            // 文字与图片共用第五形态：清图同时清掉文字标记
    params.imgLock = false;                     // 清图同时解锁，避免按钮停在「开」但已无图可锁
    const lb = document.getElementById('imglock-btn');
    if (lb) lb.textContent = '锁定图片形态：关';
    if (geo) {
        const n = params.particleCount >>> 0;
        geo.setAttribute('aImgP', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute('aImgC', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    }
    imgW = 0; uniforms.uImgW.value = 0;
    morphIndex = Math.min(morphIndex, FORMATION_COUNT - 1);
    morphToIdx = morphIndex; phase = 'dwell'; phaseT = 0; curW = oneHot(morphIndex);
    if (splitView) {                                 // 清图时关掉分屏，画布收回整个右区
        splitView = false;
        const area = document.querySelector('.canvas-area');
        if (area) area.classList.remove('split');
        const sb = document.getElementById('split-btn');
        if (sb) sb.textContent = '对比分屏：关';
        sizeToArea(false);
    }
    setImgStatus('已清除图片');
    updateSrcCard();
}
function toggleImageLock(btn) {
    params.imgLock = !params.imgLock;
    if (btn) btn.textContent = '锁定图片形态：' + (params.imgLock ? '开' : '关');
    if (params.imgLock && imgFormation && FORCE_SHAPE < 0) morphTo(IMG_FORMATION);
    reportImage();
}
function toggleImageInvert(btn) {
    params.imgInvert = !params.imgInvert;
    if (btn) btn.textContent = '反色：' + (params.imgInvert ? '开' : '关');
    if (imgSource) { buildImagePool(imgSource); applyImageFormation(); }
    reportImage();
}
function toggleImageColor(btn) {
    params.imgColor = !params.imgColor;
    if (btn) btn.textContent = '图片原色：' + (params.imgColor ? '开' : '关');
    colors(); applyImageFormation();
    reportImage();
}
function setImageMode(v) {
    params.imgMode = v;
    if (imgSource) { buildImagePool(imgSource); applyImageFormation(); }
    reportImage();
}
// 3) 三种投喂方式：选文件 / 拖到画布上 / Ctrl+V 粘贴
function bindImageDrop() {
    const host = document.getElementById('canvas-container'); if (!host) return;
    const on = e => { e.preventDefault(); e.stopPropagation(); host.style.outline = '2px dashed rgba(217,119,87,.85)'; host.style.outlineOffset = '-4px'; };
    const off = e => { if (e) e.preventDefault(); host.style.outline = 'none'; };
    ['dragenter', 'dragover'].forEach(ev => host.addEventListener(ev, on));
    ['dragleave', 'drop'].forEach(ev => host.addEventListener(ev, off));
    host.addEventListener('drop', e => {
        const dt = e.dataTransfer; if (!dt) return;
        const f = dt.files && dt.files[0];
        if (f) { handleImageFile(f); return; }
        const u = dt.getData && dt.getData('text/uri-list');
        if (u) { imgLabel = 'url-image'; loadImageURL(u.trim()).catch(err => setImgStatus(err.message)); }
    });
    window.addEventListener('paste', e => {
        const items = e.clipboardData && e.clipboardData.items; if (!items) return;
        for (const it of items) {
            if (it.type && it.type.indexOf('image') === 0) {
                const f = it.getAsFile();
                if (f) { imgLabel = 'clipboard.png'; handleImageFile(f); return; }
            }
        }
    });
}

// ── 文字 → 粒子：任意长度文本 → 自动折行 / 自动字号 → 栅格化 → 走与图片完全相同的识别管线 ──
//    所以旋转、缩放、亮度浮雕、单色/原色、原图对照卡、对比分屏对文字全都直接可用
const TEXT_FONT = 'Georgia, "Times New Roman", "Songti SC", SimSun, "Microsoft YaHei", serif';

function setTxtStatus(t) { const el = document.getElementById('txt-status'); if (el) el.textContent = t; }

let _measureCtx = null;
function textCtx(size) {
    if (!_measureCtx) _measureCtx = makeCanvas(8, 8).getContext('2d');
    _measureCtx.font = '700 ' + Math.max(6, size) + 'px ' + TEXT_FONT;
    return _measureCtx;
}

// 单段（不含换行）折行：西文优先在空格处断，中文逐字断
function wrapSegment(seg, ctx, maxW) {
    const out = [];
    let line = '';
    for (let i = 0; i < seg.length; i++) {
        const ch = seg[i], test = line + ch;
        if (!line || ctx.measureText(test).width <= maxW) { line = test; continue; }
        let cut = -1;
        for (let k = line.length - 1; k > Math.max(0, line.length - 24); k--) {
            if (line[k] === ' ' || line[k] === '\t' || line[k] === '\u3000') { cut = k + 1; break; }
        }
        if (cut > 0) { out.push(line.slice(0, cut).replace(/\s+$/, '')); line = line.slice(cut) + ch; }
        else { out.push(line); line = ch; }
    }
    if (line.length) out.push(line);
    return out;
}

// 按文本多少自动定字号：短文本放大到铺满、长文本一路缩到装得下（不截断、不溢出，长度不限）
function fitTextLayout(text, maxW, maxH, startSize) {
    let size = Math.max(6, startSize), lines = [];
    for (let it = 0; it < 60; it++) {
        const ctx = textCtx(size);
        lines = [];
        text.split(/\r?\n/).forEach(seg => wrapSegment(seg, ctx, maxW).forEach(l => lines.push(l)));
        if (!lines.length) lines = [''];
        let widest = 0;
        for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
        const lh = size * Math.max(1.0, params.txtLineGap);
        const blockH = Math.max(lh, lines.length * lh);
        let k = Math.min(maxH / blockH, widest > 0 ? maxW / widest : 4);
        if (!isFinite(k) || k <= 0) k = 1;
        k = Math.max(0.45, Math.min(2.4, k));          // 每轮最多变 2.4×/0.45×，避免来回震荡
        if (Math.abs(k - 1) < 0.015 || size >= 1400) break;
        size = Math.max(6, Math.min(1400, size * k));
    }
    return { size: Math.max(6, Math.round(size)), lines };
}

// 排版 → 栅格画布（白字透明底：配合 alpha 采样，字形边缘最锐）
function drawTextRaster(text, W, H) {
    const cv = makeCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
    const padX = Math.max(8, Math.round(W * 0.05)), padY = Math.max(6, Math.round(H * 0.07));
    const boxW = W - padX * 2, boxH = H - padY * 2;
    const fit = fitTextLayout(text, boxW, boxH, params.txtMaxSize);
    const size = fit.size, lines = fit.lines;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#fff';
    cx.font = '700 ' + size + 'px ' + TEXT_FONT;
    cx.textAlign = params.txtAlign === 'left' ? 'left' : 'center';
    cx.textBaseline = 'middle';
    const lh = size * Math.max(1.0, params.txtLineGap);
    const blockH = lines.length * lh;
    const x0 = params.txtAlign === 'left' ? padX : W / 2;
    const y0 = padY + Math.max(0, (boxH - blockH) / 2) + lh / 2;
    for (let i = 0; i < lines.length; i++) cx.fillText(lines[i], x0, y0 + i * lh);
    let glyphs = 0;
    for (const l of lines) glyphs += l.replace(/\s/g, '').length;
    return { cv, size, lines: lines.length, glyphs, boxW, boxH };
}

// 文字 → 第五形态点云的唯一入口（UI 按钮与 ?text= 都走这里）
function textFormationReady(text) {
    const t = String(text == null ? '' : text);
    if (!t.trim()) { setTxtStatus('先输入一点文字（中英文都行，长度不限）'); return Promise.resolve(null); }
    // 栅格宽高比贴合当前可视区：铺进画面后不会两边空一片、也不会顶到边
    const AR = Math.max(0.7, Math.min(3.4, (camera ? camera.aspect : 1) * 0.96));
    const W = Math.max(320, Math.min(1024, params.txtRes | 0));
    const H = Math.max(160, Math.round(W / AR));
    const r = drawTextRaster(t, W, H);
    return new Promise(resolve => {
        const im = new Image();
        im.onload = () => {
            im._poolRes = W;                        // 文字用排版栅格宽度采样（不受图片精度滑杆限制，字形才锐）
            const one = t.replace(/\s+/g, ' ').trim();
            const snip = one.slice(0, 14);
            imgLabel = '文字 · ' + snip + (one.length > 14 ? '…' : '');
            textInfo = { text: t, chars: one.length, glyphs: r.glyphs, lines: r.lines, size: r.size, w: W, h: H };
            params.imgMode = 'alpha';               // 白字透明底 → 透明通道取样最忠实
            const sel = document.getElementById('img-mode'); if (sel) sel.value = 'alpha';
            params.imgColor = false;                // 默认单色：交给主色染色（想留白字就点「图片原色」）
            const cb = document.getElementById('imgcolor-btn'); if (cb) cb.textContent = '图片原色：关';
            colors();
            onImageReady(im);
            resolve(im);
        };
        im.onerror = () => { setTxtStatus('文字栅格化失败'); resolve(null); };
        im.src = r.cv.toDataURL('image/png');
    });
}

function generateTextFormation() {
    const ta = document.getElementById('txt-input');
    return textFormationReady(ta ? ta.value : '');
}
const TEXT_SAMPLE = '归潮\nAnabasis · 洄游\n任意长度文字都能变成粒子\n不限字数：中英文混排、换行、长段落都可以';
function loadTextSample() {
    const ta = document.getElementById('txt-input');
    if (ta) ta.value = TEXT_SAMPLE;
    generateTextFormation();
}
function clearTextInput() {
    const ta = document.getElementById('txt-input');
    if (ta) ta.value = '';
    if (textInfo) clearImage();          // 文字与图片共用第五形态这一个槽位
    setTxtStatus('已清空输入');
}
function setTextAlign(v) {
    params.txtAlign = v;
    const sel = document.getElementById('txt-align'); if (sel) sel.value = params.txtAlign;
    if (textInfo) textFormationReady(textInfo.text);
}
function bindTextInput() {
    const ta = document.getElementById('txt-input');
    if (!ta) return;
    ta.addEventListener('keydown', e => {       // Ctrl/⌘ + Enter 直接生成
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generateTextFormation(); }
    });
}

// ── 启动 ───────────────────────────────────────────────────────────────────
function initializeSystem() {
    clockTime = 0; morphIndex = 0; phase = 'dwell'; phaseT = 0; lastBurstIndex = -1; glitchStrength = 0;
    w.set(1, 0, 0, 0);
    curW = oneHot(0); morphFrom = [1, 0, 0, 0, 0]; morphToIdx = 0; imgW = 0;
    if (uniforms) uniforms.uImgW.value = 0;
    camAz = isFinite(CAM[0]) ? CAM[0] : 0.4;
    camPol = isFinite(CAM[1]) ? CAM[1] : 0.18;
    camDist = isFinite(CAM[2]) ? CAM[2] : 17.5;
    if (isFinite(CAM[0])) autoRotate = false;   // 显式指定机位 = 锁定视角（出图可复现）
    buildCloud();
    colors();
    window.__DIAG__ = diag;
}

async function boot() {
    const bootT0 = performance.now();
    if (typeof THREE === 'undefined') {
        document.querySelector('.loading').textContent = 'three.js 未加载（需要联网 CDN）';
        return;
    }
    initThree();
    initializeSystem();
    sizeToArea(true);          // 画布铺满右侧区域（出图模式仍钉死 SIZE×SIZE）
    const loading = document.querySelector('.loading'); if (loading) loading.style.display = 'none';
    updateSeedDisplay();
    updateSrcCard();
    bindImageDrop();
    bindTextInput();
    if (TEXT_Q) {
        // ?text=任意文字（长度不限）：先排版成粒子文字，再跑帧 —— 无头出图与分享链接用
        const ta = document.getElementById('txt-input'); if (ta) ta.value = TEXT_Q;
        await textFormationReady(TEXT_Q);
    } else if (IMG_URL) {
        // 出图 / 分享链接：直接用 ?img= 喂图片地址（无头渲染必须先等图片就位，再跑帧）
        imgLabel = IMG_URL.indexOf('data:') === 0 ? 'data-url' : (IMG_URL.split('/').pop() || 'image');
        try { await loadImageURL(IMG_URL); } catch (e) { setImgStatus(e.message); }
    } else {
        reportImage();
    }

    if (FRAMES > 0) {
        const dt = 1 / 60, t0 = performance.now();
        for (let f = 0; f < FRAMES; f++) step(dt);
        const t1 = performance.now();
        render();
        const t2 = performance.now();
        window.__TIMING__ = { steps: +(t1 - t0).toFixed(1), render: +(t2 - t1).toFixed(1), boot: +(t1 - bootT0).toFixed(1) };
        // 动画出帧钩子：从外部推进 k 步再重绘（render-anim.mjs 逐帧截图用）
        window.__ADVANCE__ = function (k, dtq) {
            const d = dtq || 1 / 60;
            for (let i = 0; i < (k || 1); i++) step(d);
            render();
            return { steps: k || 1, time: +(window.__DIAG__ && window.__DIAG__.time || 0).toFixed(2) };
        };
        window.__READY__ = true;
        return;
    }
    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        step(dt); render();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

// ── UI 控制 ────────────────────────────────────────────────────────────────
function updateParam(name, value) {
    const numeric = parseFloat(value);
    params[name] = isNaN(numeric) ? value : numeric;
    const label = document.getElementById(name + '-value');
    if (label) label.textContent = params[name];
    if (name === 'particleCount') buildCloud();
    if (name === 'drift') uniforms.uDrift.value = params.drift;
    if (name === 'pointSize') uniforms.uSize.value = params.pointSize;
    // 图片相关的三个参数改完要重新识别一次（阈值 / 精度需要重采样，起伏只需重新铺点）
    if (name === 'imgThreshold' || name === 'imgRes') { if (imgSource) { buildImagePool(imgSource); applyImageFormation(); reportImage(); } }
    if (name === 'imgRelief' || name === 'imgFit') { if (imgPool) { assignImage(params.particleCount >>> 0); applyImageFormation(); reportImage(); } }
    // 文字排版参数：改了要重新排版 + 重新采样（字形大小会变）
    if (name === 'txtMaxSize' || name === 'txtRes') { if (textInfo) textFormationReady(textInfo.text); }
}

function updateColor(colorId, value) {
    const idx = parseInt(colorId.replace('color', ''), 10) - 1;
    params.colorPalette[idx] = value;
    const label = document.getElementById(colorId + '-value');
    if (label) label.textContent = value;
    colors();
}

// ── 形态 / 视角 / 出图 控制（追加）────────────────────────────────────────
function nextFormation() {
    if (FORCE_SHAPE >= 0) return;
    morphTo((morphIndex + 1) % formCount());
}
function triggerGlitch() { lastBurstIndex = Math.floor(clockTime / CYCLE_GAP); glitchStrength = 1; }
function resetView() { camAz = 0.4; camPol = 0.18; camDist = 17.5; camAzV = camPolV = 0; }
function toggleAutoRotate(btn) {
    autoRotate = !autoRotate;
    if (btn) btn.textContent = autoRotate ? '自动旋转：开' : '自动旋转：关';
}
function downloadPNG() { render(); const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png'); a.download = 'anabasis_seed' + params.seed + '.png'; a.click(); }

// ── Seed 控制（保留模板语义）───────────────────────────────────────────────
function updateSeedDisplay() { const el = document.getElementById('seed-input'); if (el) el.value = params.seed; }
function updateSeed() {
    const input = document.getElementById('seed-input'); const v = parseInt(input.value, 10);
    if (v && v > 0) { params.seed = v; initializeSystem(); } else { updateSeedDisplay(); }
}
function previousSeed() { params.seed = Math.max(1, params.seed - 1); updateSeedDisplay(); initializeSystem(); }
function nextSeed() { params.seed = params.seed + 1; updateSeedDisplay(); initializeSystem(); }
function randomSeedAndUpdate() { params.seed = Math.floor(Math.random() * 999999) + 1; updateSeedDisplay(); initializeSystem(); }

function resetParameters() {
    params = { ...defaultParams };
    ['particleCount', 'pointSize', 'morphDur', 'dwell', 'glitch', 'drift', 'rotateSpeed', 'imgThreshold', 'imgRes', 'imgRelief', 'imgFit', 'txtMaxSize', 'txtRes'].forEach(k => {
        const el = document.getElementById(k); if (el) el.value = params[k];
        const lb = document.getElementById(k + '-value'); if (lb) lb.textContent = params[k];
    });
    const modeSel = document.getElementById('img-mode'); if (modeSel) modeSel.value = params.imgMode;
    const cbtn = document.getElementById('imgcolor-btn'); if (cbtn) cbtn.textContent = '图片原色：' + (params.imgColor ? '开' : '关');
    const lbtn = document.getElementById('imglock-btn'); if (lbtn) lbtn.textContent = '锁定图片形态：' + (params.imgLock ? '开' : '关');
    const ibtn = document.getElementById('imginvert-btn'); if (ibtn) ibtn.textContent = '反色：' + (params.imgInvert ? '开' : '关');
    if (imgSource) { buildImagePool(imgSource); }
    const alignSel = document.getElementById('txt-align'); if (alignSel) alignSel.value = params.txtAlign;
    reportImage();
    if (textInfo) textFormationReady(textInfo.text);   // 文字：按默认参数重新排版一遍（模式/字号都可能被重置）
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById('color' + (i + 1)); if (el) el.value = params.colorPalette[i];
        const lb = document.getElementById('color' + (i + 1) + '-value'); if (lb) lb.textContent = params.colorPalette[i];
    }
    updateSeedDisplay(); autoRotate = true;
    const ab = document.getElementById('autorotate-btn'); if (ab) ab.textContent = '自动旋转：开';
    initializeSystem();
}

window.addEventListener('load', function () { boot(); });
