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
// biome-ignore lint/correctness/useImportExtensions: tsc rejects a .ts extension on a value import (TS5097) while tsconfig.json leaves allowImportingTsExtensions off.
import { chanceToFinish, logGamma } from "../../src/metrics/chance";
import prototype from "./chance-prototype.json" with { type: "json" };

// contract/fixtures/README.md: numbers compare with an absolute tolerance of 1e-9.
const FIXTURE_TOLERANCE = 1e-9;
// The prototype table holds CPython 3.15.2's own results on Windows. Measured 2026-11-13: 210 of 247
// chance rows and 161 of 165 lgamma rows match bit for bit; the largest chance difference is 1.4e-15.
// The rest differ because V8's Math.log and the Windows C library's log round some arguments 1 ulp
// apart: log(22.44303822619783) is 3.110980464813971 in V8 and 3.1109804648139705 in CPython. The
// algorithm itself is exact: replaying m_lgamma in Python with math.log matches math.lgamma on all
// 153 points tried.
const PROTOTYPE_TOLERANCE = 1e-14;

// The prototype's tunables at their defaults, as contract/fixtures/README.md pins them.
const TREND_SECONDS = 60 * 60;
const MIN_HISTORY_SECONDS = 45 * 60;

interface Lanes {
  readonly ready_for_work: number;
  readonly in_progress: number;
  readonly needs_terry: number;
  readonly ready_for_review: number;
  readonly completed: number;
}

interface Fixture {
  readonly name: string;
  readonly cap_hours: number;
  readonly samples: readonly {
    readonly at_hours: number;
    readonly active_hours: number;
    readonly lanes: Lanes;
  }[];
  readonly expected: {
    readonly chance_on_time: number | null;
    readonly clock: number;
    readonly trend: {
      readonly minutes: number;
      readonly recent_done: number;
      readonly to_go: number;
    } | null;
  };
}

interface Stored {
  readonly seconds: number;
  readonly clock: number;
  readonly done: number;
  readonly total: number;
}

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

/** The samples the prototype stores: one per report that has a total and a clock (progress()). */
function storedSamples(fixture: Fixture): Stored[] {
  return fixture.samples
    .map((sample) => {
      const { lanes } = sample;
      const total =
        lanes.ready_for_work +
        lanes.in_progress +
        lanes.needs_terry +
        lanes.ready_for_review +
        lanes.completed;
      return {
        seconds: sample.at_hours * 3600,
        clock: sample.active_hours / fixture.cap_hours,
        done: lanes.ready_for_review + lanes.completed,
        total,
      };
    })
    .filter((sample) => sample.total > 0 && sample.clock > 0);
}

/** How far a sample's age is from the 60-minute look-back: trend_of()'s key for min(). */
function distanceFromWindow(newest: Stored, sample: Stored): number {
  return Math.abs(newest.seconds - sample.seconds - TREND_SECONDS);
}

/** trend_of()'s comparison sample: at least 45 minutes back, the one closest to 60 minutes back. */
function comparisonSample(stored: readonly Stored[], newest: Stored): Stored {
  let best: Stored | undefined;
  for (const sample of stored.slice(0, -1)) {
    const oldEnough = newest.seconds - sample.seconds >= MIN_HISTORY_SECONDS;
    // Python's min() keeps the first of equal keys, so only a strictly closer sample replaces it.
    if (
      oldEnough &&
      (best === undefined || distanceFromWindow(newest, sample) < distanceFromWindow(newest, best))
    ) {
      best = sample;
    }
  }
  if (best === undefined) {
    throw new Error("No comparison sample, yet the fixture has a trend");
  }
  return best;
}

type Trend = NonNullable<Fixture["expected"]["trend"]>;

function trendOf(fixture: Fixture): Trend {
  const { trend } = fixture.expected;
  if (trend === null) {
    throw new Error(`${fixture.name} has no trend`);
  }
  return trend;
}

const WITH_TREND = FIXTURES.filter((fixture) => fixture.expected.trend !== null);
const WITHOUT_TREND = FIXTURES.filter((fixture) => fixture.expected.trend === null);

describe("chanceToFinish reproduces every golden fixture", () => {
  it("has fixtures on both sides of the too-early gate", () => {
    expect(WITH_TREND.length).toBeGreaterThan(0);
    expect(WITHOUT_TREND.length).toBeGreaterThan(0);
  });

  // api.md 6.3: no trend, no chance. The function is not called.
  it.each(WITHOUT_TREND.map((fixture) => [fixture.name, fixture] as const))(
    "%s is too early, so it has no chance",
    (_, fixture) => {
      expect(fixture.expected.chance_on_time).toBeNull();
    },
  );

  it.each(WITH_TREND.map((fixture) => [fixture.name, fixture] as const))("%s", (_, fixture) => {
    const { expected } = fixture;
    const trend = trendOf(fixture);
    const stored = storedSamples(fixture);
    const newest = stored.at(-1);
    if (newest === undefined) {
      throw new Error("A fixture with a trend has stored samples");
    }
    const older = comparisonSample(stored, newest);
    // The derivation picked the same comparison sample as the prototype did.
    expect(Math.round((newest.seconds - older.seconds) / 60)).toBe(trend.minutes);
    expect(Math.max(0, newest.done - older.done)).toBe(trend.recent_done);
    expect(newest.total - newest.done).toBe(trend.to_go);
    expect(newest.clock).toBe(expected.clock);

    // api.md 6.3: chance_to_finish(recent_done, clock span, to_go, 1 - clock).
    const chance = chanceToFinish(
      trend.recent_done,
      expected.clock - older.clock,
      trend.to_go,
      1 - expected.clock,
    );
    expect(expected.chance_on_time).not.toBeNull();
    expect(Math.abs(chance - (expected.chance_on_time ?? Number.NaN))).toBeLessThanOrEqual(
      FIXTURE_TOLERANCE,
    );
  });
});

describe("chanceToFinish matches the prototype's chance_to_finish()", () => {
  it.each(prototype.chance)(
    "$case: ($recent_done, $span, $to_go, $remaining)",
    ({ recent_done, span, to_go, remaining, chance }) => {
      const port = chanceToFinish(recent_done, span, to_go, remaining);
      expect(Math.abs(port - chance)).toBeLessThanOrEqual(PROTOTYPE_TOLERANCE);
    },
  );

  it("covers the edge cases the interfaces document names", () => {
    const cases = new Set(prototype.chance.map((row) => row.case));
    for (const name of ["zero span", "zero to go", "no time left", "large counts, equal"]) {
      expect(cases).toContain(name);
    }
  });
});

describe("logGamma matches Python's math.lgamma", () => {
  it.each(prototype.lgamma)("lgamma($x)", ({ x, lgamma }) => {
    expect(Math.abs(logGamma(x) - lgamma)).toBeLessThanOrEqual(
      PROTOTYPE_TOLERANCE * Math.max(1, Math.abs(lgamma)),
    );
  });

  it("gives Infinity at the poles, where Python raises", () => {
    expect(logGamma(0)).toBe(Number.POSITIVE_INFINITY);
    expect(logGamma(-3)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("chanceToFinish where the prototype raises", () => {
  it("gives 0 when the time left is too small to move p off 1", () => {
    expect(chanceToFinish(3, 1, 2, 1e-20)).toBe(0);
  });

  it("gives 1 when the span is too small to move p off 0", () => {
    expect(chanceToFinish(3, Number.MIN_VALUE, 2, 1)).toBe(1);
  });
});
