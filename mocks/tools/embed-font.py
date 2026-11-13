#!/usr/bin/env python3
"""Embed the vendored Inter font file into mocks/index.html as a base64 @font-face rule.

    python mocks/tools/embed-font.py

The mock stays one self-contained file with no network, so the font travels inside it. The rule is
written between the FONT:BEGIN and FONT:END markers. Re-run after replacing the font file in
third_party/inter/. Inter is licensed under the SIL Open Font License 1.1; see
third_party/inter/LICENSE.txt and THIRD-PARTY-NOTICES.md.
"""

import argparse
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "third_party" / "inter" / "InterVariable-latin.woff2"
PAGE = ROOT / "mocks" / "index.html"
MARKERS = re.compile(r"(/\*FONT:BEGIN\*/).*?(/\*FONT:END\*/)", re.DOTALL)


def font_face(font: Path) -> str:
    """Build the @font-face rule that carries the font file as a data URI."""
    data = base64.b64encode(font.read_bytes()).decode("ascii")
    return (
        "\n/* Inter typeface, Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter).\n"
        "   SIL Open Font License 1.1: third_party/inter/LICENSE.txt. Latin subset of InterVariable.woff2 v4.1. */\n"
        "@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:block;"
        f"src:url(data:font/woff2;base64,{data}) format('woff2')}}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed the Inter font file into the clickable mock.")
    parser.parse_args()
    html = PAGE.read_text(encoding="utf-8")
    if not MARKERS.search(html):
        raise SystemExit(f"FONT:BEGIN / FONT:END markers not found in {PAGE}")
    rule = font_face(FONT)
    html = MARKERS.sub(lambda m: m.group(1) + rule + m.group(2), html, count=1)
    with PAGE.open("w", encoding="utf-8", newline="") as f:
        f.write(html)
    print(f"Embedded {FONT.name} ({FONT.stat().st_size:,} bytes) into {PAGE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
