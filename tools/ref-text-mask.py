# 独立参照渲染：用 Pillow + 系统中文字体把同一段文字排一遍，输出同规格 ASCII 图。
# 用途：本机没有视觉模型，正文里的字形对不对只能靠「两条独立渲染链路的 ASCII 图是否一致」来判断。
# 用法: python ref-text-mask.py "<文字>" [cols] [rows]
import sys
from PIL import Image, ImageDraw, ImageFont

text = sys.argv[1] if len(sys.argv) > 1 else "归潮"
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 96
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 48

W, H = 900, 938                      # 与页面 1:1 画布下的排版栅格同规格（AR = 0.96）
pad_x, pad_y = int(W * 0.05), int(H * 0.07)
box_w, box_h = W - pad_x * 2, H - pad_y * 2

FONTS = ["C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]
font_path = next((f for f in FONTS if __import__("os").path.exists(f)), None)

img = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(img)

# 自动字号：短文本放大、长文本缩小折行（与页面同一策略，便于对齐比较）
def wrap(seg, font, maxw):
    out, line = [], ""
    for ch in seg:
        if not line or d.textlength(line + ch, font=font) <= maxw:
            line += ch
        else:
            out.append(line); line = ch
    if line:
        out.append(line)
    return out

size = 220.0
for _ in range(60):
    font = ImageFont.truetype(font_path, max(6, int(size)))
    lines = []
    for seg in text.split("\n"):
        lines += wrap(seg, font, box_w)
    lines = lines or [""]
    widest = max(d.textlength(l, font=font) for l in lines)
    lh = size * 1.16
    block_h = max(lh, len(lines) * lh)
    k = min(box_h / block_h, box_w / widest if widest > 0 else 4)
    k = max(0.45, min(2.4, k))
    if abs(k - 1) < 0.015 or size >= 1400:
        break
    size = max(6, min(1400, size * k))

size = int(round(size))
font = ImageFont.truetype(font_path, size)
lines = []
for seg in text.split("\n"):
    lines += wrap(seg, font, box_w)
lines = lines or [""]
lh = size * 1.16
block_h = len(lines) * lh
y0 = pad_y + max(0, (box_h - block_h) / 2) + lh / 2
for i, l in enumerate(lines):
    d.text((W / 2, y0 + i * lh - size / 2), l, font=font, fill=255, anchor="ma")

px = img.load()
grid = [[0] * cols for _ in range(rows)]
for y in range(H):
    for x in range(W):
        if px[x, y] > 40:
            grid[(y * rows // H)][(x * cols // W)] += 1

cell = (W / cols) * (H / rows)
print("font    : %s @ %dpx · lines=%d" % (font_path, size, len(lines)))
print("grid    : %d×%d（每格 ≈ %d px）" % (cols, rows, cell))
print()
thr = max(1, int(cell * 0.10))
for row in grid:
    print("".join("#" if v >= thr else ("." if v > 0 else " ") for v in row))
