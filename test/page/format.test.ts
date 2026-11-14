import { describe, expect, it } from "vitest";
import {
  ALL,
  arrow,
  BELL,
  clockRtr,
  dur,
  esc,
  fmtTime,
  hm,
  hoursOfCap,
  LANE_LABELS,
  POLL_MS,
  pct,
  TONE,
  TREND,
} from "../../public/js/format.js";

// The page's shared helpers (public/js/format.js), lifted from the approved mock. Each expectation
// is the mock's own output for the same input.

describe("fmtTime", () => {
  it.each([
    [0, 5, "12:05am"],
    [1, 32, "1:32am"],
    [11, 59, "11:59am"],
    [12, 47, "12:47pm"],
    [23, 0, "11:00pm"],
  ])("writes %i:%i as %s", (hours, minutes, want) => {
    expect(fmtTime(new Date(2026, 10, 13, hours, minutes))).toBe(want);
  });

  it("hm() reads epoch seconds in local time", () => {
    const at = new Date(2026, 10, 13, 14, 7);
    expect(hm(at.getTime() / 1000)).toBe("2:07pm");
  });
});

describe("dur", () => {
  it.each([
    [0, "1m"],
    [29, "1m"],
    [35 * 60, "35m"],
    [3600 + 5 * 60, "1h 05m"],
    [-(52 * 60), "52m"],
    [59 * 60 + 40, "1h 00m"],
    [2 * 3600 + 59 * 60 + 40, "3h 00m"],
  ])("writes %i s as %s", (seconds, want) => {
    expect(dur(seconds)).toBe(want);
  });
});

describe("hoursOfCap", () => {
  it.each([
    [0.75, 2, "0.75 of 2.0"],
    [1.5, 4, "1.5 of 4.0"],
    [2, 6, "2 of 6.0"],
    [2.274, 4.04, "2.27 of 4.0"],
    [0.1 + 0.2, 1.25, "0.3 of 1.3"],
  ])("writes %d of %d hours as %s", (used, cap, want) => {
    expect(hoursOfCap(used, cap)).toBe(want);
  });
});

describe("pct", () => {
  it.each([
    [-0.2, 0],
    [0.374, 37],
    [0.375, 38],
    [1.4, 100],
  ])("clamps and rounds %d to %i", (fraction, want) => {
    expect(pct(fraction)).toBe(want);
  });
});

describe("esc", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(esc(`<b a="1">Tom & Jerry's</b>`)).toBe(
      "&lt;b a=&quot;1&quot;&gt;Tom &amp; Jerry&#39;s&lt;/b&gt;",
    );
  });

  it("writes null and undefined as nothing, and numbers as text", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(4)).toBe("4");
  });
});

describe("the clock hand", () => {
  // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
  const pivot = '<span class="pivot">';

  it("puts the hand around the final digit", () => {
    const html = clockRtr(1.234, 2);
    expect(html.startsWith(`1.2${pivot}3<svg class="hand"`)).toBe(true);
    expect(html).toContain('style="--a:-90deg"');
    expect(html).toContain('aria-label="Sharp up"');
  });

  it("draws no hand without a trend", () => {
    expect(clockRtr(0.5, null)).toBe(`0.5${pivot}0</span>`);
    expect(arrow(null)).toBe("");
  });

  it.each([
    [2, "Sharp up", -90],
    [1, "Up", -45],
    [0, "Flat", 0],
    [-1, "Down", 45],
    [-2, "Sharp down", 90],
  ] as const)("points bin %i (%s) at %i degrees", (dir, name, angle) => {
    expect(TREND[dir]).toEqual([name, angle]);
    expect(arrow(dir)).toContain(`style="transform:rotate(${angle}deg)"`);
  });
});

describe("the constants", () => {
  it("names the lanes in the board's order, with contract/api.md 6.10's words", () => {
    expect(Object.entries(LANE_LABELS)).toEqual([
      ["ready_for_work", "Ready For Work"],
      ["in_progress", "In progress"],
      ["needs_terry", "Needs Terry"],
      ["ready_for_review", "Ready for review"],
      ["completed", "Completed"],
    ]);
  });

  it("maps each level to its palette token", () => {
    expect(TONE).toEqual({
      green: "--ok",
      yellow: "--risk",
      red: "--bad",
      gray: "--dim",
      done: "--done",
    });
  });

  it("keeps ALL apart from every card key, which is a JSON array", () => {
    expect(ALL.startsWith("[")).toBe(false);
    expect(POLL_MS).toBe(30_000);
  });

  it("strikes the bell through only while alerts are off", () => {
    expect(BELL(false)).toContain('<path d="M3 3l18 18"/>');
    expect(BELL(true)).not.toContain('<path d="M3 3l18 18"/>');
  });
});
