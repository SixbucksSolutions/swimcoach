#!/usr/bin/env python3
"""Render an execution-plan diagram from its JSON source to a 300 ppi PNG and a vector PDF.

    uv run --no-project --with playwright --with pillow python docs/planning/render-plan.py docs/planning/mvp-plan.json

Writes, next to the JSON, <stem>-execution-plan-legal-<orientation>-300ppi.png and
<stem>-execution-plan-legal-<orientation>.pdf, where <stem> is the JSON name without "-plan" and the
plan's "orientation" is "portrait" (8.5 x 14 in, 2550 x 4200 px) or "landscape" (the default, 14 x 8.5
in, 4200 x 2550 px), both at 300 ppi. The layout follows localswim's execution-plan
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
body{margin:0;width:__W__px;height:__H__px;background:#fff;color:#1D2125;font-family:Inter,sans-serif;position:relative}
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
/* Portrait is too narrow for side-by-side header and footer blocks, so they stack on the left. */
body.portrait .note{left:46px;right:auto;top:122px;text-align:left;line-height:1.5}
body.portrait .foot.r{left:46px;right:auto;bottom:16px}
body.portrait .foot.l{bottom:36px}
</style></head><body><svg id="arrows"></svg><div id="root"></div>
<script>
const P = __PLAN__;
// Page size comes from the plan's orientation. Rows share the height below the header, so a portrait
// page gives each turn more room, and cards grow a little to use it.
const W = __W__, H = __H__, PORTRAIT = H > W, LEFT = PORTRAIT ? 150 : 176, RIGHT = 40, TOP = PORTRAIT ? 176 : 134, GAP = 9;
if (PORTRAIT) document.body.classList.add('portrait');
const CW = PORTRAIT ? 156 : 132, CH = PORTRAIT ? 68 : 60;
const ROWH = Math.min(PORTRAIT ? 190 : 98, Math.floor((H - TOP - (PORTRAIT ? 72 : 56) - GAP * (P.turns.length - 1)) / P.turns.length));
// Columns are plain position slots: any story can sit in any slot, so placement can follow the arrows.
// Color comes from the story's work area, named once in the legend.
// A slot is at most 180 px wide, and the slot grid is centered in the turn rows, so a plan with few
// columns stays compact instead of stretching across the page.
const areas = P.areas, colW = Math.min(PORTRAIT ? 200 : 180, (W - LEFT - RIGHT) / P.slots), area = s => areas.find(a => a.key === s.area);
const GRID_X = LEFT + ((W - LEFT - RIGHT) - colW * P.slots) / 2;
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
  const x = GRID_X + s.slot * colW + (colW - CW) / 2, y = rowY(s.turn) + (ROWH - CH) / 2;
  pos[s.id] = {x, y};
  const color = area(s).color;
  add('<div class="card" style="--c:' + color + ';left:' + x + 'px;top:' + y + 'px;width:' + CW + 'px;height:' + CH + 'px">'
    + '<b>' + s.id + '</b><i>' + s.hours + 'h</i><span>' + s.title + '</span></div>');
});
add('<div class="foot l" style="left:46px">' + P.footer_left + '</div><div class="foot r" style="right:46px">' + P.footer_right + '</div>');
const svg = document.getElementById('arrows');
let defs = '<defs>';
areas.forEach(c => defs += '<marker id="m' + c.key + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + c.color + '"/></marker>');
let body = defs + '</defs>';
// A dependency is an id, or {id, route} with a hand-chosen route (see "routes_note" in the plan JSON).
// Unrouted arrows leave the bottom of their source and land on their own point along the top of the
// target, so several arrows into one story stay distinguishable: a straight line between adjacent turns,
// a dashed line that drops (beside the source when a card is in the way) for skipped turns.
const dep = d => typeof d === 'string' ? {id: d, route: 'auto'} : d;
const outgoing = {}, incoming = {};
P.stories.forEach(s => s.deps.map(dep).filter(d => d.route === 'auto').forEach(d => {
  (outgoing[d.id] = outgoing[d.id] || []).push(s.id); (incoming[s.id] = incoming[s.id] || []).push(d.id); }));
const spread = (list, id, x0) => { const n = list.length, k = list.indexOf(id); return x0 + CW * (k + 1) / (n + 1); };
const INSET = 6;   // corners are rounded; land just inside them
P.stories.forEach(s => s.deps.map(dep).forEach(({id: d, route}) => {
  const a = pos[d], b = pos[s.id], src = P.stories.find(o => o.id === d), c = area(src), skip = s.turn - src.turn > 1;
  const style = '" fill="none" stroke="' + c.color + '" stroke-width="1.6"' + (skip ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#m' + c.key + ')"/>';
  const path = d2 => { body += '<path d="' + d2 + style; };
  const right = b.x > a.x;
  if (route === 'vertical') { const x = Math.max(a.x, b.x) + (Math.min(a.x, b.x) + CW - Math.max(a.x, b.x)) / 2; return path('M' + x + ' ' + (a.y + CH) + ' V' + (b.y - 2)); }
  if (route === 'corner') return path('M' + (right ? a.x + CW - INSET : a.x + INSET) + ' ' + (a.y + CH) + ' L' + (right ? b.x + INSET : b.x + CW - INSET) + ' ' + (b.y - 2));
  if (route === 'elbow') { const x = a.x + CW / 2, y = b.y + CH / 2; return path('M' + x + ' ' + (a.y + CH) + ' V' + y + ' H' + (right ? b.x - 2 : b.x + CW + 2)); }
  if (route === 'left') { const xl = Math.min(a.x, b.x) - 40, ya = a.y + CH / 2, yb = b.y + CH / 2; return path('M' + a.x + ' ' + ya + ' H' + xl + ' V' + yb + ' H' + (b.x - 2)); }
  const outs = outgoing[d].slice().sort((p, q) => pos[p].x - pos[q].x), ins = incoming[s.id].slice().sort((p, q) => pos[p].x - pos[q].x);
  // A routed vertical arrow owns the center of its card's edge, so an automatic arrow at the same edge
  // moves to the quarter point on its own side instead of stacking on it.
  const vOut = P.stories.some(o => o.deps.map(dep).some(e => e.id === d && e.route === 'vertical'));
  const vIn = s.deps.map(dep).some(e => e.route === 'vertical');
  const x1 = vOut ? a.x + CW * (right ? 0.78 : 0.22) : spread(outs, s.id, a.x), y1 = a.y + CH;
  const x2 = vIn ? b.x + CW * (right ? 0.22 : 0.78) : spread(ins, d, b.x), y2 = b.y - 2;
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


# US legal at 96 CSS px per inch: 14 x 8.5 in is 1344 x 816 CSS px. At 3.125x that is 300 ppi.
PAGES = {
    "landscape": {"w": 1344, "h": 816, "pdf_w": "14in", "pdf_h": "8.5in"},
    "portrait": {"w": 816, "h": 1344, "pdf_w": "8.5in", "pdf_h": "14in"},
}


def render(plan_path: Path) -> None:
    """Render one plan JSON to PNG (300 ppi) and PDF beside it, in the plan's orientation."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    orient = plan.get("orientation", "landscape")
    page = PAGES[orient]
    stem = plan_path.stem.removesuffix("-plan")
    html = (PAGE.replace("__PLAN__", json.dumps(plan)).replace("__INTER__", INTER.resolve().as_uri())
            .replace("__W__", str(page["w"])).replace("__H__", str(page["h"])))
    tmp = plan_path.with_suffix(".render.html")
    tmp.write_text(html, encoding="utf-8")
    png = plan_path.with_name(f"{stem}-execution-plan-legal-{orient}-300ppi.png")
    pdf = plan_path.with_name(f"{stem}-execution-plan-legal-{orient}.pdf")
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": page["w"], "height": page["h"]}, device_scale_factor=3.125)
            pg.goto(tmp.resolve().as_uri())
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(png))
            pg.pdf(path=str(pdf), width=page["pdf_w"], height=page["pdf_h"], print_background=True,
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
