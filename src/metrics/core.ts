// biome-ignore-all lint/correctness/useImportExtensions: Biome asks for ".ts" on every relative import, and tsc refuses ".ts" on a value import (TS5097) because tsconfig.json does not set allowImportingTsExtensions. Extensionless is what moduleResolution "Bundler" expects. Reported to the Lead (MVP-04 A hand-off).

// The metric math of contract/api.md 6.3: pure, no I/O, values never rounded.
// The trend is the prototype's trend_of() (reference/prototype/server.py) field for field, with
// the "too early to call" gates of docs/concept.md 4.6.

import type {
  Call,
  EpochSeconds,
  Lanes,
  Metrics,
  Sample,
  StoredMilestone,
  Thresholds,
  Trend,
  TrendBin,
} from "../contract";
import { chanceToFinish } from "./chance";

const SECONDS_PER_MINUTE = 60;

/** Trend bins, docs/concept.md 4.2. */
const BIN_SHARP = 0.2;
const BIN_PLAIN = 0.05;

/** Call cutoffs, docs/concept.md 4.5. */
const CALL_ON_TIME = 0.7;
const CALL_LATE = 0.3;

/**
 * Too-early gate, docs/concept.md 4.6: at least this many samples from the comparison sample
 * through the newest, both included, as trend_of() counts them (contract/fixtures/README.md,
 * "Open for Terry" item 3). It is not one of the six thresholds of api.md 6.8, so it is a constant.
 */
const MIN_SAMPLES_IN_SPAN = 4;

/**
 * Python's round() to an integer: an exact half goes to the even neighbor. trend_of() rounds
 * `minutes` this way, and Math.round() would differ on an exact half.
 */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) {
    return floor + 1;
  }
  if (diff < 0.5 || floor % 2 === 0) {
    return floor;
  }
  return floor + 1;
}

/** The sample trend_of() compares against: closest to `trend_minutes` back; the first wins a tie. */
function comparisonSample(
  older: readonly Sample[],
  newestAt: EpochSeconds,
  window: number,
): Sample {
  let best = older[0] as Sample;
  for (const s of older) {
    if (Math.abs(newestAt - s.at - window) < Math.abs(newestAt - best.at - window)) {
      best = s;
    }
  }
  return best;
}

/** The pace, proj and finish fields of trend_of(), from the comparison and newest samples. */
function landingOf(base: Sample, newest: Sample): Pick<Trend, "finish" | "pace" | "proj"> {
  if (newest.clock <= base.clock) {
    return { pace: null, proj: null, finish: null };
  }
  const pace = Math.max(0, (newest.work - base.work) / (newest.clock - base.clock));
  let proj: number | null = null;
  if (newest.clock < 1) {
    proj = newest.work + pace * (1 - newest.clock);
  }
  let finish: number | null = null;
  if (newest.work >= 1) {
    finish = newest.clock;
  } else if (pace > 0) {
    finish = newest.clock + (1 - newest.work) / pace;
  }
  return { pace, proj, finish };
}

interface TrendWithChance {
  readonly trend: Trend;
  readonly chance: number;
}

/**
 * The prototype's trend_of(), samples oldest first. Returns null while any too-early gate of
 * concept.md 4.6 fails. The chance travels beside the trend, as trend_of()'s `chance` key does.
 */
function trendOf(samples: readonly Sample[], t: Thresholds): TrendWithChance | null {
  const newest = samples.at(-1);
  if (samples.length < 2 || newest === undefined) {
    return null;
  }
  const history = t.min_history_minutes * SECONDS_PER_MINUTE;
  const older = samples.slice(0, -1).filter((s) => newest.at - s.at >= history);
  if (older.length === 0 || newest.clock < t.min_block_used) {
    return null;
  }
  const base = comparisonSample(older, newest.at, t.trend_minutes * SECONDS_PER_MINUTE);
  if (samples.filter((s) => s.at >= base.at).length < MIN_SAMPLES_IN_SPAN) {
    return null;
  }
  const recentDone = Math.max(0, newest.finished - base.finished);
  const toGo = newest.total - newest.finished;
  return {
    trend: {
      delta: newest.work / newest.clock - base.work / base.clock,
      minutes: roundHalfEven((newest.at - base.at) / SECONDS_PER_MINUTE),
      ...landingOf(base, newest),
      recent_done: recentDone,
      to_go: toGo,
    },
    chance: chanceToFinish(recentDone, newest.clock - base.clock, toGo, 1 - newest.clock),
  };
}

/** Cards finished: `ready_for_review + completed` (api.md 6.2). */
export function finishedOf(lanes: Lanes): number {
  return lanes.ready_for_review + lanes.completed;
}

/** Cards counted: the sum of all five lanes (api.md 6.2). */
export function totalOf(lanes: Lanes): number {
  return (
    lanes.ready_for_work +
    lanes.in_progress +
    lanes.needs_terry +
    lanes.ready_for_review +
    lanes.completed
  );
}

/** "Done" in api.md 6.2: `total > 0` and `finished == total`. */
export function isDone(lanes: Lanes): boolean {
  const total = totalOf(lanes);
  return total > 0 && finishedOf(lanes) === total;
}

/** The five arrows of docs/concept.md 4.2. */
export function trendBinOf(delta: number): TrendBin {
  if (delta >= BIN_SHARP) {
    return "sharp_up";
  }
  if (delta >= BIN_PLAIN) {
    return "up";
  }
  if (delta <= -BIN_SHARP) {
    return "sharp_down";
  }
  if (delta <= -BIN_PLAIN) {
    return "down";
  }
  return "flat";
}

/** The call of docs/concept.md 4.5. */
export function callOf(chance: number): Call {
  if (chance >= CALL_ON_TIME) {
    return "on_time";
  }
  if (chance <= CALL_LATE) {
    return "running_late";
  }
  return "toss_up";
}

/**
 * The metric math of api.md 6.3 for one milestone. `samples` are all its stored samples, oldest
 * first, with no day boundary (api.md 6.9). No metric depends on the request's clock, so `_now`
 * is unused; it stays in the frozen signature so a later rule can read it without a contract change.
 */
export function computeMetrics(
  m: StoredMilestone,
  samples: readonly Sample[],
  _now: EpochSeconds,
  t: Thresholds,
): Metrics {
  const total = totalOf(m.lanes);
  const clock = m.active_hours / m.cap_hours;
  let work: number | null = null;
  let rtr: number | null = null;
  if (total > 0) {
    work = finishedOf(m.lanes) / total;
    if (clock > 0) {
      rtr = work / clock;
    }
  }

  const found = trendOf(samples, t);
  if (found === null) {
    return {
      work,
      clock,
      rtr,
      too_early: true,
      trend: null,
      trend_bin: null,
      projection_hours: null,
      chance_on_time: null,
      call: null,
    };
  }
  const { trend, chance } = found;
  let projection: number | null = null;
  if (trend.finish !== null) {
    projection = trend.finish * m.cap_hours;
  }
  return {
    work,
    clock,
    rtr,
    too_early: false,
    trend,
    trend_bin: trendBinOf(trend.delta),
    projection_hours: projection,
    chance_on_time: chance,
    call: callOf(chance),
  };
}
