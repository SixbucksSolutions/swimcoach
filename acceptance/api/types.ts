// The frozen case format of the black-box API acceptance suite (MVP-09). Written by the Lead before
// dispatch, exactly as docs/planning/t4-interfaces.md gives it; a change is a re-freeze, not an edit.
// The suite MUST NOT import from src/, cli/, test/ or public/ (biome.jsonc enforces it).

export type Tier = "clock-free" | "timed";
export interface Reply {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
}
export interface Send {
  body?: unknown; // JSON-encoded unless raw is set
  raw?: string | Uint8Array; // sent as is (BOM, bad JSON, oversize)
  headers?: Record<string, string>; // added to or overriding the defaults
  at?: number; // epoch s, sent as Swimcoach-Test-Now; timed cases only
  auth?: "token" | "none" | "bad-secret"; // default "token"
}
export interface Harness {
  readonly suite: "clock-free" | "full";
  readonly runId: string;
  request(method: string, path: string, send?: Send): Promise<Reply>; // never follows redirects
  report(body: unknown, at?: number): Promise<Reply>;
  stop(project: string, milestone: string, at?: number): Promise<Reply>;
  state(at?: number): Promise<unknown>; // asserts 200, no-store and state.schema.json
  replay(fixture: Fixture, project: string, milestone: string, startAt: number): Promise<number>; // last at
  expectSchema(ref: string, body: unknown): void; // e.g. "report.schema.json#/$defs/errorResponse"
  expectClose(actual: unknown, expected: unknown, path: string): void; // 1e-9 numbers, exact otherwise
  project(): string; // "zz acceptance " + runId
}
export interface Fixture {
  name: string;
  cap_hours: number;
  samples: { at_hours: number; active_hours: number; lanes: Record<string, number> }[];
  expected: Record<string, unknown>;
}
export interface Case {
  id: string;
  title: string;
  tier: Tier;
  cites: string;
  run(h: Harness): Promise<void>;
}
