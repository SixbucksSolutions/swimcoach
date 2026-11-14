import { describe, expect, it } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import alldone from "../../contract/schemas/examples/state.alldone.json" with { type: "json" };
import empty from "../../contract/schemas/examples/state.empty.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import stale from "../../contract/schemas/examples/state.stale.json" with { type: "json" };
import { needKeys } from "../../public/js/alerts.js";
import { healthOf } from "../../public/js/main.js";
import { titleOf } from "../../public/js/nav.js";
import { mayReload, outcomeOf } from "../../public/js/poll.js";
import { toView } from "../../public/js/state.js";
import type { View } from "../../public/js/view.js";

// The controller's pure parts: the health box (concept.md 3.1, api.md 6.7), sign-in failures
// (api.md 2), the title and the ask keys. The controller itself, in the page shell, is tested in
// controller.test.ts.

const T0 = 1_800_000_000_000; // the page clock, in ms
const SEC = 1000;
const ELLIPSIS = String.fromCharCode(8230); // U+2026

/** A View (the afternoon one by default) with its newest report ageSeconds old at its own now. */
function aged(ageSeconds: number, body: unknown = afternoon): View {
  const view = toView(body);
  return { ...view, lastReportAt: view.now - ageSeconds };
}

/** An age to the millisecond, so float noise in the examples' times does not matter. */
function rounded(seconds: number | null): number | null {
  if (seconds === null) {
    return null;
  }
  return Math.round(seconds * 1000) / 1000;
}

/** The OFFLINE warning over an old board. */
function gone(age: string): string {
  return `Can't reach the board for ${age}. Everything below is old.`;
}

/** The STALE warning. */
function quiet(age: string): string {
  return `No agent has reported for ${age}. Everything below is old.`;
}

describe("healthOf", () => {
  it.each([
    ["before the first poll", null, 0, ["wait", ELLIPSIS, null, ""]],
    ["30 s into a first poll", null, 30, ["wait", ELLIPSIS, null, ""]],
    [
      "a board that never answered",
      null,
      30.001,
      ["off", "OFFLINE", 30.001, "Can't reach the board for 1m."],
    ],
    ["2 minutes after a report", aged(120), 5, ["live", "LIVE", 125, ""]],
    ["30 s after the last good poll", aged(60), 30, ["live", "LIVE", 90, ""]],
    ["4 minutes after the last good poll", aged(60), 240, ["off", "OFFLINE", 240, gone("4m")]],
    ["24m 59s after a report", aged(24 * 60 + 50), 9, ["live", "LIVE", 1499, ""]],
    ["aging past 25 minutes", aged(24 * 60 + 50), 11, ["stale", "STALE", 1501, quiet("25m")]],
    ["the stale example", toView(stale), 0, ["stale", "STALE", 2100.133, quiet("35m")]],
    // An empty or all-done board with working polls reads LIVE (UX-136, UX-137, UX-138; Terry,
    // 2026-11-14).
    ["every milestone done (feed idle)", toView(alldone), 0, ["live", "LIVE", 0.902, ""]],
    ["every milestone done, an hour on", aged(3600, alldone), 0, ["live", "LIVE", 3600, ""]],
    ["an empty board (feed no_data)", toView(empty), 0, ["live", "LIVE", null, ""]],
    [
      "an empty board, 30 s after the last good poll",
      toView(empty),
      30,
      ["live", "LIVE", null, ""],
    ],
    ["an empty board, unreachable", toView(empty), 31, ["off", "OFFLINE", 31, gone("1m")]],
  ] as const)("%s", (_label, view, seconds, [st, label, age, msg]) => {
    const h = healthOf(view, T0, T0 + seconds * SEC);
    expect([h.st, h.label, rounded(h.age), h.msg]).toEqual([st, label, age, msg]);
  });
});

describe("outcomeOf: a sign-in failure is not OFFLINE noise", () => {
  it.each([
    ["opaqueredirect", 0, false, "auth"],
    ["basic", 401, false, "auth"],
    ["basic", 403, false, "auth"],
    ["basic", 200, true, "ok"],
    ["basic", 404, false, "fail"],
    ["basic", 500, false, "fail"],
    ["basic", 502, false, "fail"],
  ] as const)("%s %i is %s", (type, status, ok, want) => {
    expect(outcomeOf({ type, status, ok })).toBe(want);
  });
});

describe("mayReload, titleOf and needKeys", () => {
  it.each([
    ["no reload yet", null, true],
    ["an unreadable record", Number.NaN, true],
    ["a reload a minute ago", T0 - 60 * SEC, false],
    ["a reload five minutes ago", T0 - 5 * 60 * SEC, true],
    ["a reload in the future (clock change)", T0 + SEC, true],
  ])("may reload after %s: %s", (_label, last, want) => {
    expect(mayReload(last, T0)).toBe(want);
  });

  it("titles the tab swimcoach, with the count while cards ask", () => {
    expect([titleOf(0), titleOf(2)]).toEqual(["swimcoach", "(2) swimcoach"]);
  });

  it("keys each ask by card and words", () => {
    expect([...needKeys(toView(keyboard))]).toEqual([
      `${JSON.stringify(["localswim v2", "t06"])}|1 ticket in Needs Terry`,
      `${JSON.stringify(["search-index", "t03"])}|Pick an index strategy: per-tenant or shared`,
    ]);
    expect(needKeys(toView(alldone)).size).toBe(0);
  });
});
