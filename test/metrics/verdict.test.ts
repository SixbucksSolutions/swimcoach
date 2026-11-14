// biome-ignore-all lint/correctness/useImportExtensions: Biome asks for ".ts" on every relative import, and tsc refuses ".ts" on a value import (TS5097) because tsconfig.json does not set allowImportingTsExtensions. Extensionless is what moduleResolution "Bundler" expects. Reported to the Lead (MVP-04 A hand-off).

// MVP-04 A: the card verdict, contract/api.md 6.2 (stale, stalled), 6.4, 6.5 and 6.6.

import { describe, expect, it } from "vitest";
import {
  type CardVerdict,
  type Color,
  type Lanes,
  type Metrics,
  type Reason,
  type StoredMilestone,
  THRESHOLDS,
  type Thresholds,
} from "../../src/contract";
import { cardVerdict, needsMeOf } from "../../src/metrics/verdict";

const NOW = 1_800_000_000;
const MINUTE = 60;

const FIVE: Lanes = {
  ready_for_work: 2,
  in_progress: 1,
  needs_terry: 0,
  ready_for_review: 2,
  completed: 0,
};

const ONE: Lanes = {
  ready_for_work: 0,
  in_progress: 1,
  needs_terry: 0,
  ready_for_review: 0,
  completed: 0,
};

function milestoneOf(overrides: Partial<StoredMilestone>): StoredMilestone {
  return {
    project: "FGA",
    milestone: "T04",
    agent: "claude",
    active_hours: 1,
    cap_hours: 4,
    lanes: FIVE,
    reported_needs_me: null,
    first_report_at: NOW - 120 * MINUTE,
    updated_at: NOW,
    last_move_at: NOW,
    ...overrides,
  };
}

function metricsOf(overrides: Partial<Metrics>): Metrics {
  return {
    work: 0.4,
    clock: 0.25,
    rtr: 1.6,
    too_early: false,
    trend: null,
    trend_bin: "flat",
    projection_hours: null,
    chance_on_time: 0.9,
    call: "on_time",
    ...overrides,
  };
}

function verdictOf(m: Partial<StoredMilestone>, metrics: Partial<Metrics> = {}): CardVerdict {
  return cardVerdict(milestoneOf(m), metricsOf(metrics), NOW, THRESHOLDS);
}

type Row = readonly [string, Partial<StoredMilestone>, Partial<Metrics>, Color, Reason];

/** api.md 6.6 in ratio mode: each case proves one row and that it outranks the next. */
const RATIO_ROWS: readonly Row[] = [
  [
    "done beats needs_me",
    {
      lanes: { ...FIVE, ready_for_work: 0, in_progress: 0, completed: 3 },
      reported_needs_me: "Look",
    },
    {},
    "done",
    "done",
  ],
  [
    "needs_me beats silent",
    { reported_needs_me: "Look", updated_at: NOW - 60 * MINUTE },
    {},
    "red",
    "needs_terry",
  ],
  [
    "silent beats running_late",
    { updated_at: NOW - 30 * MINUTE },
    { call: "running_late" },
    "yellow",
    "silent",
  ],
  [
    "running_late beats stalled",
    { last_move_at: NOW - 60 * MINUTE },
    { call: "running_late" },
    "yellow",
    "running_late",
  ],
  ["over_budget does not apply", { active_hours: 5 }, {}, "green", "on_time"],
  [
    "stalled beats toss_up",
    { last_move_at: NOW - 60 * MINUTE },
    { call: "toss_up" },
    "yellow",
    "stalled",
  ],
  ["toss_up", {}, { call: "toss_up" }, "yellow", "toss_up"],
  [
    "too_early is gray",
    {},
    { too_early: true, trend_bin: null, chance_on_time: null, call: null },
    "gray",
    "too_early",
  ],
  ["on_time otherwise", {}, {}, "green", "on_time"],
];

/** api.md 6.6 in count_and_time mode (decision D1). */
const COUNT_ROWS: readonly Row[] = [
  ["done", { lanes: { ...ONE, in_progress: 0, completed: 1 } }, {}, "done", "done"],
  [
    "Needs Terry is red",
    { lanes: { ...ONE, in_progress: 0, needs_terry: 1 } },
    {},
    "red",
    "needs_terry",
  ],
  ["silent", { lanes: ONE, updated_at: NOW - 30 * MINUTE }, {}, "yellow", "silent"],
  [
    "over budget",
    { lanes: ONE, active_hours: 4.5 },
    { call: "running_late" },
    "yellow",
    "over_budget",
  ],
  [
    "exactly at the cap is under budget",
    { lanes: ONE, active_hours: 4 },
    { call: "running_late" },
    "green",
    "under_budget",
  ],
  [
    "stalled, the call and too_early do not apply",
    { lanes: ONE, last_move_at: NOW - 90 * MINUTE },
    { call: "running_late", too_early: true },
    "green",
    "under_budget",
  ],
];

describe("needs_me, api.md 6.4", () => {
  it("is the report's own text when it sent one", () => {
    expect(needsMeOf(milestoneOf({ reported_needs_me: "Approve the demo" }))).toBe(
      "Approve the demo",
    );
  });

  it("is the server's singular sentence for one card in Needs Terry", () => {
    const m = milestoneOf({ lanes: { ...FIVE, needs_terry: 1 } });
    expect(needsMeOf(m)).toBe("1 ticket in Needs Terry");
  });

  it("is the server's plural sentence for several cards", () => {
    const m = milestoneOf({ lanes: { ...FIVE, needs_terry: 3 } });
    expect(needsMeOf(m)).toBe("3 tickets in Needs Terry");
  });

  it("prefers the report's text over the server's sentence", () => {
    const m = milestoneOf({ reported_needs_me: "Cut over", lanes: { ...FIVE, needs_terry: 2 } });
    expect(needsMeOf(m)).toBe("Cut over");
  });

  it("is null otherwise", () => {
    expect(needsMeOf(milestoneOf({}))).toBeNull();
  });
});

describe("stale and stalled, api.md 6.2", () => {
  it("are false at exactly the threshold", () => {
    const v = verdictOf({ updated_at: NOW - 25 * MINUTE, last_move_at: NOW - 45 * MINUTE });
    expect([v.stale, v.stalled]).toEqual([false, false]);
  });

  it("are true one second past the threshold", () => {
    const v = verdictOf({ updated_at: NOW - 25 * MINUTE - 1, last_move_at: NOW - 45 * MINUTE - 1 });
    expect([v.stale, v.stalled]).toEqual([true, true]);
  });

  it("are false once the milestone is done", () => {
    const v = verdictOf({
      lanes: { ...FIVE, ready_for_work: 0, in_progress: 0, completed: 3 },
      updated_at: NOW - 600 * MINUTE,
      last_move_at: NOW - 600 * MINUTE,
    });
    expect([v.stale, v.stalled, v.color, v.reason]).toEqual([false, false, "done", "done"]);
  });

  it("follow the thresholds passed in", () => {
    const tight: Thresholds = { ...THRESHOLDS, stale_minutes: 1, stall_minutes: 2 };
    const m = milestoneOf({ updated_at: NOW - 90, last_move_at: NOW - 150 });
    const v = cardVerdict(m, metricsOf({}), NOW, tight);
    expect([v.stale, v.stalled]).toEqual([true, true]);
  });
});

describe("mode, api.md 6.5 (decision D1)", () => {
  it("is count_and_time below 3 stories", () => {
    const two = { ...FIVE, ready_for_work: 0, ready_for_review: 1 };
    expect(verdictOf({ lanes: two }).mode).toBe("count_and_time");
  });

  it("is ratio from 3 stories", () => {
    const three = { ...FIVE, ready_for_work: 1, ready_for_review: 1 };
    expect(verdictOf({ lanes: three }).mode).toBe("ratio");
  });
});

describe("color and reason in ratio mode, api.md 6.6", () => {
  for (const [title, m, metrics, color, reason] of RATIO_ROWS) {
    it(title, () => {
      const v = verdictOf(m, metrics);
      expect([v.mode, v.color, v.reason]).toEqual(["ratio", color, reason]);
    });
  }
});

describe("color and reason in count_and_time mode, api.md 6.6 and D1", () => {
  for (const [title, m, metrics, color, reason] of COUNT_ROWS) {
    it(title, () => {
      const v = verdictOf(m, metrics);
      expect([v.mode, v.color, v.reason]).toEqual(["count_and_time", color, reason]);
    });
  }
});
