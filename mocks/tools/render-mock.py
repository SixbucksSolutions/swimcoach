#!/usr/bin/env python3
"""Render every screen of the clickable mock to PNG, iPhone 16 Pro size, stamped at 300 DPI.

    uv run --no-project --with playwright --with pillow python mocks/tools/render-mock.py [OUT_DIR] [--chrome PATH]

Writes OUT_DIR (default design/ui-mock) as:
    <scenario>-00-all-projects.png
    <scenario>-NN-<project>-top.png / -bottom.png   (one pair per project display)
The "stale" and "offline" scenarios are the afternoon grayed out, so only their overview is rendered.
The mock's MOCK button is hidden, so the images show only the design.
"""

import argparse
import re
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OVERVIEW_ONLY = {"stale", "offline"}

# iPhone 16 Pro: 402 x 874 CSS px at 3x, so 1206 x 2622 px images. Keep in step with #phone in index.html.
VIEWPORT = {"width": 402, "height": 874}
SCALE = 3


def stamp_dpi(f: Path, tries: int = 5) -> None:
    """Rewrite a PNG with 300 DPI metadata, retrying if Windows briefly refuses the write.

    On Windows a freshly written PNG is sometimes held for a moment by another process (antivirus or
    the indexer scanning it), and reopening it for writing fails with OSError Errno 22. Measured
    2026-11-13: the same render failed on one file and passed unchanged on the next run. The image is
    loaded fully and closed first, then the save is retried with a short backoff.
    """
    with Image.open(f) as im:
        im.load()
        stamped = im.copy()
    for attempt in range(tries):
        try:
            stamped.save(f, dpi=(300, 300))
            return
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(0.2 * (attempt + 1))


def slug(name: str) -> str:
    """Turn a project name into a file-name fragment."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def render(out: Path, chrome: str | None) -> None:
    """Screenshot every scenario and project display into out."""
    out.mkdir(parents=True, exist_ok=True)
    url = (ROOT / "mocks" / "index.html").resolve().as_uri()
    with sync_playwright() as p:
        b = p.chromium.launch(**({"executable_path": chrome} if chrome else {}))
        pg = b.new_page(viewport=VIEWPORT, device_scale_factor=SCALE, has_touch=True)
        pg.goto(url)
        pg.wait_for_timeout(300)
        order = pg.evaluate("ORDER")
        for k in order:
            pg.goto(url + "#" + k)
            pg.reload()
            pg.wait_for_timeout(500)
            pg.add_style_tag(content="#mockbtn{display:none!important}")
            pg.wait_for_timeout(100)
            pg.screenshot(path=str(out / f"{k}-00-all-projects.png"))
            if k in OVERVIEW_ONLY:
                continue
            n = pg.evaluate("keys().length")
            for i in range(1, n):
                name = slug(pg.evaluate(f"keys()[{i}]"))
                pg.evaluate(f"go(keys()[{i}], false)")
                pg.wait_for_timeout(250)
                pg.screenshot(path=str(out / f"{k}-{i:02d}-{name}-top.png"))
                scrolls = pg.evaluate(f"(e => e.scrollHeight > e.clientHeight + 4)(pages.children[{i}])")
                if scrolls:
                    pg.evaluate(f"pages.children[{i}].scrollTop = 99999")
                    pg.wait_for_timeout(200)
                    pg.screenshot(path=str(out / f"{k}-{i:02d}-{name}-bottom.png"))
                    pg.evaluate(f"pages.children[{i}].scrollTop = 0")
            print("Rendered", k)
        b.close()

    for f in sorted(out.glob("*.png")):
        stamp_dpi(f)
    print(len(list(out.glob("*.png"))), "PNGs in", out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render every mock screen to PNG at iPhone 16 Pro size.")
    parser.add_argument("out_dir", nargs="?", type=Path, default=ROOT / "design" / "ui-mock",
                        help="Output folder (default: design/ui-mock)")
    parser.add_argument("--chrome", help="Path to a Chrome executable to use instead of Playwright's Chromium")
    args = parser.parse_args()
    render(args.out_dir, args.chrome)


if __name__ == "__main__":
    main()
