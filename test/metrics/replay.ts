// Test helpers for MVP-04 A: replay a golden fixture (contract/fixtures/README.md) into the
// stored milestone and samples that contract/api.md 4.4 would leave, and compare values with the
// README's tolerance.

import type { EpochSeconds, Lanes, Sample, StoredMilestone } from "../../src/contract.ts";
import { finishedOf, totalOf } from "../../src/metrics/core.ts";

const SECONDS_PER_HOUR = 3600;
/** api.md 4.4 step 4: the duplicate window. */
const DUPLICATE_SECONDS = 60;
/** contract/fixtures/README.md: numbers compare with this absolute tolerance. */
const TOLERANCE = 1e-9;

interface FixtureSample {
  readonly at_hours: number;
  readonly active_hours: number;
  readonly lanes: Lanes;
}

function sameLanes(a: Lanes, b: Lanes): boolean {
  return (
    a.ready_for_work === b.ready_for_work &&
    a.in_progress === b.in_progress &&
    a.needs_terry === b.needs_terry &&
    a.ready_for_review === b.ready_for_review &&
    a.completed === b.completed
  );
}

function isDuplicate(newest: Sample | undefined, sample: Sample): boolean {
  return (
    newest !== undefined &&
    sample.at - newest.at < DUPLICATE_SECONDS &&
    newest.work === sample.work &&
    newest.clock === sample.clock &&
    newest.finished === sample.finished &&
    newest.total === sample.total
  );
}

/** api.md 4.4 step 4: the sample a report stores, or null when total or active_hours is 0. */
function sampleOf(report: FixtureSample, capHours: number, at: EpochSeconds): Sample | null {
  const total = totalOf(report.lanes);
  if (total === 0 || report.active_hours === 0) {
    return null;
  }
  const finished = finishedOf(report.lanes);
  return { at, work: finished / total, clock: report.active_hours / capHours, finished, total };
}

/** api.md 4.4 steps 1-3: the milestone row after one report. */
function rowAfter(
  prev: StoredMilestone | null,
  fixture: Fixture,
  report: FixtureSample,
  at: EpochSeconds,
): StoredMilestone {
  const row: StoredMilestone = {
    project: fixture.name,
    milestone: "M1",
    agent: "claude",
    active_hours: report.active_hours,
    cap_hours: fixture.cap_hours,
    lanes: report.lanes,
    reported_needs_me: null,
    first_report_at: at,
    updated_at: at,
    last_move_at: at,
  };
  if (prev === null) {
    return row;
  }
  if (sameLanes(prev.lanes, report.lanes)) {
    return { ...row, first_report_at: prev.first_report_at, last_move_at: prev.last_move_at };
  }
  return { ...row, first_report_at: prev.first_report_at };
}

function numberMismatch(actual: unknown, expected: number, path: string): string[] {
  if (typeof actual !== "number" || !(Math.abs(actual - expected) <= TOLERANCE)) {
    return [`${path}: expected ${expected}, got ${String(actual)}`];
  }
  return [];
}

function objectMismatch(actual: unknown, expected: object, path: string): string[] {
  if (actual === null || typeof actual !== "object") {
    return [`${path}: expected an object, got ${String(actual)}`];
  }
  const a = actual as Record<string, unknown>;
  const e = expected as Record<string, unknown>;
  const extra = Object.keys(a)
    .filter((key) => !Object.hasOwn(e, key))
    .map((key) => `${path}.${key}: not expected`);
  return [
    ...extra,
    ...Object.keys(e).flatMap((key) => mismatches(a[key], e[key], `${path}.${key}`)),
  ];
}

export interface Fixture {
  readonly name: string;
  readonly description: string;
  readonly cap_hours: number;
  readonly samples: readonly FixtureSample[];
  readonly expected: Readonly<Record<string, unknown>>;
}

export interface Replayed {
  readonly milestone: StoredMilestone;
  readonly samples: readonly Sample[];
  /** The newest report's arrival, which the fixtures use as "now". */
  readonly now: EpochSeconds;
}

/** Sends each fixture sample as one report received at `base + at_hours`, per api.md 4.4. */
export function replay(fixture: Fixture, base: EpochSeconds): Replayed {
  let milestone: StoredMilestone | null = null;
  const samples: Sample[] = [];
  for (const report of fixture.samples) {
    const at = base + report.at_hours * SECONDS_PER_HOUR;
    milestone = rowAfter(milestone, fixture, report, at);
    const sample = sampleOf(report, fixture.cap_hours, at);
    if (sample !== null && !isDuplicate(samples.at(-1), sample)) {
      samples.push(sample);
    }
  }
  if (milestone === null) {
    throw new Error(`${fixture.name}: a fixture holds at least one sample`);
  }
  return { milestone, samples, now: milestone.updated_at };
}

/**
 * Every difference between `actual` and `expected`, compared as the fixtures README requires:
 * numbers within 1e-9, and null, strings and booleans exactly. Objects compare key by key and
 * MUST have the same keys. An empty list means a match.
 */
export function mismatches(actual: unknown, expected: unknown, path: string): string[] {
  if (typeof expected === "number") {
    return numberMismatch(actual, expected, path);
  }
  if (expected !== null && typeof expected === "object") {
    return objectMismatch(actual, expected, path);
  }
  if (actual !== expected) {
    return [`${path}: expected ${String(expected)}, got ${String(actual)}`];
  }
  return [];
}
