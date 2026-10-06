#!/usr/bin/env python3
"""
生成占位照片，用于在真实照片就位前预览站点效果。

做两件事：
  1. 从 picsum.photos 拉真实照片 —— 比纯色块更能反映真实观感，
     尤其能看出明暗差异对「背景压暗」策略的影响。
  2. 往 JPEG 里写入 EXIF DateTimeOriginal —— 手机照片天生带这个字段，
     归档页靠它按年月分组。占位图不补 EXIF 的话，归档页测不出真实效果。

真实照片就位后，直接删掉 content/albums/*/ 下的 .jpg 即可。
脚本是幂等的：已存在的文件会跳过，可以反复跑。

用法：
    python3 tools/make-placeholders.py            # 生成全部
    python3 tools/make-placeholders.py travel     # 只生成某个相册
"""

import os
import struct
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 主题仓库里写到 exampleSite/，站点里写到自己的 content/
_EX = os.path.join(ROOT, "exampleSite", "content", "albums")
OUT_ROOT = os.path.join(ROOT, "exampleSite", "content") if os.path.isdir(_EX) else os.path.join(ROOT, "content")

# 相册定义：(目录名, 中文名, 英文名, 张数)
ALBUMS = [
    ("travel",   "旅行", "TRAVEL",     10),
    ("daily",    "日常", "DAILY",      10),
    ("portrait", "人像", "PORTRAIT",   10),
    ("street",   "街拍", "STREET",     10),
    ("land",     "风景", "LANDSCAPE",  10),
    ("still",    "静物", "STILL LIFE", 10),
    ("night",    "夜色", "NIGHT",      10),
]

# 手机照片的常见比例：3:4 竖拍为主，混 4:3 横拍和 9:16
RATIOS = [(600, 800)] * 5 + [(800, 600)] * 3 + [(540, 960), (700, 700)]

# 时间跨度：从 2026-09-01 往前铺。示例用 150 天（约 5 个月，每月 14 张），
# 刚好能让归档页触发「一行放不下 → +N」的折叠。
# 换成真实照片前可以调大，仓库体积也会跟着涨。
SPAN_DAYS = 150
END_DATE = date(2026, 9, 1)

UA = {"User-Agent": "Mozilla/5.0 (photo-gallery placeholder generator)"}


def build_exif(dt_str):
    """
    构造一个最小可用的 APP1/EXIF 段，只含 DateTimeOriginal(0x9003)。

    字节布局（TIFF 小端）：
        0  : "II" + 42 + IFD0 偏移(8)          共 8 字节
        8  : IFD0  —— 1 个条目，指向 ExifIFD   共 18 字节，结束于 26
        26 : ExifIFD —— 1 个条目，指向时间串   共 18 字节，结束于 44
        44 : "YYYY:MM:DD HH:MM:SS\\0"          共 20 字节
    """
    s = dt_str.encode("ascii") + b"\x00"          # 19 + 1 = 20 字节
    tiff = bytearray()
    tiff += b"II" + struct.pack("<H", 42) + struct.pack("<I", 8)

    # IFD0：一个 ExifIFD 指针
    tiff += struct.pack("<H", 1)
    tiff += struct.pack("<HHI", 0x8769, 4, 1) + struct.pack("<I", 26)
    tiff += struct.pack("<I", 0)

    # ExifIFD：DateTimeOriginal
    tiff += struct.pack("<H", 1)
    tiff += struct.pack("<HHI", 0x9003, 2, len(s)) + struct.pack("<I", 44)
    tiff += struct.pack("<I", 0)

    tiff += s

    payload = b"Exif\x00\x00" + bytes(tiff)
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def insert_exif(jpeg, dt_str):
    """把 APP1 插到 SOI 之后；若存在 APP0(JFIF) 则插在它后面，保持 JFIF 规范。"""
    if jpeg[:2] != b"\xff\xd8":
        raise ValueError("不是合法的 JPEG")
    pos = 2
    if jpeg[pos:pos + 2] == b"\xff\xe0":                  # 跳过 APP0
        pos += 2 + int.from_bytes(jpeg[pos + 2:pos + 4], "big")
    return jpeg[:pos] + build_exif(dt_str) + jpeg[pos:]


def is_complete_jpeg(data):
    """JPEG 必须以 FFD8 开头、FFD9 结尾。picsum 并发下会截断响应。"""
    return len(data) > 1024 and data[:2] == b"\xff\xd8" and data[-2:] == b"\xff\xd9"


def fetch(url, tries=4):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = r.read()
            if is_complete_jpeg(data):
                return data
            last = ValueError(f"响应被截断，只有 {len(data)} 字节")
        except Exception as e:                       # 含 IncompleteRead 等 http.client 异常
            last = e
        if i < tries - 1:
            time.sleep(1.2 * (i + 1))
    raise last


def gen_one(args):
    album, idx, total = args
    out_dir = os.path.join(OUT_ROOT, "albums", album)
    path = os.path.join(out_dir, f"{idx + 1:03d}.jpg")

    if os.path.exists(path):                       # 已存在且完整才跳过，截断的重下
        with open(path, "rb") as f:
            head = f.read(2)
            f.seek(-2, os.SEEK_END)
            tail = f.read(2)
        if head == b"\xff\xd8" and tail == b"\xff\xd9":
            return f"跳过 {album}/{idx + 1:03d}.jpg"

    w, h = RATIOS[idx % len(RATIOS)]
    url = f"https://picsum.photos/seed/{album}{idx}/{w}/{h}"

    # 越靠前的照片日期越近：索引 0 是最新的一张
    day_offset = int((idx / max(total - 1, 1)) * SPAN_DAYS)
    d = END_DATE - timedelta(days=day_offset)
    dt_str = f"{d.year:04d}:{d.month:02d}:{d.day:02d} {8 + idx % 12:02d}:{idx * 7 % 60:02d}:00"

    jpeg = fetch(url)
    jpeg = insert_exif(jpeg, dt_str)

    os.makedirs(out_dir, exist_ok=True)
    with open(path, "wb") as f:
        f.write(jpeg)
    return f"生成 {album}/{idx + 1:03d}.jpg  {d}  {len(jpeg) // 1024}KB"


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    jobs = []
    for slug, _cn, _en, n in ALBUMS:
        if only and slug != only:
            continue
        jobs += [(slug, i, n) for i in range(n)]

    print(f"共 {len(jobs)} 张，并发 6 ...")
    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(gen_one, jobs):
            done += 1
            if done % 20 == 0 or done == len(jobs):
                print(f"  [{done}/{len(jobs)}] {msg}")
    print("完成。")


if __name__ == "__main__":
    main()
