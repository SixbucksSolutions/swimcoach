#!/usr/bin/env python3
"""Render every screen of the clickable mock to PNG, iPhone 16 size, stamped at 300 DPI.

    pip install playwright pillow      (plus Chrome, or `playwright install chromium`)
    python mocks/tools/render-mock.py [OUT_DIR] [--chrome PATH]

Writes OUT_DIR (default design/ui-mock) as:
    <scenario>-00-all-projects.png
    <scenario>-NN-<project>-top.png / -bottom.png   (one pair per project display)
The "stale" and "offline" scenarios are the afternoon grayed out, so only their overview is rendered.
The mock's MOCK button is hidden, so the images show only the design.
"""
import re
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:]]
chrome = None
if "--chrome" in args:
    i = args.index("--chrome"); chrome = args[i + 1]; del args[i:i + 2]
out = Path(args[0]) if args else ROOT / "design" / "ui-mock"
out.mkdir(parents=True, exist_ok=True)
url = (ROOT / "mocks" / "index.html").resolve().as_uri()
OVERVIEW_ONLY = {"stale", "offline"}
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

with sync_playwright() as p:
    b = p.chromium.launch(**({"executable_path": chrome} if chrome else {}))
    pg = b.new_page(viewport={"width": 393, "height": 852}, device_scale_factor=3, has_touch=True)
    pg.goto(url); pg.wait_for_timeout(300)
    order = pg.evaluate("ORDER")
    for k in order:
        pg.goto(url + "#" + k); pg.reload(); pg.wait_for_timeout(500)
        pg.add_style_tag(content="#mockbtn{display:none!important}")
        pg.wait_for_timeout(100)
        pg.screenshot(path=str(out / f"{k}-00-all-projects.png"))
        if k in OVERVIEW_ONLY:
            continue
        n = pg.evaluate("keys().length")
        for i in range(1, n):
            name = slug(pg.evaluate(f"keys()[{i}]"))
            pg.evaluate(f"go(keys()[{i}], false)"); pg.wait_for_timeout(250)
            pg.screenshot(path=str(out / f"{k}-{i:02d}-{name}-top.png"))
            scrolls = pg.evaluate(f"(e => e.scrollHeight > e.clientHeight + 4)(pages.children[{i}])")
            if scrolls:
                pg.evaluate(f"pages.children[{i}].scrollTop = 99999"); pg.wait_for_timeout(200)
                pg.screenshot(path=str(out / f"{k}-{i:02d}-{name}-bottom.png"))
                pg.evaluate(f"pages.children[{i}].scrollTop = 0")
        print("rendered", k)
    b.close()

for f in sorted(out.glob("*.png")):
    Image.open(f).save(f, dpi=(300, 300))
print(len(list(out.glob("*.png"))), "PNGs in", out)
