import { describe, expect, it } from "vitest";
import { reasonPastAsk, wordsFor } from "../../public/js/words.js";

// The card words (public/js/words.js). toView() in state.js runs them over the state examples
// (state.test.ts); these tests walk each api.md 6.6 row directly.

const AGES = { silent: 35 * 60, idle: 52 * 60 };

/** A needs_terry ratio card with nothing else to say: on time. */
const BASE = {
  mode: "ratio",
  stale: false,
  stalled: false,
  call: "on_time",
  tooEarly: false,
  activeHours: 1,
  capHours: 2,
} as const;

describe("wordsFor", () => {
  it.each([
    ["done", "Done"],
    ["silent", "Agent silent for 35m"],
    ["running_late", "Running late"],
    ["stalled", "No ticket moved in 52m"],
    ["toss_up", "Toss-up"],
    ["too_early", "Too early to call"],
    ["on_time", "On time"],
    ["over_budget", "Over budget"],
    ["under_budget", "Under budget"],
  ])("words %s as %s", (reason, want) => {
    expect(wordsFor(reason, null, AGES)).toBe(want);
  });

  it("words needs_terry by its ask, and gives null with no ask or an unknown reason", () => {
    expect(wordsFor("needs_terry", "Pick one", AGES)).toBe("Pick one");
    expect(wordsFor("needs_terry", null, AGES)).toBeNull();
    expect(wordsFor("blocked", "Pick one", AGES)).toBeNull();
  });
});

describe("reasonPastAsk: the first api.md 6.6 row after needs_terry", () => {
  it.each([
    ["a silent agent first", { stale: true, stalled: true, call: "running_late" }, "silent"],
    ["running late before stalled", { stalled: true, call: "running_late" }, "running_late"],
    ["stalled before a toss-up", { stalled: true, call: "toss_up" }, "stalled"],
    ["a toss-up", { call: "toss_up" }, "toss_up"],
    ["too early", { call: null, tooEarly: true }, "too_early"],
    ["on time otherwise", {}, "on_time"],
    ["silent in a small block too", { mode: "count_and_time", stale: true }, "silent"],
    ["over budget", { mode: "count_and_time", activeHours: 2.5 }, "over_budget"],
    ["under budget at the cap", { mode: "count_and_time", activeHours: 2 }, "under_budget"],
    ["no ratio rows in a small block", { mode: "count_and_time", stalled: true }, "under_budget"],
  ] as const)("%s", (_label, patch, want) => {
    expect(reasonPastAsk({ ...BASE, ...patch })).toBe(want);
  });
});
