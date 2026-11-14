// Shared types for the swimcoach Worker, frozen by the Lead for MVP T2.
// The source of truth is contract/api.md and contract/schemas/; these types mirror them.
// Only the Lead edits this file. Authors import from it and never redefine these shapes.

/** Whole or fractional seconds since the Unix epoch, on the server's clock (api.md section 9). */
export type EpochSeconds = number;

/** The five lanes a report counts, in board order (api.md 4.1). Backlog and Blocked never appear. */
export const LANE_KEYS = [
  "ready_for_work",
  "in_progress",
  "needs_terry",
  "ready_for_review",
  "completed",
] as const;

export type LaneKey = (typeof LANE_KEYS)[number];

/** Story card count per lane; every key present, each a non-negative integer. */
export type Lanes = Readonly<Record<LaneKey, number>>;

export type Agent = "claude" | "codex";

/** A complete status report, already validated against report.schema.json. */
export interface Report {
  readonly agent: Agent;
  readonly project: string;
  readonly milestone: string;
  readonly active_hours: number;
  readonly cap_hours: number;
  readonly lanes: Lanes;
  readonly needs_me?: string;
}

/** The body of POST /api/stop, already validated. */
export interface StopRequest {
  readonly project: string;
  readonly milestone: string;
}

/** One tracked (project, milestone) as stored: the newest report plus the server's timestamps. */
export interface StoredMilestone {
  /** Spelling from the newest report. */
  readonly project: string;
  /** Spelling from the newest report. */
  readonly milestone: string;
  readonly agent: Agent;
  readonly active_hours: number;
  readonly cap_hours: number;
  readonly lanes: Lanes;
  /** The newest report's own needs_me, or null when it sent none (api.md 6.4 adds the server sentence later). */
  readonly reported_needs_me: string | null;
  readonly first_report_at: EpochSeconds;
  readonly updated_at: EpochSeconds;
  readonly last_move_at: EpochSeconds;
}

/** One stored sample (api.md 4.4 step 4). */
export interface Sample {
  readonly at: EpochSeconds;
  /** finished / total */
  readonly work: number;
  /** active_hours / cap_hours */
  readonly clock: number;
  readonly finished: number;
  readonly total: number;
}

export type SampleOutcome = "duplicate" | "none" | "stored";

/** What one valid report does, decided by the pure ingest step and executed atomically by the store. */
export interface ReportPlan {
  readonly added: boolean;
  /** The milestone row to write, replacing any previous row for the same key. */
  readonly milestone: StoredMilestone;
  /** The sample to append, or null for "duplicate" and "none". */
  readonly sample: Sample | null;
  readonly sampleOutcome: SampleOutcome;
  readonly receivedAt: EpochSeconds;
}

export type PlanResult =
  | { readonly ok: true; readonly plan: ReportPlan }
  | { readonly ok: false; readonly error: "clock_went_backward" };

/** Storage owned by the Board Durable Object (MVP-03 A). Names match ASCII case-insensitively (api.md 4.3). */
export interface BoardStore {
  /** The tracked milestone with this key, or null. */
  readonly findMilestone: (project: string, milestone: string) => StoredMilestone | null;
  /** Every tracked milestone, in no particular order. */
  readonly listMilestones: () => StoredMilestone[];
  /** The milestone's newest stored sample, or null. */
  readonly newestSample: (project: string, milestone: string) => Sample | null;
  /** The milestone's stored samples, oldest first. */
  readonly listSamples: (project: string, milestone: string) => Sample[];
  /** Writes the plan's milestone row and sample, if any, as one atomic step. */
  readonly commitReport: (plan: ReportPlan) => void;
  /** Deletes the milestone and all its samples as one atomic step. Returns the deleted row, or null if not tracked. */
  readonly stopMilestone: (project: string, milestone: string) => StoredMilestone | null;
  /** Deletes samples older than the cutoff (api.md section 10). Returns how many it deleted. */
  readonly pruneSamplesBefore: (cutoff: EpochSeconds) => number;
}

/** The rule constants in force (api.md 6.8). */
export interface Thresholds {
  readonly stale_minutes: number;
  readonly stall_minutes: number;
  readonly trend_minutes: number;
  readonly min_history_minutes: number;
  readonly min_block_used: number;
  readonly min_stories_for_rtr: number;
}

export const THRESHOLDS: Thresholds = {
  stale_minutes: 25,
  stall_minutes: 45,
  trend_minutes: 60,
  min_history_minutes: 45,
  min_block_used: 0.15,
  min_stories_for_rtr: 3,
};

/** The prototype's trend_of() result, field for field (state.schema.json $defs/trend). */
export interface Trend {
  readonly delta: number;
  readonly minutes: number;
  readonly pace: number | null;
  readonly proj: number | null;
  readonly finish: number | null;
  readonly recent_done: number;
  readonly to_go: number;
}

export type TrendBin = "down" | "flat" | "sharp_down" | "sharp_up" | "up";
export type Call = "on_time" | "running_late" | "toss_up";

/** The metric math (api.md 6.3). Values are never rounded. */
export interface Metrics {
  readonly work: number | null;
  readonly clock: number;
  readonly rtr: number | null;
  readonly too_early: boolean;
  readonly trend: Trend | null;
  readonly trend_bin: TrendBin | null;
  readonly projection_hours: number | null;
  readonly chance_on_time: number | null;
  readonly call: Call | null;
}

export type Mode = "count_and_time" | "ratio";
export type Color = "done" | "gray" | "green" | "red" | "yellow";
export type Reason =
  | "done"
  | "needs_terry"
  | "on_time"
  | "over_budget"
  | "running_late"
  | "silent"
  | "stalled"
  | "too_early"
  | "toss_up"
  | "under_budget";

/** The card's display verdict and the flags it depends on (api.md 6.2, 6.4-6.6). */
export interface CardVerdict {
  readonly needs_me: string | null;
  readonly stale: boolean;
  readonly stalled: boolean;
  readonly mode: Mode;
  readonly color: Color;
  readonly reason: Reason;
}

/** One spark point: [round(ts), round(work / clock, 4)] (api.md 6.9). */
export type SparkPoint = readonly [number, number];

/** Configuration for verifying Cloudflare Access (MVP-05 A). Both are Worker variables, not secrets. */
export interface AccessConfig {
  /** For example "sixbuckssolutions.cloudflareaccess.com"; the JWKS is at https://<team>/cdn-cgi/access/certs. */
  readonly ACCESS_TEAM_DOMAIN: string;
  /** The Access application's AUD tag. */
  readonly ACCESS_AUD: string;
}

export type AccessResult =
  | { readonly ok: true; readonly subject: string }
  | { readonly ok: false; readonly why: string };
