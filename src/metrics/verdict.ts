// The card's display verdict (contract/api.md 6.2, 6.4, 6.5, 6.6) and its spark (6.9).
// Pure, no I/O.

import type {
  CardVerdict,
  Color,
  EpochSeconds,
  Metrics,
  Mode,
  Reason,
  Sample,
  SparkPoint,
  StoredMilestone,
  Thresholds,
} from "../contract.ts";
import { isDone, totalOf } from "./core.ts";

const SECONDS_PER_MINUTE = 60;

/** api.md 6.9: the spark keeps about this many evenly spaced points, plus the newest. */
const SPARK_TARGET_POINTS = 80;
const SPARK_DECIMALS = 10_000;

interface VerdictInputs {
  readonly done: boolean;
  readonly needsMe: string | null;
  readonly stale: boolean;
  readonly stalled: boolean;
  readonly ratio: boolean;
  readonly overBudget: boolean;
  readonly metrics: Metrics;
}

/** api.md 6.6: the table's ten rows, in order; the first that matches wins. */
function colorAndReason(v: VerdictInputs): readonly [Color, Reason] {
  const rows: readonly (readonly [Color, Reason, boolean])[] = [
    ["done", "done", v.done],
    ["red", "needs_terry", v.needsMe !== null],
    // Gray, not yellow, since API 2026-11-14 (Terry): gray means "not enough FRESH data to signal
    // green/yellow", and a silent agent's numbers are not fresh. It keeps its place in the order.
    ["gray", "silent", v.stale],
    ["yellow", "running_late", v.ratio && v.metrics.call === "running_late"],
    ["yellow", "over_budget", !v.ratio && v.overBudget],
    ["yellow", "stalled", v.ratio && v.stalled],
    ["yellow", "toss_up", v.ratio && v.metrics.call === "toss_up"],
    ["gray", "too_early", v.ratio && v.metrics.too_early],
    ["green", "on_time", v.ratio],
    ["green", "under_budget", true],
  ];
  for (const [color, reason, hit] of rows) {
    if (hit) {
      return [color, reason];
    }
  }
  // Unreachable: the last row always matches. It keeps the function total without a cast.
  return ["green", "under_budget"];
}

/**
 * api.md 6.4: the newest report's own `needs_me`, else the server's sentence when a card sits in
 * Needs Terry, else null.
 */
export function needsMeOf(m: StoredMilestone): string | null {
  if (m.reported_needs_me !== null) {
    return m.reported_needs_me;
  }
  const held = m.lanes.needs_terry;
  if (held === 0) {
    return null;
  }
  if (held === 1) {
    return "1 ticket in Needs Terry";
  }
  return `${held} tickets in Needs Terry`;
}

/** api.md 6.5, decision D1. */
export function modeOf(total: number, t: Thresholds): Mode {
  if (total >= t.min_stories_for_rtr) {
    return "ratio";
  }
  return "count_and_time";
}

/** The card's display verdict at `now` (api.md 6.2 `stale` and `stalled`, 6.4, 6.5, 6.6). */
export function cardVerdict(
  m: StoredMilestone,
  metrics: Metrics,
  now: EpochSeconds,
  t: Thresholds,
): CardVerdict {
  const done = isDone(m.lanes);
  const needsMe = needsMeOf(m);
  const stale = !done && now - m.updated_at > t.stale_minutes * SECONDS_PER_MINUTE;
  const stalled = !done && now - m.last_move_at > t.stall_minutes * SECONDS_PER_MINUTE;
  const mode = modeOf(totalOf(m.lanes), t);
  const [color, reason] = colorAndReason({
    done,
    needsMe,
    stale,
    stalled,
    ratio: mode === "ratio",
    overBudget: m.active_hours > m.cap_hours,
    metrics,
  });
  return { needs_me: needsMe, stale, stalled, mode, color, reason };
}

/**
 * api.md 6.9: `[round(at), round(work / clock, 4)]` per kept sample, oldest first. With `n`
 * samples and `step = max(1, floor(n / 80))`, it keeps every `step`-th sample of the first
 * `n - 1`, starting with the first, then the newest, as the prototype's
 * `samples[:-1][::step] + samples[-1:]` does. Rounding ties MAY break either way (api.md 6.9).
 */
export function sparkOf(samples: readonly Sample[]): SparkPoint[] {
  const newest = samples.at(-1);
  if (newest === undefined) {
    return [];
  }
  const step = Math.max(1, Math.floor(samples.length / SPARK_TARGET_POINTS));
  const kept = samples.slice(0, -1).filter((_, i) => i % step === 0);
  kept.push(newest);
  return kept.map(
    (s): SparkPoint => [
      Math.round(s.at),
      Math.round((s.work / s.clock) * SPARK_DECIMALS) / SPARK_DECIMALS,
    ],
  );
}
