# sheet.py —— 把动画帧序列拼成一张静态「接触印相」图（内联预览用；动图无法内联，只能看关键帧）
# 用法: python sheet.py <帧目录> <输出.png> [列数] [单元px] [总帧数] [标题]
import sys, os, glob
from PIL import Image, ImageDraw

def main():
    if len(sys.argv) < 3:
        print('usage: python sheet.py <framesDir> <out.png> [cols] [cellPx] [total] [title]'); return 1
    d, out = sys.argv[1], sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    cell = int(sys.argv[4]) if len(sys.argv) > 4 else 420
    total = int(sys.argv[5]) if len(sys.argv) > 5 else 12
    title = sys.argv[6] if len(sys.argv) > 6 else ''
    files = sorted(glob.glob(os.path.join(d, '*.png')))
    if not files:
        print('no frames in', d); return 1
    step = max(1, len(files) // total)
    pick = files[::step][:total]
    n = len(pick)
    rows = (n + cols - 1) // cols
    gap, pad, head = 8, 10, (34 if title else 0)
    W = pad * 2 + cols * cell + (cols - 1) * gap
    H = pad * 2 + head + rows * cell + (rows - 1) * gap
    bg = (8, 9, 10)
    sheet = Image.new('RGB', (W, H), bg)
    dr = ImageDraw.Draw(sheet)
    if title:
        dr.text((pad, 10), title, fill=(224, 160, 106))
    for i, f in enumerate(pick):
        im = Image.open(f).convert('RGB').resize((cell, cell), Image.LANCZOS)
        x = pad + (i % cols) * (cell + gap)
        y = pad + head + (i // cols) * (cell + gap)
        sheet.paste(im, (x, y))
        idx = int(os.path.basename(f)[1:4])
        dr.text((x + 6, y + 6), 'f%03d' % idx, fill=(106, 155, 204))
    sheet.save(out, optimize=True)
    print('sheet: %s  %dx%d  cells=%d  bytes=%d' % (os.path.basename(out), W, H, n, os.path.getsize(out)))
    return 0

sys.exit(main())
