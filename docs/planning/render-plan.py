#!/usr/bin/env python3
"""Render an execution-plan diagram from its JSON source to a 300 ppi PNG and a vector PDF.

    uv run --no-project --with playwright --with pillow python docs/planning/render-plan.py docs/planning/mvp-plan.json

Writes, next to the JSON, <stem>-execution-plan-legal-landscape-300ppi.png and
<stem>-execution-plan-legal-landscape.pdf, where <stem> is the JSON name without "-plan". US legal
landscape is 14 x 8.5 in: 4200 x 2550 px at 300 ppi. The layout follows localswim's execution-plan
diagrams: one row per dependency turn, columns as plain position slots (any story in any slot, placed so
arrows run short; color shows the work area, named in a legend), arrows from each story to the work
that depends on it, solid for the next turn and dashed when an arrow skips turns.
"""

import argparse
import json
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
INTER = ROOT / "third_party" / "inter" / "InterVariable-latin.woff2"

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:100 900;src:url("__INTER__") format("woff2")}
*{box-sizing:border-box}
body{margin:0;width:1344px;height:816px;background:#fff;color:#1D2125;font-family:Inter,sans-serif;position:relative}
h1{position:absolute;left:44px;top:26px;margin:0;font-size:34px;font-weight:800;letter-spacing:-.01em}
.sub{position:absolute;left:46px;top:72px;font-size:15px;color:#5A6573}
.note{position:absolute;right:44px;top:34px;text-align:right;font-size:13px;color:#5A6573;line-height:1.7}
.note b{color:#1D2125}
.legend{position:absolute;left:46px;top:100px;font-size:11.5px;color:#5A6573}
.legend b{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 5px -1px 14px}
.row{position:absolute;left:36px;right:36px;border-radius:10px;z-index:0}
.row.odd{background:#F1F4F7} .row.even{background:#F7F9FB}
.tl{position:absolute;left:52px;width:120px;font-size:19px;font-weight:800;z-index:2}
.tl span{display:block;font-size:11px;font-weight:500;color:#5A6573;margin-top:3px}
.tl em{display:block;font-style:normal;font-size:10.5px;font-weight:700;color:#9A6B1F;margin-top:5px;line-height:1.3}
.card{position:absolute;background:#fff;border:2px solid var(--c);border-radius:8px;padding:6px 9px;z-index:2}
.card b{display:block;font-size:14px;font-weight:800}
.card span{display:block;font-size:11.5px;line-height:1.25;color:#3B4550;margin-top:2px;text-wrap:balance}
.card i{position:absolute;right:9px;top:7px;font-style:normal;font-size:11px;color:#5A6573}
.foot{position:absolute;bottom:16px;font-size:11.5px;color:#5A6573}
svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}
</style></head><body><svg id="arrows"></svg><div id="root"></div>
<script>
const P = __PLAN__;
const W = 1344, LEFT = 176, RIGHT = 40, TOP = 134, ROWH = 98, GAP = 9, CW = 132, CH = 60;
// Columns are plain position slots: any story can sit in any slot, so placement can follow the arrows.
// Color comes from the story's work area, named once in the legend.
const areas = P.areas, colW = (W - LEFT - RIGHT) / P.slots, area = s => areas.find(a => a.key === s.area);
const root = document.getElementById('root');
const add = h => root.insertAdjacentHTML('beforeend', h);
add('<h1>' + P.title + '</h1><div class="sub">Epic ' + P.epic + '  /  ' + P.stories.length + ' stories  /  '
  + P.turns.length + ' dependency turns  /  ' + P.subtitle + '</div>');
add('<div class="note">' + P.spec_note + '<br><b>' + P.spec_note_bold + '</b></div>');
add('<div class="legend">Color = work area' + areas.map(a => '<b style="background:' + a.color + '"></b>' + a.label).join('') + '</div>');
const rowY = t => TOP + (t - 1) * (ROWH + GAP);
P.turns.forEach((t, i) => {
  const n = P.stories.filter(s => s.turn === i + 1).length, gate = (P.gates || []).find(g => g.before_turn === i + 1);
  add('<div class="row ' + (i % 2 ? 'even' : 'odd') + '" style="top:' + rowY(i + 1) + 'px;height:' + ROWH + 'px"></div>');
  add('<div class="tl" style="top:' + (rowY(i + 1) + (gate ? 14 : 28)) + 'px">' + t + '<span>' + n + (n === 1 ? ' story' : ' stories') + '</span>'
    + (gate ? '<em>Gate: ' + gate.text + '</em>' : '') + '</div>');
});
const pos = {};
P.stories.forEach(s => {
  const x = LEFT + s.slot * colW + (colW - CW) / 2, y = rowY(s.turn) + (ROWH - CH) / 2;
  pos[s.id] = {x, y};
  const color = area(s).color;
  add('<div class="card" style="--c:' + color + ';left:' + x + 'px;top:' + y + 'px;width:' + CW + 'px;height:' + CH + 'px">'
    + '<b>' + s.id + '</b><i>' + s.hours + 'h</i><span>' + s.title + '</span></div>');
});
add('<div class="foot" style="left:46px">' + P.footer_left + '</div><div class="foot" style="right:46px">' + P.footer_right + '</div>');
const svg = document.getElementById('arrows');
let defs = '<defs>';
areas.forEach(c => defs += '<marker id="m' + c.key + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + c.color + '"/></marker>');
let body = defs + '</defs>';
// Each arrow leaves the bottom of its source and lands on its own point along the top of the target, so
// several arrows into one story stay distinguishable. Adjacent turns: a straight line. Skipped turns: a
// dashed line that drops beside the source column, then runs across just above the target row.
const outgoing = {}, incoming = {};
P.stories.forEach(s => s.deps.forEach(d => { (outgoing[d] = outgoing[d] || []).push(s.id); (incoming[s.id] = incoming[s.id] || []).push(d); }));
const spread = (list, id, x0) => { const n = list.length, k = list.indexOf(id); return x0 + CW * (k + 1) / (n + 1); };
P.stories.forEach(s => s.deps.forEach(d => {
  const a = pos[d], b = pos[s.id], src = P.stories.find(o => o.id === d), c = area(src);
  const outs = outgoing[d].slice().sort((p, q) => pos[p].x - pos[q].x), ins = incoming[s.id].slice().sort((p, q) => pos[p].x - pos[q].x);
  const x1 = spread(outs, s.id, a.x), y1 = a.y + CH, x2 = spread(ins, d, b.x), y2 = b.y - 2, skip = s.turn - src.turn > 1;
  const style = '" fill="none" stroke="' + c.color + '" stroke-width="1.6"' + (skip ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#m' + c.key + ')"/>';
  if (!skip) body += '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + style;
  else {
    // Drop straight down when no card sits below the source in the skipped turns. Otherwise step into
    // the gutter on the target's side first, so the line never passes behind a card. Then run across
    // just above the target row.
    const runY = rowY(s.turn) - GAP / 2;
    const blocked = P.stories.some(o => o.slot === src.slot && o.turn > src.turn && o.turn < s.turn);
    if (!blocked) body += '<path d="M' + x1 + ' ' + y1 + ' V' + runY + ' H' + x2 + ' V' + y2 + style;
    else {
      const stepY = y1 + 10, gutX = x2 > x1 ? a.x + CW + (colW - CW) / 2 : a.x - (colW - CW) / 2;
      body += '<path d="M' + x1 + ' ' + y1 + ' V' + stepY + ' H' + gutX + ' V' + runY + ' H' + x2 + ' V' + y2 + style;
    }
  }
}));
svg.innerHTML = body;
</script></body></html>"""


def render(plan_path: Path) -> None:
    """Render one plan JSON to PNG (300 ppi) and PDF beside it."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    stem = plan_path.stem.removesuffix("-plan")
    html = PAGE.replace("__PLAN__", json.dumps(plan)).replace("__INTER__", INTER.resolve().as_uri())
    tmp = plan_path.with_suffix(".render.html")
    tmp.write_text(html, encoding="utf-8")
    png = plan_path.with_name(f"{stem}-execution-plan-legal-landscape-300ppi.png")
    pdf = plan_path.with_name(f"{stem}-execution-plan-legal-landscape.pdf")
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # 1344 x 816 CSS px at 3.125x is 4200 x 2550 px: US legal landscape at 300 ppi.
            pg = b.new_page(viewport={"width": 1344, "height": 816}, device_scale_factor=3.125)
            pg.goto(tmp.resolve().as_uri())
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(png))
            pg.pdf(path=str(pdf), width="14in", height="8.5in", print_background=True,
                   margin={"top": "0", "right": "0", "bottom": "0", "left": "0"}, scale=0.9997)
            b.close()
    finally:
        tmp.unlink(missing_ok=True)
    with Image.open(png) as im:
        im.load()
        stamped = im.copy()
    stamped.save(png, dpi=(300, 300))
    print("Wrote", png.relative_to(ROOT), stamped.size, "and", pdf.relative_to(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description="Render an execution-plan diagram from JSON.")
    parser.add_argument("plan", type=Path, help="Plan JSON, for example docs/planning/mvp-plan.json")
    args = parser.parse_args()
    render(args.plan.resolve())


if __name__ == "__main__":
    main()
