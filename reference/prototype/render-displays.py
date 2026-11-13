# Renders every display of the prototype to PNG: the real page, run against demo data in headless Chrome
# at iPhone 16 size. There are no separate static mockups; this script is the mockup source.
#
# Usage (three terminals, or background the first):
#   python server.py                      (serves http://localhost:8787, creates data/swimcoach.db)
#   python demo.py                        (posts the sample history)
#   python render-displays.py OUT_DIR     (needs: pip install playwright pillow, plus Chrome or `playwright install chromium`)
#
# device_scale_factor=3 gives 1179 px wide images (iPhone 16 native). Each PNG is then stamped at 300 DPI;
# the pixels do not change.
import glob
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

out = sys.argv[1] if len(sys.argv) > 1 else "."
base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8787"

with sync_playwright() as p:
    b = p.chromium.launch()          # or launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    pg = b.new_page(viewport={"width": 393, "height": 760}, device_scale_factor=3, has_touch=True)
    pg.goto(base); pg.wait_for_timeout(1200)

    # Display 1: all projects (with demo data: GO TO KEYBOARD, one gray, two yellow, one green, one red card)
    pg.screenshot(path=f"{out}/display-1-all-projects.png")

    # Displays 2+: one per project, in the page's own (alphabetical) order. keys() and go() are page functions.
    n = pg.evaluate("keys().length")
    for i in range(1, n):
        pg.evaluate(f"go(keys()[{i}], false)"); pg.wait_for_timeout(300)
        name = pg.evaluate(f"keys()[{i}]").replace("demo: ", "").replace(" ", "-")
        pg.screenshot(path=f"{out}/display-project-{name}-top.png")
        pg.evaluate(f"pages.children[{i}].scrollTop = 99999"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{out}/display-project-{name}-bottom.png")
        pg.evaluate(f"pages.children[{i}].scrollTop = 0")

    # Header states: simulate the board being unreachable for 4 minutes (OFFLINE, warning, grayed displays)
    pg.evaluate("go(keys()[0], false)"); pg.wait_for_timeout(200)
    pg.route("**/api/state*", lambda r: r.abort())
    pg.evaluate("lastOk = Date.now() - 4*60*1000; tick()"); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{out}/state-offline.png")
    b.close()

for path in glob.glob(f"{out}/*.png"):
    Image.open(path).save(path, dpi=(300, 300))
