# gifpack.py —— 把 PNG 帧序列打包成动态图（GIF / 动态 WebP）
# 用法: python gifpack.py <帧目录> <输出.gif|.webp> [帧间隔ms] [宽] [帧数上限]
import sys, os, glob
from PIL import Image

def main():
    if len(sys.argv) < 3:
        print('usage: python gifpack.py <framesDir> <out.gif|out.webp> [delayMs] [width] [maxFrames]'); return 1
    d, out = sys.argv[1], sys.argv[2]
    delay = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    maxn = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    files = sorted(glob.glob(os.path.join(d, '*.png')))
    if maxn > 0:
        step = max(1, len(files) // maxn); files = files[::step][:maxn]
    if not files:
        print('no frames in', d); return 1
    ims = []
    for f in files:
        im = Image.open(f).convert('RGB')
        if width and im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        ims.append(im)
    kw = dict(save_all=True, append_images=ims[1:], duration=delay, loop=0)
    if out.lower().endswith('.webp'):
        ims[0].save(out, format='WEBP', quality=82, method=6, **kw)
    else:
        ims[0].save(out, format='GIF', optimize=True, disposal=2, **kw)
    size = os.path.getsize(out)
    print(f'{".".join(os.path.basename(out).split(".")[:-1])}: frames={len(ims)} {ims[0].width}x{ims[0].height} delay={delay}ms bytes={size}')
    return 0

sys.exit(main())
