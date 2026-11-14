#!/usr/bin/env python3
"""Render every screen of the real page (public/) to PNG, iPhone 16 Pro size, stamped at 300 DPI.

    uv run --no-project --with playwright --with pillow python mocks/tools/render-page.py [OUT_DIR] [--chrome PATH]

The visual reviewer's side-by-side for MVP-08: it writes the same screens under the same file names as
render-mock.py, so OUT_DIR (default design/ui-page) and design/ui-mock compare file for file:
    <scenario>-00-all-projects.png
    <scenario>-NN-<display>-top.png / -bottom.png   (one pair per project display)

It serves public/ on a local port and answers GET /api/2026-11-14/state with
contract/schemas/examples/state.<scenario>.json, every time in it shifted so `now` is the real now.
Scenarios, as in the mock:
- "stale" and "offline" are the afternoon gone wrong, so only their overview is rendered.
- "offline" answers the first poll with the afternoon, then aborts every later poll, and moves the
  page's clock four minutes on (Playwright's clock), so the page shows OFFLINE from its own failed
  polls, as the mock did.
Two examples with no mock screen, "small-blocks" and "empty", are rendered too, under their own names.

The page carries no test hook: this script drives it through its own DOM, as Terry would.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, ClassVar

from PIL import Image
from playwright.sync_api import Page, ViewportSize, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
EXAMPLES = ROOT / "contract" / "schemas" / "examples"
MOCK_RENDERS = ROOT / "design" / "ui-mock"
STATE_PATH = "/api/2026-11-14/state"
ASSET = re.compile(r"^/(?P<dir>css|js)/(?P<name>[a-z]+)\.(?P<ext>css|js)$")
CONTENT_TYPES = {"css": "text/css; charset=utf-8", "js": "text/javascript; charset=utf-8"}

# (scenario, example it serves, project displays rendered too). The mock's order, then the extras.
SCENARIOS: list[tuple[str, str, bool]] = [
    ("afternoon", "afternoon", True),
    ("allgreen", "allgreen", True),
    ("keyboard", "keyboard", True),
    ("silent", "silent", True),
    ("morning", "morning", True),
    ("stale", "stale", False),
    ("offline", "afternoon", False),
    ("alldone", "alldone", True),
    ("small-blocks", "small-blocks", True),
    ("empty", "empty", False),
]
OFFLINE_FOR = "04:00"  # how long the "offline" board has been unreachable, as the mock showed it

# iPhone 16 Pro: 402 x 874 CSS px at 3x, so 1206 x 2622 px images. Keep in step with render-mock.py.
VIEWPORT: ViewportSize = {"width": 402, "height": 874}
SCALE = 3


def shifted(body: dict[str, Any], now: float) -> dict[str, Any]:
    """Return a copy of a state body with every time moved by the same amount, so its now is `now`."""
    out = copy.deepcopy(body)
    shift = now - float(body["now"])
    out["now"] = now
    if out["last_report_at"] is not None:
        out["last_report_at"] += shift
    for m in out["milestones"]:
        for key in ("first_report_at", "updated_at", "last_move_at"):
            m[key] += shift
        m["spark"] = [[round(t + shift), v] for t, v in m["spark"]]
    return out


class Board:
    """What the local server answers on the state path. Shared with the server's threads."""

    def __init__(self) -> None:
        """Start with nothing to serve."""
        self.lock = threading.Lock()
        self.example: dict[str, Any] | None = None
        self.offline = False

    def serve(self, name: str) -> None:
        """Answer every later poll with state.<name>.json."""
        body = json.loads((EXAMPLES / f"state.{name}.json").read_text(encoding="utf-8"))
        with self.lock:
            self.example = body
            self.offline = False

    def go_offline(self) -> None:
        """Abort every later poll."""
        with self.lock:
            self.offline = True

    def answer(self) -> bytes | None:
        """The state body to send now, or None to abort the request."""
        with self.lock:
            if self.offline or self.example is None:
                return None
            return json.dumps(shifted(self.example, time.time())).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    """Serves the page's files and the state path, as the Worker's router does (api.md section 3)."""

    board: ClassVar[Board]

    def do_GET(self) -> None:
        """Answer one GET."""
        path = self.path.split("?", 1)[0]
        if path == STATE_PATH:
            body = self.board.answer()
            if body is None:
                self.close_connection = True  # no response at all: the page's fetch fails
                return
            self.send(HTTPStatus.OK, "application/json", body)
            return
        if path == "/":
            self.send(HTTPStatus.OK, "text/html; charset=utf-8", (PUBLIC / "index.html").read_bytes())
            return
        match = ASSET.match(path)
        file = PUBLIC / match["dir"] / f"{match['name']}.{match['ext']}" if match else None
        if match and file is not None and file.is_file():
            self.send(HTTPStatus.OK, CONTENT_TYPES[match["ext"]], file.read_bytes())
            return
        self.send(HTTPStatus.NOT_FOUND, "application/json", b'{"ok":false,"error":"not_found"}')

    def send(self, status: HTTPStatus, content_type: str, body: bytes) -> None:
        """Send a complete no-store response."""
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """Stay quiet; the script prints its own progress."""


def stamp_dpi(f: Path, tries: int = 5) -> None:
    """Rewrite a PNG with 300 DPI metadata, retrying if Windows briefly refuses the write.

    Same as render-mock.py: a fresh PNG is sometimes held for a moment by antivirus or the indexer.
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
    """Turn a display name into a file-name fragment, as render-mock.py does."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def display_name(scenario: str, index: int, key: str) -> str:
    """The file-name fragment for one project display.

    The mock named a display after its project ("FGA T04"); the page titles it project + milestone, and
    a few mock projects carried their milestone in the name. So reuse the mock's own name for the same
    scenario and position when one exists, and fall back to the page's key.
    """
    mock = sorted(MOCK_RENDERS.glob(f"{scenario}-{index:02d}-*-top.png"))
    if len(mock) == 1:
        return mock[0].name[len(f"{scenario}-{index:02d}-") : -len("-top.png")]
    return slug(" ".join(json.loads(key)))


def wait_for_reveal(pg: Page) -> None:
    """Wait for the page's own reveal (concept.md 3.4), then for its 0.2 s fade."""
    pg.wait_for_function("!document.documentElement.classList.contains('loading')", timeout=10_000)
    pg.wait_for_timeout(400)


def shoot_displays(pg: Page, out: Path, scenario: str) -> None:
    """Swipe to each project display, as the page's own scroll does, and shoot its top and bottom."""
    keys: list[str] = pg.evaluate("[...document.querySelectorAll('#pages > section')].map(s => s.dataset.key)")
    for i in range(1, len(keys)):
        name = display_name(scenario, i, keys[i])
        pg.evaluate("i => { const p = document.querySelector('#pages'); p.scrollTo({left: i * p.clientWidth}); }", i)
        pg.wait_for_timeout(250)
        pg.screenshot(path=str(out / f"{scenario}-{i:02d}-{name}-top.png"))
        section = f"document.querySelectorAll('#pages > section')[{i}]"
        if pg.evaluate(f"(e => e.scrollHeight > e.clientHeight + 4)({section})"):
            pg.evaluate(f"{section}.scrollTop = 99999")
            pg.wait_for_timeout(200)
            pg.screenshot(path=str(out / f"{scenario}-{i:02d}-{name}-bottom.png"))
            pg.evaluate(f"{section}.scrollTop = 0")


def render_scenario(pg: Page, out: Path, board: Board, url: str, scenario: tuple[str, str, bool]) -> None:
    """Load the page fresh on one scenario and shoot its screens."""
    name, example, displays = scenario
    board.serve(example)
    if name == "offline":
        pg.clock.install()
    pg.goto(url)
    wait_for_reveal(pg)
    if name == "offline":
        board.go_offline()
        pg.clock.fast_forward(OFFLINE_FOR)
        pg.wait_for_function("document.querySelector('#health b').textContent === 'OFFLINE'", timeout=10_000)
        pg.wait_for_timeout(200)
    pg.screenshot(path=str(out / f"{name}-00-all-projects.png"))
    if displays:
        shoot_displays(pg, out, name)
    print("Rendered", name)


def render(out: Path, chrome: str | None) -> None:
    """Serve public/ locally and screenshot every scenario and project display into out."""
    out.mkdir(parents=True, exist_ok=True)
    board = Board()
    Handler.board = board
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=chrome)
            for scenario in SCENARIOS:
                # A new page each time, so every scenario is a first load with its own reveal.
                pg = b.new_page(viewport=VIEWPORT, device_scale_factor=SCALE, has_touch=True)
                render_scenario(pg, out, board, url, scenario)
                pg.close()
            b.close()
    finally:
        server.shutdown()

    for f in sorted(out.glob("*.png")):
        stamp_dpi(f)
    print(len(list(out.glob("*.png"))), "PNGs in", out)


def main() -> None:
    """Parse the arguments and render."""
    parser = argparse.ArgumentParser(description="Render every page screen to PNG at iPhone 16 Pro size.")
    parser.add_argument(
        "out_dir",
        nargs="?",
        type=Path,
        default=ROOT / "design" / "ui-page",
        help="Output folder (default: design/ui-page)",
    )
    parser.add_argument("--chrome", help="Path to a Chrome executable to use instead of Playwright's Chromium")
    args = parser.parse_args()
    render(args.out_dir, args.chrome)


if __name__ == "__main__":
    main()
