// biome-ignore-all lint/security/noSecrets: the expectations are HTML fragments; their punctuation reads as high entropy.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: one file per renderer (t4-interfaces.md); the formatter writes one property per line in the View literals.
import { describe, expect, it } from "vitest";
import { ALL, hm } from "../../public/js/format.js";
import { renderProject } from "../../public/js/project.js";
import type { CardView, View } from "../../public/js/view.js";

// The project display (public/js/project.js): a pure renderer, so every test builds a View literal.

const NOW = 1_800_000_000;

/** Anything outside printable ASCII. */
const NON_ASCII = /[^\x20-\x7e]/u;

function card(over: Partial<CardView> = {}): CardView {
  return {
    key: '["fga","t04"]',
    title: "FGA T04",
    agent: "claude",
    level: "green",
    reason: "on_time",
    why: "On time",
    needsMe: null,
    stale: false,
    silentSeconds: 120,
    mode: "ratio",
    tooEarly: false,
    rtr: 1.23,
    dir: 1,
    trend: { delta: 0.12, minutes: 60, proj: 1.31, recentDone: 3, toGo: 3 },
    chance: 0.8,
    marginSeconds: 4200,
    work: 0.5,
    clock: 0.4,
    finished: 5,
    total: 10,
    activeHours: 2.5,
    capHours: 6,
    lanes: { ready_for_work: 3, in_progress: 2, needs_terry: 0, ready_for_review: 5, completed: 0 },
    spark: [
      [NOW - 7200, 0.8],
      [NOW - 3600, 1.0],
      [NOW, 1.23],
    ],
    updatedAt: NOW - 120,
    lastMoveAt: NOW - 600,
    ...over,
  };
}

function view(cards: CardView[] = []): View {
  return {
    now: NOW,
    lastReportAt: NOW - 120,
    feed: "live",
    thresholds: { staleMinutes: 25, stallMinutes: 45, minHistoryMinutes: 30, minBlockUsed: 0.2 },
    cards,
    asking: 0,
  };
}

function render(c: CardView): string {
  return renderProject(c, view([c]));
}

describe("renderProject header and hero", () => {
  it("links back to the overview with the ALL key and shows the title", () => {
    const html = render(card());
    expect(html).toContain(`<button class="back" data-go="${ALL}">&lsaquo; All projects</button>`);
    expect(html).toContain("<h2>FGA T04</h2>");
  });

  it("escapes the title", () => {
    expect(render(card({ title: "A <b>&" }))).toContain("<h2>A &lt;b&gt;&amp;</h2>");
  });

  it("paints the hero with the level's palette token", () => {
    expect(render(card({ level: "yellow" }))).toContain(
      '<div class="hero" style="--c:var(--risk)">',
    );
    expect(render(card({ level: "red" }))).toContain('style="--c:var(--bad)"');
  });

  it("shows the RTR with a clock hand, its trend name and the why", () => {
    const html = render(card());
    expect(html).toContain('<div class="big">1.2<span class="pivot">3');
    expect(html).toContain('aria-label="Up"');
    expect(html).toContain('<div class="lab">RTR &middot; up<b>On time</b></div>');
  });

  it("omits the trend name when there is no trend", () => {
    const html = render(card({ dir: null, trend: null }));
    expect(html).toContain('<div class="lab">RTR<b>On time</b></div>');
    expect(html).not.toContain('class="hand"');
  });
});

describe("renderProject flags", () => {
  it("shows the needs-you text, escaped, on a red card", () => {
    const html = render(card({ level: "red", needsMe: "Approve <the> plan" }));
    expect(html).toContain(
      '<div class="flag me"><b>Go to keyboard:</b> Approve &lt;the&gt; plan</div>',
    );
  });

  it("shows no needs-you flag otherwise", () => {
    expect(render(card())).not.toContain("flag me");
  });

  it("shows the silent warning with the age from silentSeconds", () => {
    const html = render(card({ stale: true, silentSeconds: 1800 }));
    expect(html).toContain(
      '<div class="flag st">No report for 30m. The monitoring agent may have stopped.</div>',
    );
  });

  it("shows no stale flag on a fresh card", () => {
    expect(render(card())).not.toContain("flag st");
  });
});

describe("renderProject RTR today chart", () => {
  it("draws the 1.00 line, the polyline, and the first and last times", () => {
    const html = render(card());
    expect(html).toContain("<h4>RTR today</h4>");
    expect(html).toContain('<span class="one"');
    expect(html).toContain("<polyline");
    expect(html).toContain(
      `<div class="xax"><span>${hm(NOW - 7200)}</span><span>${hm(NOW)}</span></div>`,
    );
  });

  it("labels the last value only when it is far from 1.00", () => {
    const near = render(
      card({
        spark: [
          [NOW - 60, 0.95],
          [NOW, 1.05],
        ],
      }),
    );
    expect(near).not.toContain('font-weight:700">1.05');
    expect(render(card())).toContain('font-weight:700">1.23</span>');
    const far = render(
      card({
        spark: [
          [NOW - 60, 0.6],
          [NOW, 2.0],
        ],
      }),
    );
    expect(far).toContain('font-weight:700">2.00</span>');
  });

  it("caps plotted values at 3", () => {
    const html = render(
      card({
        spark: [
          [NOW - 60, 1],
          [NOW, 9],
        ],
      }),
    );
    expect(html).toContain('font-weight:700">3.00</span>');
  });

  it("shows the placeholder before the second report", () => {
    const html = render(card({ spark: [[NOW, 1]] }));
    expect(html).toContain(
      '<div class="empty">The RTR timeline appears after the second report.</div>',
    );
    expect(html).not.toContain("<polyline");
  });
});

describe("renderProject projection tiles", () => {
  it("shows the four tiles with the trend numbers", () => {
    const html = render(card());
    expect(html).toContain("<b>80%</b><span>3 landed in last 60m, 3 to go</span>");
    expect(html).toContain("<small>Lands</small><b>1h 10m early</b><span>projected landing</span>");
    expect(html).toContain("<small>RTR at end of block</small><b>1.31</b>");
    expect(html).toContain("<small>RTR trend</small><b>+0.12</b><span>over the last 60m</span>");
  });

  it("clamps the odds to 1..99 and shows a dash when there is none", () => {
    expect(render(card({ chance: 1 }))).toContain("<b>99%</b>");
    expect(render(card({ chance: 0.001 }))).toContain("<b>1%</b>");
    expect(render(card({ chance: null }))).toContain("<small>Chance on time</small><b>&ndash;</b>");
  });

  it("says late, and No progress, from marginSeconds", () => {
    expect(render(card({ marginSeconds: -1800 }))).toContain("<b>30m late</b>");
    const html = render(card({ marginSeconds: null }));
    expect(html).toContain("<b>No progress</b><span>at the recent pace</span>");
  });

  it("shows a dash for a missing projection and a minus sign for a falling trend", () => {
    const html = render(
      card({ trend: { delta: -0.2, minutes: 60, proj: null, recentDone: 0, toGo: 4 } }),
    );
    expect(html).toContain("<small>RTR at end of block</small><b>&ndash;</b>");
    expect(html).toContain("<b>&minus;0.20</b>");
  });

  it("states the gates from view.thresholds when it is too early", () => {
    const c = card({
      level: "gray",
      tooEarly: true,
      trend: null,
      dir: null,
      chance: null,
      marginSeconds: null,
    });
    const html = renderProject(c, view([c]));
    expect(html).toContain("<b>Too early to call</b>");
    expect(html).toContain("Needs 30m of history and 20% of the time block used.");
    expect(html).not.toContain("Chance on time");
  });

  it("shows one Done tile on a done card", () => {
    const html = render(
      card({ level: "done", reason: "done", why: "Done", trend: null, dir: null }),
    );
    expect(html).toContain("<b>Done</b><span>Every ticket in this block is finished.</span>");
  });

  it("falls back to the why when there is neither trend nor gate", () => {
    const html = render(card({ trend: null, dir: null, why: "Toss-up" }));
    expect(html).toContain("<small>The call</small><b>Toss-up</b></div>");
  });
});

describe("renderProject work against time", () => {
  it("shows tickets done of total and hours of the cap", () => {
    const html = render(card());
    expect(html).toContain(
      '<div class="bar"><i style="width:50%"></i></div><div class="cap"><b>5 of 10</b> tickets &middot; 50%</div>',
    );
    expect(html).toContain(
      '<div class="bar t"><i style="width:40%"></i></div><div class="cap"><b>2.5 of 6.0</b> hrs &middot; 40%</div>',
    );
  });

  it("leaves the Work row out when there is no work fraction, and keeps Time", () => {
    const html = render(card({ work: null }));
    expect(html).not.toContain("<label>Work</label>");
    expect(html).toContain("<label>Time</label>");
  });
});

describe("renderProject swimlanes", () => {
  it("shows three rows, board order, with counts and shares", () => {
    const html = render(card());
    const rows = [...html.matchAll(/<li>/gu)];
    expect(rows).toHaveLength(3);
    expect(html.indexOf("Ready For Work")).toBeLessThan(html.indexOf("In progress"));
    expect(html.indexOf("In progress")).toBeLessThan(html.indexOf("Ready for review"));
    expect(html).toContain("Ready For Work<b>3</b><span>30%</span>");
    expect(html).toContain("Ready for review<b>5</b><span>50%</span>");
  });

  it("hides an empty Needs Terry row", () => {
    expect(render(card())).not.toContain("Needs Terry");
  });

  it("shows Needs Terry in red when it holds a ticket", () => {
    const html = render(
      card({
        level: "red",
        lanes: {
          ready_for_work: 1,
          in_progress: 1,
          needs_terry: 2,
          ready_for_review: 6,
          completed: 0,
        },
      }),
    );
    expect(html).toContain(
      '<i style="background:var(--me)"></i>Needs Terry<b>2</b><span>20%</span>',
    );
  });

  it("never shows Completed as a row, even with a count", () => {
    const html = render(
      card({
        lanes: {
          ready_for_work: 1,
          in_progress: 1,
          needs_terry: 0,
          ready_for_review: 1,
          completed: 300,
        },
        total: 303,
      }),
    );
    expect(html).not.toContain("Completed");
    expect([...html.matchAll(/<li>/gu)]).toHaveLength(3);
  });
});

describe("renderProject swimlane colors", () => {
  it("colors done lanes with the display's color on green and yellow only", () => {
    expect(render(card({ level: "green" }))).toContain("var(--ok)");
    expect(render(card({ level: "yellow" }))).toContain(
      '<i style="background:var(--risk)"></i>Ready for review',
    );
    for (const level of ["red", "gray", "done"] as const) {
      expect(render(card({ level }))).toContain(
        '<i style="background:var(--text)"></i>Ready for review',
      );
    }
  });

  it("gives neutral lanes the stack shades in order", () => {
    const html = render(card());
    expect(html).toContain('<i style="background:var(--stack-2)"></i>Ready For Work');
    expect(html).toContain('<i style="background:var(--dim)"></i>In progress');
  });

  it("splits the 100% bar by count and skips empty lanes", () => {
    const html = render(
      card({
        lanes: {
          ready_for_work: 0,
          in_progress: 5,
          needs_terry: 0,
          ready_for_review: 5,
          completed: 0,
        },
      }),
    );
    expect(html).toContain('<div class="stack" style="margin-top:12px">');
    expect(html.match(/flex:\d+ 0 0/gu)).toEqual(["flex:5 0 0", "flex:5 0 0"]);
  });

  it("survives a zero total", () => {
    const html = render(
      card({
        total: 0,
        work: null,
        lanes: {
          ready_for_work: 0,
          in_progress: 0,
          needs_terry: 0,
          ready_for_review: 0,
          completed: 0,
        },
      }),
    );
    expect(html).toContain("Ready For Work<b>0</b><span>0%</span>");
  });
});

describe("renderProject footer", () => {
  it("shows the last move, the report time and the agent", () => {
    const html = render(card({ agent: "codex" }));
    expect(html).toContain(
      `<div class="foot">Last ticket move ${hm(NOW - 600)} &middot; reported ${hm(NOW - 120)} by codex</div>`,
    );
  });

  it("falls back to the report time when no ticket has moved", () => {
    const html = render(card({ lastMoveAt: 0 }));
    expect(html).toContain(`Last ticket move ${hm(NOW - 120)} &middot;`);
  });
});

describe("renderProject small-block (count_and_time) mode", () => {
  const small = card({
    mode: "count_and_time",
    level: "green",
    reason: "under_budget",
    why: "Under budget",
    rtr: null,
    dir: null,
    trend: null,
    chance: null,
    marginSeconds: null,
    finished: 1,
    total: 2,
    work: 0.5,
    clock: 0.25,
    spark: [],
  });

  it("shows the why as the hero, with no RTR number or label", () => {
    const html = render(small);
    expect(html).toContain('<div class="lab"><b>Under budget</b></div>');
    expect(html).not.toContain('class="big"');
    expect(html).not.toContain("RTR");
  });

  it("drops the RTR chart and the projection tiles", () => {
    const html = render(small);
    expect(html).not.toContain("RTR today");
    expect(html).not.toContain("Projection");
    expect(html).not.toContain("Too early");
  });

  it("keeps Work against time, Swimlanes and the footer", () => {
    const html = render(small);
    expect(html).toContain("<h4>Work against time</h4>");
    expect(html).toContain("<h4>Swimlanes</h4>");
    expect(html).toContain('<div class="foot">');
  });

  it("shows the over-budget words on a yellow card", () => {
    const html = render({ ...small, level: "yellow", reason: "over_budget", why: "Over budget" });
    expect(html).toContain("<b>Over budget</b>");
  });
});

describe("renderProject purity and output hygiene", () => {
  it("is deterministic and never mutates its input", () => {
    const c = card();
    const before = JSON.stringify(c);
    expect(render(c)).toBe(render(c));
    expect(JSON.stringify(c)).toBe(before);
  });

  it("emits only ASCII, so no raw ellipsis or look-alike character reaches the page", () => {
    const html = render(card({ stale: true, needsMe: "Plain text" }));
    expect(NON_ASCII.test(html)).toBe(false);
  });
});
