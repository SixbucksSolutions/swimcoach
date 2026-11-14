// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies and these helpers assert, and the harness (MVP-09 A) registers each run() as a node:test test.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: one flat module of small helpers; splitting it would scatter what the case files import together.
// Shared by the case files. Imports nothing from the MVP: only the frozen case format and node:assert.
import assert from "node:assert/strict";
import type { Harness, Reply } from "../types.ts";

const UPPER_ASCII = /[A-Z]/gu;
const LOWER_ASCII = /[a-z]/gu;
const JSON_TYPE = /^application\/json/iu;
const NO_STORE = /(?:^|[\s,])no-store(?:$|[\s,])/iu;

export const REPORT_PATH = "/api/2026-11-14/report";
export const STOP_PATH = "/api/2026-11-14/stop";
export const STATE_PATH = "/api/2026-11-14/state";
export const CLOCK_HEADER = "Swimcoach-Test-Now";
export const DAY = 86_400;

export const SCHEMA = {
  error: "report.schema.json#/$defs/errorResponse",
  report: "report.schema.json#/$defs/reportResponse",
  stop: "report.schema.json#/$defs/stopResponse",
} as const;

export interface Lanes {
  ready_for_work: number;
  in_progress: number;
  needs_terry: number;
  ready_for_review: number;
  completed: number;
}

export interface Metrics {
  work: number | null;
  clock: number;
  rtr: number | null;
  too_early: boolean;
  trend: Record<string, number | null> | null;
  trend_bin: string | null;
  projection_hours: number | null;
  chance_on_time: number | null;
  call: string | null;
}

export interface MilestoneState {
  project: string;
  milestone: string;
  agent: string;
  active_hours: number;
  cap_hours: number;
  lanes: Lanes;
  needs_me: string | null;
  first_report_at: number;
  updated_at: number;
  last_move_at: number;
  finished: number;
  total: number;
  stale: boolean;
  stalled: boolean;
  mode: string;
  color: string;
  reason: string;
  metrics: Metrics;
  spark: [number, number][];
}

export interface StateBody {
  now: number;
  last_report_at: number | null;
  feed: string;
  thresholds: Record<string, number>;
  milestones: MilestoneState[];
}

export interface ReportResponse {
  ok: true;
  project: string;
  milestone: string;
  received_at: number;
  added: boolean;
  sample: "stored" | "duplicate" | "none";
}

/** ASCII-only lowercasing: the contract's identity rule (api.md 4.3). */
export function asciiLower(text: string): string {
  return text.replace(UPPER_ASCII, (letter) => letter.toLowerCase());
}

/** ASCII-only uppercasing, for spelling a name differently without changing its identity. */
export function asciiUpper(text: string): string {
  return text.replace(LOWER_ASCII, (letter) => letter.toUpperCase());
}

export function lanesOf(overrides: Partial<Lanes> = {}): Lanes {
  return {
    ready_for_work: 0,
    in_progress: 0,
    needs_terry: 0,
    ready_for_review: 0,
    completed: 0,
    ...overrides,
  };
}

/** A valid report body: three cards, so the milestone is in ratio mode and never red. */
export function reportBody(
  project: string,
  milestone: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agent: "claude",
    project,
    milestone,
    active_hours: 1,
    cap_hours: 4,
    lanes: lanesOf({ ready_for_work: 2, in_progress: 1 }),
    ...overrides,
  };
}

/** The same body with one key removed. */
export function without(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...body };
  delete copy[key];
  return copy;
}

export async function stateOf(h: Harness, at?: number): Promise<StateBody> {
  // h.state() has already asserted 200, no-store and state.schema.json, so the cast is checked.
  return (await h.state(at)) as StateBody;
}

export function findMilestone(
  state: StateBody,
  project: string,
  milestone: string,
): MilestoneState | undefined {
  return state.milestones.find(
    (entry) =>
      asciiLower(entry.project) === asciiLower(project) &&
      asciiLower(entry.milestone) === asciiLower(milestone),
  );
}

export function mustFind(
  state: StateBody,
  project: string,
  milestone: string,
  label: string,
): MilestoneState {
  const found = findMilestone(state, project, milestone);
  assert.ok(found, `${label}: ${project} / ${milestone} is not on the board`);
  return found;
}

/** Runs the steps one at a time, in order: every case here depends on request order. */
export async function eachSeries<T>(
  items: readonly T[],
  step: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (const [index, item] of items.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: requests MUST run one at a time, in order.
    await step(item, index);
  }
}

export function errorCode(reply: Reply): unknown {
  return (reply.body as { error?: unknown } | null)?.error;
}

// biome-ignore lint/complexity/useMaxParams: one call per refusal, read as "status, code, label"; an options object would only add braces to ~100 calls.
export function expectError(
  h: Harness,
  reply: Reply,
  status: number,
  error: string,
  label: string,
): void {
  assert.equal(reply.status, status, `${label}: status (body: ${reply.text.slice(0, 200)})`);
  h.expectSchema(SCHEMA.error, reply.body);
  assert.equal(errorCode(reply), error, `${label}: error code`);
}

export function expectNoStore(reply: Reply, label: string): void {
  const control = reply.headers.get("cache-control") ?? "";
  assert.ok(NO_STORE.test(control), `${label}: Cache-Control is "${control}"`);
}

export function expectJson(reply: Reply, label: string): void {
  assert.match(reply.headers.get("content-type") ?? "", JSON_TYPE, `${label}: Content-Type`);
}

export function problemsOf(reply: Reply): { path: string; message: string }[] {
  const problems = (reply.body as { problems?: unknown } | null)?.problems;
  assert.ok(
    Array.isArray(problems) && problems.length > 0,
    `problems missing: ${reply.text.slice(0, 200)}`,
  );
  return problems as { path: string; message: string }[];
}

/** A rejected request counts as an authentication failure: 401, 403, or a redirect to a login host. */
export function isAuthFailure(reply: Reply): boolean {
  if (reply.status === 401 || reply.status === 403) {
    return true;
  }
  const redirect = reply.status >= 300 && reply.status < 400;
  return redirect && (reply.headers.get("location") ?? "") !== "";
}

export function expectReported(h: Harness, reply: Reply, label: string): ReportResponse {
  assert.equal(reply.status, 200, `${label}: status (body: ${reply.text.slice(0, 200)})`);
  h.expectSchema(SCHEMA.report, reply.body);
  return reply.body as ReportResponse;
}

export interface Tracker {
  /** Sends a report and remembers whatever it stored, so cleanup() stops it. */
  send: (body: unknown, at?: number) => Promise<Reply>;
  /** Sends a report that MUST succeed. */
  ok: (body: Record<string, unknown>, at?: number, label?: string) => Promise<ReportResponse>;
  /** Stops everything this case stored, whatever happened. Call it in a finally block. */
  cleanup: () => Promise<void>;
}

export function tracker(h: Harness): Tracker {
  const stored = new Map<string, { project: string; milestone: string }>();
  async function send(body: unknown, at?: number): Promise<Reply> {
    const reply = await h.report(body, at);
    const echo = reply.body as Partial<ReportResponse> | null;
    if (
      reply.status === 200 &&
      typeof echo?.project === "string" &&
      typeof echo.milestone === "string"
    ) {
      stored.set(`${asciiLower(echo.project)}\u0000${asciiLower(echo.milestone)}`, {
        project: echo.project,
        milestone: echo.milestone,
      });
    }
    return reply;
  }
  return {
    send,
    async ok(body, at, label = "report") {
      return expectReported(h, await send(body, at), label);
    },
    async cleanup() {
      await eachSeries([...stored.values()], async (entry) => {
        await h.stop(entry.project, entry.milestone).catch(() => undefined);
      });
    },
  };
}

/** The full tier owns its deployment: it MAY stop every listed milestone (api.md 9). */
export async function clearBoard(h: Harness): Promise<void> {
  assert.equal(h.suite, "full", "clearBoard stops everything and MUST run only in the full tier");
  const state = await stateOf(h);
  await eachSeries(state.milestones, async (entry) => {
    await h.stop(entry.project, entry.milestone);
  });
}

/** A base time three days back: every timed request stays within 7 days of real time. */
export function baseTime(daysBack = 3): number {
  return Math.floor(Date.now() / 1000) - daysBack * DAY;
}

/** The count of spark points api.md 6.9 gives for n stored samples. */
export function expectedSparkLength(count: number): number {
  const step = Math.max(1, Math.floor(count / 80));
  return Math.ceil((count - 1) / step) + 1;
}

/** The indexes of the samples api.md 6.9 keeps: every step-th of the first n-1, then the newest. */
export function sparkIndexes(count: number): number[] {
  const step = Math.max(1, Math.floor(count / 80));
  const kept: number[] = [];
  for (let index = 0; index < count - 1; index += step) {
    kept.push(index);
  }
  kept.push(count - 1);
  return kept;
}

/** api.md 6.9: compare spark points with a tolerance of 1 s and 0.0001. */
export function expectSparkPoint(
  actual: [number, number] | undefined,
  time: number,
  value: number,
  label: string,
): void {
  assert.ok(actual, `${label}: point is missing`);
  assert.ok(
    Math.abs(actual[0] - time) <= 1,
    `${label}: time ${actual[0]} is not within 1 s of ${time}`,
  );
  assert.ok(
    Math.abs(actual[1] - value) <= 0.0001,
    `${label}: value ${actual[1]} is not within 0.0001 of ${value}`,
  );
}

/** The card verdict api.md 6.6 gives for the fields the state already carries. */
export function derivedVerdict(entry: MilestoneState): { color: string; reason: string } {
  const ratio = entry.mode === "ratio";
  const { call } = entry.metrics;
  if (entry.total > 0 && entry.finished === entry.total) {
    return { color: "done", reason: "done" };
  }
  if (entry.needs_me !== null) {
    return { color: "red", reason: "needs_terry" };
  }
  if (entry.stale) {
    return { color: "gray", reason: "silent" };
  }
  if (ratio && call === "running_late") {
    return { color: "yellow", reason: "running_late" };
  }
  if (!ratio && entry.active_hours > entry.cap_hours) {
    return { color: "yellow", reason: "over_budget" };
  }
  if (ratio && entry.stalled) {
    return { color: "yellow", reason: "stalled" };
  }
  if (ratio && call === "toss_up") {
    return { color: "yellow", reason: "toss_up" };
  }
  if (ratio && entry.metrics.too_early) {
    return { color: "gray", reason: "too_early" };
  }
  if (ratio) {
    return { color: "green", reason: "on_time" };
  }
  return { color: "green", reason: "under_budget" };
}

export function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

export function hex(point: number): string {
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Every Unicode White_Space code point plus U+FEFF: the edge set of api.md 4.1. */
export const EDGE_WHITESPACE = [
  ...range(0x09, 0x0d),
  0x20,
  0x85,
  0xa0,
  0x16_80,
  ...range(0x20_00, 0x20_0a),
  0x20_28,
  0x20_29,
  0x20_2f,
  0x20_5f,
  0x30_00,
  0xfe_ff,
];

/** Orders two strings by code point, as api.md 6.9 breaks ties (these names have no astral letters). */
export function compareCodePoints(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left < right) {
    return -1;
  }
  return 1;
}

/** The ask the server writes for Needs Terry cards when the report sent none (api.md 6.4). */
export function needsMeSentence(needsTerry: number): string | null {
  if (needsTerry === 0) {
    return null;
  }
  if (needsTerry === 1) {
    return "1 ticket in Needs Terry";
  }
  return `${needsTerry} tickets in Needs Terry`;
}

export function modeFor(total: number): string {
  if (total >= 3) {
    return "ratio";
  }
  return "count_and_time";
}

/** Checks the fields that follow from other fields: counts, mode, verdict, the needs_me sentence. */
export function expectConsistent(entry: MilestoneState, label: string): void {
  const { lanes } = entry;
  assert.equal(entry.finished, lanes.ready_for_review + lanes.completed, `${label}: finished`);
  assert.equal(
    entry.total,
    lanes.ready_for_work +
      lanes.in_progress +
      lanes.needs_terry +
      lanes.ready_for_review +
      lanes.completed,
    `${label}: total`,
  );
  assert.equal(entry.mode, modeFor(entry.total), `${label}: mode (api.md 6.5)`);
  assert.equal(
    entry.metrics.too_early,
    entry.metrics.trend === null,
    `${label}: too_early is exactly "no trend"`,
  );
  assert.deepEqual(
    { color: entry.color, reason: entry.reason },
    derivedVerdict(entry),
    `${label}: api.md 6.6`,
  );
}
