#!/usr/bin/env python3
"""Embed the vendored Inter font file into an HTML page as a base64 @font-face rule.

    python mocks/tools/embed-font.py                            (mocks/index.html)
    python mocks/tools/embed-font.py --target public/index.html

The mock stays one self-contained file with no network, so the font travels inside it. The MVP page
(public/index.html) carries it the same way, so its reveal waits on one HTML response and nothing else
(docs/concept.md section 3.4). The rule is written between the FONT:BEGIN and FONT:END markers.
Re-run on both pages after replacing the font file in third_party/inter/. Inter is licensed under the
SIL Open Font License 1.1; see third_party/inter/LICENSE.txt and THIRD-PARTY-NOTICES.md.
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


def shown(path: Path) -> str:
    """The path relative to the repository when it is inside it, for the closing message."""
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed the Inter font file into an HTML page.")
    parser.add_argument(
        "--target",
        type=Path,
        default=PAGE,
        help="the HTML file to write into (default: mocks/index.html)",
    )
    page: Path = parser.parse_args().target.resolve()
    # newline="" on both ends: read_text() would turn CRLF into LF and the write would keep it.
    with page.open(encoding="utf-8", newline="") as f:
        html = f.read()
    if not MARKERS.search(html):
        raise SystemExit(f"FONT:BEGIN / FONT:END markers not found in {page}")
    rule = font_face(FONT)
    html = MARKERS.sub(lambda m: m.group(1) + rule + m.group(2), html, count=1)
    with page.open("w", encoding="utf-8", newline="") as f:
        f.write(html)
    print(f"Embedded {FONT.name} ({FONT.stat().st_size:,} bytes) into {shown(page)}")


if __name__ == "__main__":
    main()
