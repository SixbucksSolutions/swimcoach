#!/usr/bin/env python3
"""Render design/logo/swimcoach.svg to PNG, stamped at 300 DPI.

    uv run --no-project --with playwright --with pillow python mocks/tools/render-logo.py

Writes, next to the SVG:
    swimcoach-512.png        the mark at 512 x 512, transparent corners
    swimcoach-touch-180.png  the iPhone home-screen icon: 180 x 180, the mark centered on the page's
                             dark ground (#0b0f14), full bleed, because iOS rounds the corners itself
and, for the MVP page, the same full-bleed treatment at three sizes in public/icons/:
    touch-180.png, icon-192.png, icon-512.png
"""

import argparse
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / "design" / "logo"
ICONS = ROOT / "public" / "icons"
GROUND = "#0b0f14"  # --bg in docs/brand.md section 5


def page(svg: str, size: int, ground: str | None, inset: float) -> str:
    """HTML that draws the mark at size px, optionally centered on a solid ground."""
    bg = ground or "transparent"
    pad = round(size * inset)
    return (
        f"<html><body style='margin:0;background:{bg}'>"
        f"<div style='width:{size}px;height:{size}px;padding:{pad}px;box-sizing:border-box'>"
        f"{svg.replace('<svg ', '<svg width=\"100%\" height=\"100%\" ', 1)}</div></body></html>"
    )


def shoot(html: str, size: int, out: Path) -> None:
    """Screenshot html at size x size CSS px, 1x, with a transparent page."""
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        pg.set_content(html)
        pg.screenshot(path=str(out), omit_background=True)
        b.close()
    with Image.open(out) as im:
        im.load()
        stamped = im.copy()
    stamped.save(out, dpi=(300, 300))


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the swimcoach mark to PNG.")
    parser.parse_args()
    svg = (LOGO / "swimcoach.svg").read_text(encoding="utf-8")
    shoot(page(svg, 512, None, 0), 512, LOGO / "swimcoach-512.png")
    shoot(page(svg, 180, GROUND, 0.16), 180, LOGO / "swimcoach-touch-180.png")
    for f in ("swimcoach-512.png", "swimcoach-touch-180.png"):
        print("Wrote", (LOGO / f).relative_to(ROOT))
    # The page's own copies, served from /icons/<name>.png. Full bleed on the page ground, like the
    # touch icon: iOS rounds its corners, and Android masks the 192 and 512 sizes itself.
    ICONS.mkdir(parents=True, exist_ok=True)
    sizes = ((180, "touch-180.png"), (192, "icon-192.png"), (512, "icon-512.png"))
    for size, name in sizes:
        shoot(page(svg, size, GROUND, 0.16), size, ICONS / name)
        print("Wrote", (ICONS / name).relative_to(ROOT))


if __name__ == "__main__":
    main()
