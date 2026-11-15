import { describe, expect, it } from "vitest";
import { renderOverview } from "../../public/js/overview.js";
import type { CardView } from "../../public/js/view.js";
import { card, keyOf, view } from "./overview-stand-ins.ts";

// Done milestones on the overview (public/js/overview.js; UX-173 to UX-176): they take no slot and are
// counted on the GO CODE REVIEW line, which opens the first of them.

const SLOT = /<button class="pc /gu;
const DONE_LINE =
  /<div class="donebar"><button class="doneline" data-go="(?<go>[^"]*)">(?<text>[^<]*)<\/button><\/div>$/u;

/** A done card for a project name. */
function done(name: string, over: Partial<CardView> = {}): CardView {
  return card({
    key: keyOf(name),
    title: name,
    level: "done",
    reason: "done",
    why: "Done",
    dir: null,
    ...over,
  });
}

/** How many slots the overview draws for these cards. */
function slotCount(cards: CardView[]): number {
  return [...renderOverview(view(cards)).matchAll(SLOT)].length;
}

describe("renderOverview: done milestones and the GO CODE REVIEW line", () => {
  it("gives done milestones no slot and counts them on the line, which opens the first (UX-173, UX-175)", () => {
    const cards = [done("d1"), card({ key: keyOf("a"), title: "a" }), done("d2")];
    expect(slotCount(cards)).toBe(1);
    const line = DONE_LINE.exec(renderOverview(view(cards)));
    expect(line?.groups?.text).toBe("GO CODE REVIEW · 2");
    expect(line?.groups?.go).toContain("d1");
    expect(line?.groups?.go).not.toContain("d2");
  });

  it("opens no GO TO KEYBOARD slot for a done card that still carries an ask (UX-174)", () => {
    const html = renderOverview(view([done("d1", { needsMe: "old ask", rtr: null })]));
    expect(html).not.toContain("GO TO KEYBOARD");
    expect(DONE_LINE.exec(html)?.groups?.text).toBe("GO CODE REVIEW · 1");
  });

  it("does not count a done milestone toward the four-slot threshold (UX-173)", () => {
    const running = ["a", "b", "c"].map((n) => card({ key: keyOf(n), title: n }));
    expect(renderOverview(view([...running, done("d1")]))).toContain('<div class="cards">');
  });

  it("draws no GO CODE REVIEW line while nothing is done (UX-175)", () => {
    expect(renderOverview(view([card()]))).not.toContain("doneline");
  });

  it("reads Nothing running. above the line when every milestone is done (UX-176)", () => {
    const html = renderOverview(view([done("d1")]));
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    const empty = '<div class="empty">Nothing running.</div>';
    expect(html.startsWith(empty)).toBe(true);
    expect(DONE_LINE.exec(html)?.groups?.text).toBe("GO CODE REVIEW · 1");
    expect(html).not.toContain("No reports yet today.");
  });
});
