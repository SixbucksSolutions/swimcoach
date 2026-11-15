// The LIVE dot MUST breathe whenever the box says LIVE (Terry, 2026-11-15, card #0051; UX-210). The
// breath is CSS and the LIVE window is JavaScript, so this checks the two against each other: the
// breath MUST outlast the window, the 1 s tick that ends it and the fade that follows. A longer
// window with an unchanged breath fails here instead of leaving LIVE over a still dot.
// biome-ignore lint/correctness/noNodejsModules: test/page runs under Node, and Vitest hands CSS imports over empty, "?raw" included.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FADE_MS } from "../../public/js/health.js";
import { OFFLINE_AFTER_MS } from "../../public/js/poll.js";

const TICK_MS = 1000;
const MS_PER_SECOND = 1000;
const BASE_CSS = readFileSync(new URL("../../public/css/base.css", import.meta.url), "utf8");
const OVERVIEW_CSS = readFileSync(
  new URL("../../public/css/overview.css", import.meta.url),
  "utf8",
);
const DOT =
  /#health\.live i \{\s*animation: breathe (?<seconds>\d+(?:\.\d+)?)s ease-in-out (?<cycles>\d+);/u;
const KBD =
  /#phone\[data-health="live"\] \.pc\.kbd \{\s*animation: throb (?<seconds>\d+(?:\.\d+)?)s ease-in-out (?<cycles>\d+);/u;

/** A breath's length in ms (cycle seconds times cycles), or NaN when the rule is not found. */
function breathMs(css: string, rule: RegExp): number {
  const groups = rule.exec(css)?.groups;
  return Number(groups?.seconds) * MS_PER_SECOND * Number(groups?.cycles);
}

describe("the LIVE dot breathes whenever the box says LIVE", () => {
  it("outlasts the LIVE window, its tick and the fade", () => {
    const dot = breathMs(BASE_CSS, DOT);
    expect(dot, "the dot's breath is in base.css").not.toBeNaN();
    expect(dot).toBeGreaterThan(OFFLINE_AFTER_MS + TICK_MS + FADE_MS);
  });

  it("keeps GO TO KEYBOARD's throb exactly as long, so the two stay in step", () => {
    const kbd = breathMs(OVERVIEW_CSS, KBD);
    expect(kbd, "GO TO KEYBOARD's throb is in overview.css").not.toBeNaN();
    expect(kbd).toBe(breathMs(BASE_CSS, DOT));
  });
});
