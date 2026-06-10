#!/usr/bin/env python3
"""Generate a placeholder 1024x1024 app icon (stdlib only) -> app/icon-1024.png.
A dark rounded field with a light 'device' rectangle. Replace with real artwork,
then run:  (cd app && npx tauri icon ../app/icon-1024.png)
"""
import os, struct, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "icon-1024.png")
N = 1024

BG = (28, 28, 32)
FG = (236, 236, 240)
SCREEN = (248, 248, 250)


def main():
    # device rectangle (a phone-ish frame) centred
    rx0, ry0, rx1, ry1 = 360, 200, 664, 824        # outer light frame
    sx0, sy0, sx1, sy1 = 392, 256, 632, 768        # inner screen
    rad = 56

    def in_round_rect(x, y, x0, y0, x1, y1, r):
        if x0 <= x <= x1 and y0 <= y <= y1:
            for (cx, cy) in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
                if ((x < x0 + r or x > x1 - r) and (y < y0 + r or y > y1 - r)):
                    if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                        return False
            return True
        return False

    raw = bytearray()
    for y in range(N):
        raw.append(0)  # filter type 0
        for x in range(N):
            if in_round_rect(x, y, sx0, sy0, sx1, sy1, 28):
                px = SCREEN
            elif in_round_rect(x, y, rx0, ry0, rx1, ry1, rad):
                px = FG
            else:
                px = BG
            raw += bytes(px)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", N, N, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(OUT, ROOT), f"({len(png)//1024} KB)")


if __name__ == "__main__":
    main()
