#!/usr/bin/env python3
"""
產生營養追蹤 App 的圖示，零外部依賴。

設計：森林綠底 + 米白葉片 + 蜜金葉柄，中脈以底色鏤空。
在 40px 也還看得出形狀，是刻意選簡單造型的原因。

作法：貝茲曲線攤平成多邊形 → 掃描線填色（4x 超取樣做抗鋸齒）→ 手寫 PNG。
"""
import zlib, struct, os

GREEN = (0x4A, 0x7C, 0x59)
CREAM = (0xFB, 0xF7, 0xF0)
HONEY = (0xD9, 0xA4, 0x41)

SS = 4  # 超取樣倍率


# ---------- 幾何 ----------
def cubic(p0, p1, p2, p3, n=48):
    """三次貝茲攤平成點列。"""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0]
        y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        out.append((x, y))
    return out


def quad(p0, p1, p2, n=24):
    """二次貝茲攤平成點列。"""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0],
                    u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1]))
    return out


def taper(center, w0, w1):
    """把一條中心線加粗成多邊形，寬度由 w0 漸變到 w1（兩端收尖用 0）。

    沿線段法向量往兩側偏移；葉脈、葉柄都用這個做，省得每種形狀各寫一套。
    """
    n = len(center)
    left, right = [], []
    for i, (x, y) in enumerate(center):
        t = i / (n - 1)
        w = w0 + (w1 - w0) * t
        # 用相鄰點估切線方向
        px, py = center[max(0, i - 1)]
        nx, ny = center[min(n - 1, i + 1)]
        dx, dy = nx - px, ny - py
        L = (dx*dx + dy*dy) ** 0.5 or 1.0
        ox, oy = -dy / L * w, dx / L * w      # 法向量
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))
    return left + right[::-1]


def rot(poly, deg, cx=50.0, cy=52.0):
    """繞 (cx,cy) 旋轉，讓整片葉子斜著擺——正放太像眼睛。"""
    import math
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * ca - (y - cy) * sa,
             cy + (x - cx) * sa + (y - cy) * ca) for x, y in poly]


TILT = -20.0     # 葉片傾角


def leaf_outline():
    """葉片外框：基部較圓、葉尖拉長，比對稱橢圓更像真的葉子。"""
    base, tip = (50, 86), (50, 10)
    left  = cubic(base, (18, 74), (14, 32), tip)
    right = cubic(tip, (86, 32), (82, 74), base)
    return rot(left + right[1:], TILT)


def midrib():
    """中脈：從基部貫到葉尖，兩端收尖。用底色填，做出鏤空。"""
    line = quad((50, 82), (50, 48), (50, 15))
    return rot(taper(line, 1.5, 0.15), TILT)


def side_veins():
    """側脈：三對，往葉尖方向斜上。讓輪廓不會只是一片色塊。"""
    out = []
    for y0, y1, dx in ((70, 60, 20), (56, 45, 22), (42, 33, 17)):
        for s in (-1, 1):
            line = quad((50, y0),
                        (50 + s * dx * 0.55, y0 - (y0 - y1) * 0.3),
                        (50 + s * dx, y1))
            out.append(rot(taper(line, 1.15, 0.12), TILT))
    return out


def stem():
    """葉柄：從基部往下延伸的短梗。"""
    line = quad((50, 84), (50, 92), (49, 97))
    return rot(taper(line, 1.9, 1.5), TILT)


# ---------- 光柵化 ----------
def fill(buf, W, H, poly, color):
    """掃描線多邊形填色（even-odd）。buf 是 W*H 的 RGB bytearray。"""
    if len(poly) < 3:
        return
    ys = [p[1] for p in poly]
    y0 = max(0, int(min(ys)))
    y1 = min(H - 1, int(max(ys)) + 1)
    n = len(poly)
    r, g, b = color
    for y in range(y0, y1 + 1):
        yc = y + 0.5
        xs = []
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) / (by - ay) * (bx - ax))
        if not xs:
            continue
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            xa = max(0, int(xs[i] + 0.5))
            xb = min(W - 1, int(xs[i + 1] - 0.5))
            base = (y * W + xa) * 3
            for _ in range(xb - xa + 1):
                buf[base] = r; buf[base + 1] = g; buf[base + 2] = b
                base += 3


def downsample(buf, W, H, ss):
    """把超取樣的 buffer 盒式縮回目標尺寸，順便得到抗鋸齒。"""
    ow, oh = W // ss, H // ss
    out = bytearray(ow * oh * 3)
    area = ss * ss
    for y in range(oh):
        for x in range(ow):
            tr = tg = tb = 0
            for dy in range(ss):
                row = ((y * ss + dy) * W + x * ss) * 3
                for dx in range(ss):
                    i = row + dx * 3
                    tr += buf[i]; tg += buf[i + 1]; tb += buf[i + 2]
            o = (y * ow + x) * 3
            out[o] = tr // area; out[o + 1] = tg // area; out[o + 2] = tb // area
    return out, ow, oh


def write_png(path, buf, W, H):
    """手寫 PNG（RGB, 8-bit, 無濾波）。"""
    raw = b''.join(b'\x00' + bytes(buf[y * W * 3:(y + 1) * W * 3]) for y in range(H))

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)


def render(size, inset):
    """inset = 標誌四周留白比例。maskable 版本要留多一點安全區。"""
    W = H = size * SS
    buf = bytearray(W * H * 3)
    for i in range(0, len(buf), 3):          # 滿版底色（iOS 會自己圓角）
        buf[i], buf[i + 1], buf[i + 2] = GREEN

    m = W * inset
    span = W - m * 2
    def T(poly):                              # 100x100 座標 → 畫布座標
        return [(m + x * span / 100, m + y * span / 100) for x, y in poly]

    fill(buf, W, H, T(stem()), HONEY)         # 葉柄先畫，讓葉片壓在上面
    fill(buf, W, H, T(leaf_outline()), CREAM)
    fill(buf, W, H, T(midrib()), GREEN)       # 中脈與側脈用底色鏤空
    for v in side_veins():
        fill(buf, W, H, T(v), GREEN)

    small, ow, oh = downsample(buf, W, H, SS)
    return small, ow, oh


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    targets = [
        ('icon-180.png',          180, 0.20),   # apple-touch-icon
        ('icon-192.png',          192, 0.20),
        ('icon-512.png',          512, 0.20),
        ('icon-maskable-512.png', 512, 0.28),   # Android maskable 安全區
        ('favicon-32.png',         32, 0.14),
    ]
    for name, size, inset in targets:
        buf, w, h = render(size, inset)
        p = os.path.join(here, name)
        write_png(p, buf, w, h)
        print(f'{name:26} {w}x{h}  {os.path.getsize(p):>6} bytes')
