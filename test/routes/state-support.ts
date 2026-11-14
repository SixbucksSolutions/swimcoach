// Helpers for the GET /api/state tests: the schema validator, stored-row builders, and the
// comparisons the contract's examples need. No tests live here.

import { Validator } from "@cfworker/json-schema";
import reportSchema from "../../contract/schemas/report.schema.json" with { type: "json" };
import stateSchema from "../../contract/schemas/state.schema.json" with { type: "json" };
import type { BoardSnapshot } from "../../src/board/board.ts";
import type { Lanes, Sample, StoredMilestone } from "../../src/contract.ts";
import { stateBody } from "../../src/routes/state.ts";

const SERVER_SENTENCE = /^\d+ tickets? in Needs Terry$/u;

// @cfworker/json-schema runs in the Workers test pool; Ajv does not (it uses `new Function`).
const validator = new Validator(stateSchema as object, "2020-12", false);
validator.addSchema(reportSchema as object, reportSchema.$id);

export const T0 = 1_794_573_043;
export const MINUTE = 60;
export const HOUR = 3600;

export interface Card {
  readonly project: string;
  readonly milestone: string;
  readonly agent: StoredMilestone["agent"];
  readonly active_hours: number;
  readonly cap_hours: number;
  readonly lanes: Lanes;
  readonly needs_me: string | null;
  readonly first_report_at: number;
  readonly updated_at: number;
  readonly last_move_at: number;
  readonly stale: boolean;
  readonly stalled: boolean;
  readonly mode: string;
  readonly color: string;
  readonly reason: string;
  readonly spark: readonly (readonly [number, number])[];
  readonly metrics: Record<string, unknown>;
}

export interface Body {
  readonly now: number;
  readonly last_report_at: number | null;
  readonly feed: string;
  readonly thresholds: Record<string, number>;
  readonly milestones: readonly Card[];
}

/** The schema's verdict as a list of messages, so a failure names what is wrong. */
export function problemsOf(body: unknown): string[] {
  return validator.validate(body).errors.map((e) => `${e.instanceLocation}: ${e.error}`);
}

export function lanes(overrides: Partial<Lanes> = {}): Lanes {
  return {
    ready_for_work: 0,
    in_progress: 0,
    needs_terry: 0,
    ready_for_review: 0,
    completed: 0,
    ...overrides,
  };
}

export function stored(overrides: Partial<StoredMilestone> = {}): StoredMilestone {
  return {
    project: "FGA",
    milestone: "T04",
    agent: "claude",
    active_hours: 1,
    cap_hours: 4,
    lanes: lanes({ ready_for_work: 2, in_progress: 1, ready_for_review: 1 }),
    reported_needs_me: null,
    first_report_at: T0 - HOUR,
    updated_at: T0,
    last_move_at: T0,
    ...overrides,
  };
}

export function aSample(at: number, work: number): Sample {
  return { at, work, clock: 0.25, finished: 1, total: 4 };
}

export function snapshotOf(
  milestones: StoredMilestone[],
  samples: Record<string, Sample[]> = {},
): BoardSnapshot {
  return { milestones, samples };
}

/** Builds the body and throws, listing the problems, when it breaks state.schema.json. */
export function build(snapshot: BoardSnapshot, now: number): Body {
  const body = stateBody(snapshot, now);
  const problems = problemsOf(body);
  if (problems.length > 0) {
    throw new Error(`The body breaks state.schema.json:\n${problems.join("\n")}`);
  }
  return body as Body;
}

/** An example card's stored row. The report's own needs_me is null when the card shows the server's sentence (api.md 6.4). */
export function storedFrom(card: Card): StoredMilestone {
  let reported = card.needs_me;
  if (reported !== null && SERVER_SENTENCE.test(reported)) {
    reported = null;
  }
  return {
    project: card.project,
    milestone: card.milestone,
    agent: card.agent,
    active_hours: card.active_hours,
    cap_hours: card.cap_hours,
    lanes: card.lanes,
    reported_needs_me: reported,
    first_report_at: card.first_report_at,
    updated_at: card.updated_at,
    last_move_at: card.last_move_at,
  };
}

/** api.md 6.9: spark points compare with a tolerance of 1 s and 0.0001. */
export function sparkMismatches(actual: Card, want: Card, title: string): string[] {
  if (actual.spark.length !== want.spark.length) {
    return [`${title}.spark: expected ${want.spark.length} points, got ${actual.spark.length}`];
  }
  const out: string[] = [];
  for (const [i, point] of want.spark.entries()) {
    const got = actual.spark[i];
    const near =
      got !== undefined && Math.abs(got[0] - point[0]) <= 1 && Math.abs(got[1] - point[1]) <= 1e-4;
    if (!near) {
      out.push(`${title}.spark[${i}]: expected ${point.join(",")}, got ${got?.join(",")}`);
    }
  }
  return out;
}

/** The fields of a card that come from the verdict, for one comparison. */
export function verdictOf(card: Card): Record<string, unknown> {
  return {
    needs_me: card.needs_me,
    stale: card.stale,
    stalled: card.stalled,
    mode: card.mode,
    color: card.color,
    reason: card.reason,
  };
}
