import { describe, expect, it } from "vitest";
import { renderOverview } from "../../public/js/overview.js";
import type { CardView } from "../../public/js/view.js";
import { card, keyOf, view } from "./overview-stand-ins.ts";

// The overview display (public/js/overview.js). The renderer is pure, so these tests build View
// literals and read the HTML it returns. fitCards, the one function that touches the DOM, is in
// overview-fit.test.ts; done milestones and the GO CODE REVIEW line are in overview-done.test.ts.

const BUTTON =
  /<button class="pc (?<cls>[a-z ]+)" data-go="(?<go>[^"]*)">(?<inner>.*?)<\/button>/gu;
const TITLE = /<b>(?<text>.*?)<\/b>/u;
const GRID = /<div class="(?<cls>cards[a-z ]*)"/u;
const BLURB = /<span>(?<text>.*?)<\/span>/u;

/** A count_and_time card (a small block): 1 of 2 done, 1.5 of 4 hours, under budget. */
function small(over: Partial<CardView> = {}): CardView {
  return card({
    mode: "count_and_time",
    rtr: null,
    dir: null,
    trend: null,
    chance: null,
    finished: 1,
    total: 2,
    activeHours: 1.5,
    capHours: 4,
    reason: "under_budget",
    why: "Under budget",
    ...over,
  });
}

/** A red card that asks for Terry. */
function red(name: string): CardView {
  return card({
    key: keyOf(name),
    title: name,
    level: "red",
    reason: "needs_terry",
    why: "Fix it",
    needsMe: "Fix it",
  });
}

/** One rendered button: its classes, its data-go and its inner HTML. */
interface Button {
  cls: string;
  go: string;
  inner: string;
}

/** Every card button in the HTML, in document order. */
function buttons(cards: CardView[]): Button[] {
  const html = renderOverview(view(cards));
  return [...html.matchAll(BUTTON)].map((m) => ({
    cls: m.groups?.cls ?? "",
    go: m.groups?.go ?? "",
    inner: m.groups?.inner ?? "",
  }));
}

/** The Title line of a button. */
function titleOf(b: Button | undefined): string {
  return TITLE.exec(b?.inner ?? "")?.groups?.text ?? "";
}

/** The Detail blurb of a button, or null when it has none. */
function blurbOf(b: Button | undefined): string | null {
  return BLURB.exec(b?.inner ?? "")?.groups?.text ?? null;
}

/** The Detail blurb of the first button for one card. */
function blurbFor(c: CardView): string | null {
  return blurbOf(buttons([c])[0]);
}

describe("renderOverview: empty, order, escaping", () => {
  it("shows the empty state when there are no cards", () => {
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    expect(renderOverview(view([]))).toBe('<div class="empty">No reports yet today.</div>');
  });

  it("keeps the server's order and does not sort", () => {
    const cards = ["zeta", "Alpha", "mid"].map((n) => card({ key: keyOf(n), title: n }));
    expect(buttons(cards).map(titleOf)).toEqual(["zeta", "Alpha", "mid"]);
  });

  it("sets data-go to the card's own key, escaped for an attribute", () => {
    expect(buttons([card({ key: keyOf("a") })])[0]?.go).toBe("[&quot;a&quot;,&quot;m1&quot;]");
  });

  it("escapes the title and the blurb", () => {
    const [only] = buttons([card({ title: "<b>x</b> & y", level: "yellow", why: '"q" <i>' })]);
    expect(titleOf(only)).toBe("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(blurbOf(only)).toBe("&quot;q&quot; &lt;i&gt;");
  });

  it("never writes the ellipsis glyph into the HTML", () => {
    const html = renderOverview(view([card({ level: "yellow", why: "Running late" }), red("r")]));
    expect(html.includes(String.fromCharCode(0x20_26))).toBe(false);
  });
});

/** The class on the grid element for these cards. */
function gridClass(cards: CardView[]): string {
  return GRID.exec(renderOverview(view(cards)))?.groups?.cls ?? "";
}

/** n ordinary green cards. */
function plain(n: number): CardView[] {
  return Array.from({ length: n }, (_unused, i) => card({ key: keyOf(`p${i}`), title: `p${i}` }));
}

describe("renderOverview: the half class follows the slot count (3/6 grid, UX-141)", () => {
  it("has no half class up to three slots", () => {
    expect(gridClass(plain(1))).toBe("cards");
    expect(gridClass(plain(3))).toBe("cards");
  });

  it("has half from four slots", () => {
    expect(gridClass(plain(4))).toBe("cards half");
    expect(gridClass(plain(7))).toBe("cards half");
  });

  it("counts GO TO KEYBOARD as one slot, however many red cards", () => {
    expect(gridClass([red("r"), ...plain(2)])).toBe("cards");
    expect(gridClass([red("r"), ...plain(3)])).toBe("cards half");
    expect(gridClass([red("r1"), red("r2"), red("r3"), ...plain(2)])).toBe("cards");
  });
});

describe("renderOverview: GO TO KEYBOARD", () => {
  it("is first, opens the first red card, and joins red titles with a middle dot", () => {
    const [first] = buttons([card({ key: keyOf("a"), title: "a" }), red("r1"), red("r2")]);
    expect(first?.cls).toBe("kbd");
    expect(first?.go).toBe(keyOf("r1").replaceAll('"', "&quot;"));
    expect(titleOf(first)).toBe("GO TO KEYBOARD");
    expect(blurbOf(first)).toBe("r1 · r2");
  });

  it("takes red cards out of the list and keeps the rest in order", () => {
    const found = buttons([
      card({ key: keyOf("a"), title: "a" }),
      red("r1"),
      card({ key: keyOf("b"), title: "b" }),
    ]);
    expect(found.map((b) => b.cls)).toEqual(["kbd", "green", "green"]);
    expect(found.map(titleOf)).toEqual(["GO TO KEYBOARD", "a", "b"]);
  });
});

describe("renderOverview: colors and blurbs in ratio mode", () => {
  it("green: class, the RTR, no blurb", () => {
    const [only] = buttons([card()]);
    expect(only?.cls).toBe("green");
    expect(blurbOf(only)).toBeNull();
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    expect(only?.inner).toContain('<div class="rt">1.2<span class="pivot">3<svg class="hand"');
  });

  it("yellow: the words for its reason", () => {
    const [only] = buttons([card({ level: "yellow", reason: "toss_up", why: "Toss-up" })]);
    expect(only?.cls).toBe("yellow");
    expect(blurbOf(only)).toBe("Toss-up");
  });

  it("gray: too early to call, the RTR and no hand", () => {
    const [only] = buttons([
      card({ level: "gray", why: "Too early to call", tooEarly: true, dir: null, trend: null }),
    ]);
    expect(only?.cls).toBe("gray");
    expect(blurbOf(only)).toBe("Too early to call");
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    expect(only?.inner).toContain('<div class="rt">1.2<span class="pivot">3</span></div>');
  });

  it.each([
    [2, "-90deg", "Sharp up"],
    [1, "-45deg", "Up"],
    [0, "0deg", "Flat"],
    [-1, "45deg", "Down"],
    [-2, "90deg", "Sharp down"],
  ] as const)("trend bin %i turns the clock hand to %s (%s)", (dir, angle, name) => {
    const [only] = buttons([card({ dir })]);
    expect(only?.inner).toContain(`style="--a:${angle}"`);
    expect(only?.inner).toContain(`aria-label="${name}"`);
  });
});

describe("renderOverview: count_and_time mode (UX-131)", () => {
  it("shows N of M done and hours of the cap, with no RTR and no hand", () => {
    const [only] = buttons([small()]);
    expect(only?.cls).toBe("green");
    expect(blurbOf(only)).toBe("1 of 2 done · 1.5 of 4.0 hrs");
    expect(only?.inner).not.toContain('class="rt"');
    expect(only?.inner).not.toContain("hand");
  });

  it("keeps the progress blurb when over budget (yellow)", () => {
    const over = small({
      level: "yellow",
      reason: "over_budget",
      why: "Over budget",
      activeHours: 5,
    });
    expect(buttons([over])[0]?.cls).toBe("yellow");
    expect(blurbFor(over)).toBe("1 of 2 done · 5 of 4.0 hrs");
  });

  it("spells hours as the project display does: used to two decimals, the cap to one", () => {
    const blurb = blurbFor(small({ activeHours: 0.75, capHours: 2 }));
    expect(blurb).toBe("1 of 2 done · 0.75 of 2.0 hrs");
  });

  it("gives a done small block no slot, and shows the silence for a silent one", () => {
    expect(buttons([small({ level: "done", reason: "done", why: "Done", finished: 2 })])).toEqual(
      [],
    );
    const silent = small({
      level: "yellow",
      reason: "silent",
      why: "Agent silent for 31m",
      stale: true,
    });
    expect(blurbFor(silent)).toBe("Agent silent for 31m");
  });

  it("sends a red small block to the keyboard slot", () => {
    const found = buttons([
      small({ level: "red", reason: "needs_terry", needsMe: "Pick one", why: "Pick one" }),
    ]);
    expect(found.map((b) => b.cls)).toEqual(["kbd"]);
  });
});
