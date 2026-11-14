// MVP-04 A: edge cases of computeMetrics (contract/api.md 6.3) that no golden fixture reaches.

import { describe, expect, it } from "vitest";
import {
  type Lanes,
  type Metrics,
  type Sample,
  type StoredMilestone,
  THRESHOLDS,
} from "../../src/contract.ts";
import { callOf, computeMetrics, trendBinOf } from "../../src/metrics/core.ts";

const START = 1_800_000_000;
const MINUTE = 60;

const LANES: Lanes = {
  ready_for_work: 3,
  in_progress: 1,
  needs_terry: 0,
  ready_for_review: 2,
  completed: 0,
};

type Point = readonly [minutes: number, finished: number, clock: number];

/** Enough history, enough samples and enough of the block used: a trend is produced. */
const GOOD: readonly Point[] = [
  [0, 0, 0.05],
  [20, 1, 0.12],
  [40, 1, 0.2],
  [60, 2, 0.3],
];

function milestoneOf(overrides: Partial<StoredMilestone>): StoredMilestone {
  return {
    project: "FGA",
    milestone: "T04",
    agent: "claude",
    active_hours: 2,
    cap_hours: 4,
    lanes: LANES,
    reported_needs_me: null,
    first_report_at: START,
    updated_at: START,
    last_move_at: START,
    ...overrides,
  };
}

/** One sample per point, total 6. */
function seriesOf(points: readonly Point[]): Sample[] {
  return points.map(([minutes, finished, clock]) => ({
    at: START + minutes * MINUTE,
    work: finished / 6,
    clock,
    finished,
    total: 6,
  }));
}

/** GOOD with its newest sample moved to `minutes` after the first. */
function goodEndingAt(minutes: number): Point[] {
  return [...GOOD.slice(0, -1), [minutes, 2, 0.3]];
}

function metricsOf(points: readonly Point[], m: Partial<StoredMilestone> = {}): Metrics {
  return computeMetrics(milestoneOf(m), seriesOf(points), START, THRESHOLDS);
}

describe("work, clock and RTR, api.md 6.3", () => {
  it("come from the stored milestone", () => {
    const m = metricsOf([]);
    expect([m.work, m.clock, m.rtr]).toEqual([2 / 6, 0.5, 2 / 6 / 0.5]);
  });

  it("give null work and RTR when total is 0", () => {
    const empty: Lanes = { ...LANES, ready_for_work: 0, in_progress: 0, ready_for_review: 0 };
    const m = metricsOf([], { lanes: empty });
    expect([m.work, m.rtr, m.too_early]).toEqual([null, null, true]);
  });

  it("give null RTR when clock is 0", () => {
    expect(metricsOf([], { active_hours: 0 }).rtr).toBeNull();
  });

  it("let clock exceed 1", () => {
    expect(metricsOf([], { active_hours: 5 }).clock).toBe(1.25);
  });
});

describe("the too-early gates, concept.md 4.6", () => {
  it("pass for a good series", () => {
    const m = metricsOf(GOOD);
    expect([m.too_early, m.trend?.minutes, m.trend?.recent_done, m.trend?.to_go]).toEqual([
      false,
      60,
      2,
      4,
    ]);
  });

  it("hold back everything with fewer than two samples", () => {
    const m = metricsOf([[0, 1, 0.3]]);
    const held = [m.trend, m.trend_bin, m.projection_hours, m.chance_on_time, m.call];
    expect([m.too_early, ...held]).toEqual([true, null, null, null, null, null]);
  });

  it("hold back with no sample 45 minutes older than the newest", () => {
    const short: Point[] = [
      [0, 0, 0.2],
      [10, 1, 0.22],
      [20, 1, 0.25],
      [44, 2, 0.3],
    ];
    expect(metricsOf(short).too_early).toBe(true);
  });

  it("hold back under 15% of the block used", () => {
    const early: Point[] = [
      [0, 0, 0.02],
      [20, 1, 0.05],
      [40, 1, 0.08],
      [60, 2, 0.14],
    ];
    expect(metricsOf(early).too_early).toBe(true);
  });

  it("hold back with fewer than 4 samples from the comparison sample on", () => {
    const sparse: Point[] = [
      [0, 0, 0.05],
      [30, 1, 0.2],
      [60, 2, 0.3],
    ];
    expect(metricsOf(sparse).too_early).toBe(true);
  });
});

describe("the trend fields, prototype trend_of()", () => {
  it("round minutes as Python's round() does: an exact half goes to the even neighbor", () => {
    const half = metricsOf(goodEndingAt(60.5)).trend?.minutes;
    const odd = metricsOf(goodEndingAt(61.5)).trend?.minutes;
    expect([half, odd]).toEqual([60, 62]);
  });

  it("give null pace, proj, finish and projection when the clock did not move", () => {
    const still: Point[] = [
      [0, 0, 0.3],
      [20, 1, 0.3],
      [40, 1, 0.3],
      [60, 2, 0.3],
    ];
    const m = metricsOf(still);
    const landing = [m.trend?.pace, m.trend?.proj, m.trend?.finish, m.projection_hours];
    expect([m.too_early, ...landing]).toEqual([false, null, null, null, null]);
  });

  it("land the projection at finish times cap_hours", () => {
    const m = metricsOf(GOOD, { cap_hours: 4 });
    expect(m.projection_hours).toBe((m.trend?.finish ?? Number.NaN) * 4);
  });
});

describe("trend bins and the call, concept.md 4.2 and 4.5", () => {
  it("bin inclusively at +-0.05 and +-0.20", () => {
    const deltas = [0.2, 0.19, 0.05, 0.04, 0, -0.04, -0.05, -0.19, -0.2];
    expect(deltas.map(trendBinOf)).toEqual([
      "sharp_up",
      "up",
      "up",
      "flat",
      "flat",
      "flat",
      "down",
      "down",
      "sharp_down",
    ]);
  });

  it("call inclusively at 0.70 and 0.30", () => {
    expect([1, 0.7, 0.69, 0.31, 0.3, 0].map(callOf)).toEqual([
      "on_time",
      "on_time",
      "toss_up",
      "toss_up",
      "running_late",
      "running_late",
    ]);
  });
});
