// What one valid report does (contract/api.md 4.4 steps 1-4), decided as a pure function. The
// Board Durable Object (MVP-03 A) reads the previous row and newest sample, calls planReport, and
// commits the plan atomically. Nothing here touches storage or the clock.
import {
  type EpochSeconds,
  LANE_KEYS,
  type Lanes,
  type PlanResult,
  type Report,
  type Sample,
  type SampleOutcome,
  type StoredMilestone,
} from "../contract.ts";

/** A sample matching the newest one is a duplicate when it arrives less than this long after it. */
const DUPLICATE_WINDOW_SECONDS = 60;

function finishedOf(lanes: Lanes): number {
  return lanes.ready_for_review + lanes.completed;
}

function totalOf(lanes: Lanes): number {
  return LANE_KEYS.reduce((sum, key) => sum + lanes[key], 0);
}

function lanesDiffer(a: Lanes, b: Lanes): boolean {
  return LANE_KEYS.some((key) => a[key] !== b[key]);
}

function isDuplicate(sample: Sample, newest: Sample | null): boolean {
  return (
    newest !== null &&
    sample.at - newest.at < DUPLICATE_WINDOW_SECONDS &&
    newest.work === sample.work &&
    newest.clock === sample.clock &&
    newest.finished === sample.finished &&
    newest.total === sample.total
  );
}

/** Step 4: the sample to store, or why there is none. */
function sampleFor(
  report: Report,
  newest: Sample | null,
  receivedAt: EpochSeconds,
): { readonly sample: Sample | null; readonly sampleOutcome: SampleOutcome } {
  const finished = finishedOf(report.lanes);
  const total = totalOf(report.lanes);
  // Undefined when total or active_hours is 0, as in the prototype's progress().
  if (total === 0 || report.active_hours === 0) {
    return { sample: null, sampleOutcome: "none" };
  }
  const sample: Sample = {
    at: receivedAt,
    work: finished / total,
    clock: report.active_hours / report.cap_hours,
    finished,
    total,
  };
  if (isDuplicate(sample, newest)) {
    return { sample: null, sampleOutcome: "duplicate" };
  }
  return { sample, sampleOutcome: "stored" };
}

/**
 * Plans one valid report received at `receivedAt` (api.md 4.4).
 *
 * `prev` is the tracked row for the report's key, or null when the key is not tracked. `newest` is
 * that milestone's newest stored sample, or null. Refuses with clock_went_backward when
 * `receivedAt` is earlier than `prev.updated_at` (api.md section 9); an equal time is allowed.
 * Its type is contract.ts's PlanReport, which test/ingest/plan.test.ts asserts at compile time.
 */
function planReport(
  prev: StoredMilestone | null,
  newest: Sample | null,
  report: Report,
  receivedAt: EpochSeconds,
): PlanResult {
  // Step 1: an untracked milestone starts now.
  let firstReportAt = receivedAt;
  let lastMoveAt = receivedAt;
  if (prev !== null) {
    if (receivedAt < prev.updated_at) {
      return { ok: false, error: "clock_went_backward" };
    }
    firstReportAt = prev.first_report_at;
    // Step 3: a move is a change in any lane count. Hours alone never count.
    if (!lanesDiffer(prev.lanes, report.lanes)) {
      lastMoveAt = prev.last_move_at;
    }
  }
  // Step 2: the newest report replaces the snapshot, its spelling included.
  const milestone: StoredMilestone = {
    project: report.project,
    milestone: report.milestone,
    agent: report.agent,
    active_hours: report.active_hours,
    cap_hours: report.cap_hours,
    lanes: { ...report.lanes },
    reported_needs_me: report.needs_me ?? null,
    first_report_at: firstReportAt,
    updated_at: receivedAt,
    last_move_at: lastMoveAt,
  };
  const { sample, sampleOutcome } = sampleFor(report, newest, receivedAt);
  return {
    ok: true,
    plan: { added: prev === null, milestone, sample, sampleOutcome, receivedAt },
  };
}

export { DUPLICATE_WINDOW_SECONDS, planReport };
