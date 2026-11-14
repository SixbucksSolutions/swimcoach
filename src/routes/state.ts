// GET /api/2026-11-14/state (MVP-07 A): contract/api.md section 6. Pure body builder plus the
// thin handler.

import type { BoardSnapshot } from "../board/board.ts";
import { milestoneKey } from "../board/store.ts";
import type { EpochSeconds, StoredMilestone } from "../contract.ts";
import { THRESHOLDS } from "../contract.ts";
import { boardStub, jsonResponse } from "../http.ts";
import { computeMetrics, finishedOf, isDone, totalOf } from "../metrics/core.ts";
import { cardVerdict, sparkOf } from "../metrics/verdict.ts";

const SECONDS_PER_MINUTE = 60;

type Feed = "idle" | "live" | "no_data" | "stale";

/** Only ASCII `A` to `Z` fold (api.md 6.9); no Unicode case folding. */
function asciiLower(name: string): string {
  return name.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

/** Compares by Unicode code point, not by UTF-16 code unit as `<` does. */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, (c) => c.codePointAt(0) ?? 0);
  const right = Array.from(b, (c) => c.codePointAt(0) ?? 0);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return left.length - right.length;
}

/** api.md 6.9: project, then milestone, each ASCII-lowercased, then code point for exact ties. */
function compareMilestones(a: StoredMilestone, b: StoredMilestone): number {
  return (
    compareCodePoints(asciiLower(a.project), asciiLower(b.project)) ||
    compareCodePoints(asciiLower(a.milestone), asciiLower(b.milestone)) ||
    compareCodePoints(a.project, b.project) ||
    compareCodePoints(a.milestone, b.milestone)
  );
}

/** api.md 6.1: the newest `updated_at`, or null when nothing is tracked. */
function newestUpdate(milestones: readonly StoredMilestone[]): EpochSeconds | null {
  if (milestones.length === 0) {
    return null;
  }
  return Math.max(...milestones.map((m) => m.updated_at));
}

/** api.md 6.7: the first row that matches wins. */
function feedOf(
  milestones: readonly StoredMilestone[],
  lastReportAt: EpochSeconds | null,
  now: EpochSeconds,
): Feed {
  if (milestones.length === 0 || lastReportAt === null) {
    return "no_data";
  }
  if (milestones.every((m) => isDone(m.lanes))) {
    return "idle";
  }
  if (now - lastReportAt > THRESHOLDS.stale_minutes * SECONDS_PER_MINUTE) {
    return "stale";
  }
  return "live";
}

/** The body of api.md section 6, computed at `now`. It validates against state.schema.json. */
export function stateBody(snapshot: BoardSnapshot, now: EpochSeconds): unknown {
  const sorted = [...snapshot.milestones].sort(compareMilestones);
  const lastReportAt = newestUpdate(sorted);
  const milestones = sorted.map((m) => {
    const samples = snapshot.samples[milestoneKey(m.project, m.milestone)] ?? [];
    const metrics = computeMetrics(m, samples, now, THRESHOLDS);
    const verdict = cardVerdict(m, metrics, now, THRESHOLDS);
    return {
      project: m.project,
      milestone: m.milestone,
      agent: m.agent,
      active_hours: m.active_hours,
      cap_hours: m.cap_hours,
      lanes: m.lanes,
      needs_me: verdict.needs_me,
      first_report_at: m.first_report_at,
      updated_at: m.updated_at,
      last_move_at: m.last_move_at,
      finished: finishedOf(m.lanes),
      total: totalOf(m.lanes),
      stale: verdict.stale,
      stalled: verdict.stalled,
      mode: verdict.mode,
      color: verdict.color,
      reason: verdict.reason,
      metrics,
      spark: sparkOf(samples),
    };
  });
  return {
    now,
    last_report_at: lastReportAt,
    feed: feedOf(sorted, lastReportAt, now),
    thresholds: THRESHOLDS,
    milestones,
  };
}

/** GET /api/2026-11-14/state: reads the Board's snapshot and answers 200 with the section 6 body. */
export async function handleState(env: Env, now: EpochSeconds): Promise<Response> {
  const snapshot = await boardStub(env).snapshot();
  return jsonResponse(stateBody(snapshot, now));
}
