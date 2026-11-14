// MVP-04 A against every golden fixture in contract/fixtures/ (README there).
// A new fixture file MUST get an import and an entry in FIXTURES below.

import { describe, expect, it } from "vitest";
import afternoon from "../../contract/fixtures/afternoon.json" with { type: "json" };
import alldone from "../../contract/fixtures/alldone.json" with { type: "json" };
import allgreen from "../../contract/fixtures/allgreen.json" with { type: "json" };
import keyboard from "../../contract/fixtures/keyboard.json" with { type: "json" };
import midnightRollover from "../../contract/fixtures/midnight-rollover.json" with { type: "json" };
import morning from "../../contract/fixtures/morning.json" with { type: "json" };
import offline from "../../contract/fixtures/offline.json" with { type: "json" };
import oneStory from "../../contract/fixtures/one-story.json" with { type: "json" };
import overCap from "../../contract/fixtures/over-cap.json" with { type: "json" };
import silent from "../../contract/fixtures/silent.json" with { type: "json" };
import stale from "../../contract/fixtures/stale.json" with { type: "json" };
import zeroProgress from "../../contract/fixtures/zero-progress.json" with { type: "json" };
import { THRESHOLDS } from "../../src/contract.ts";
import { computeMetrics, finishedOf, totalOf } from "../../src/metrics/core.ts";
import { cardVerdict } from "../../src/metrics/verdict.ts";
import { type Fixture, mismatches, replay } from "./replay.ts";

const FIXTURES: readonly Fixture[] = [
  afternoon,
  alldone,
  allgreen,
  keyboard,
  midnightRollover,
  morning,
  offline,
  oneStory,
  overCap,
  silent,
  stale,
  zeroProgress,
];

/** The README's frozen keys; every fixture MUST carry them. */
const FROZEN_KEYS = ["rtr", "trend_bin", "projection_hours", "chance_on_time", "call", "too_early"];

const SECONDS_PER_DAY = 86_400;

/** The first report at 2026-11-13 22:40:00 UTC, which the README requires for midnight-rollover. */
const LATE_EVENING_UTC = Date.UTC(2026, 10, 13, 22, 40) / 1000;

/**
 * Two replay clocks: the epoch itself, and LATE_EVENING_UTC, so midnight-rollover's series
 * crosses 00:00 UTC. The metrics MUST NOT depend on which one is used.
 */
const BASES = [
  { label: "epoch 0", base: 0 },
  { label: "22:40 UTC", base: LATE_EVENING_UTC },
];

/** Every expected key the fixture names, computed by MVP-04 A at the newest report's arrival. */
function actualOf(fixture: Fixture, base: number): Record<string, unknown> {
  const { milestone, samples, now } = replay(fixture, base);
  const metrics = computeMetrics(milestone, samples, now, THRESHOLDS);
  const verdict = cardVerdict(milestone, metrics, now, THRESHOLDS);
  return {
    ...metrics,
    finished: finishedOf(milestone.lanes),
    total: totalOf(milestone.lanes),
    stale: verdict.stale,
    stalled: verdict.stalled,
    mode: verdict.mode,
    color: verdict.color,
    reason: verdict.reason,
  };
}

function problemsOf(fixture: Fixture, base: number): string[] {
  const actual = actualOf(fixture, base);
  return Object.entries(fixture.expected).flatMap(([key, value]) =>
    mismatches(actual[key], value, `${fixture.name}.${key}`),
  );
}

describe("golden fixtures, contract/fixtures/", () => {
  it("covers the twelve fixtures of the README's scenario table", () => {
    expect(FIXTURES.map((f) => f.name).toSorted()).toEqual([
      "afternoon",
      "alldone",
      "allgreen",
      "keyboard",
      "midnight-rollover",
      "morning",
      "offline",
      "one-story",
      "over-cap",
      "silent",
      "stale",
      "zero-progress",
    ]);
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.name} carries every frozen key`, () => {
      expect(FROZEN_KEYS.filter((key) => !Object.hasOwn(fixture.expected, key))).toEqual([]);
    });

    for (const { label, base } of BASES) {
      it(`${fixture.name} reproduces every expected value, first report at ${label}`, () => {
        expect(problemsOf(fixture, base)).toEqual([]);
      });

      it(`${fixture.name} is never silent at its newest report, first report at ${label}`, () => {
        // The README measures "now" at the newest report's arrival.
        expect(actualOf(fixture, base).stale).toBe(false);
      });
    }
  }

  it("midnight-rollover crosses 00:00 UTC when the first report is at 22:40 UTC", () => {
    const { samples } = replay(midnightRollover, LATE_EVENING_UTC);
    const days = new Set(samples.map((s) => Math.floor(s.at / SECONDS_PER_DAY)));
    expect(days.size).toBe(2);
  });
});
