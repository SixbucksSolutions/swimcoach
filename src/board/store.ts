// The Board Durable Object's SQLite storage (MVP-03 A), behind the frozen BoardStore interface in
// src/contract.ts. Every method is synchronous: ctx.storage.sql runs in the object's own thread,
// so a caller that does not await between a read and a write sees no other request in between.
//
// No events table. api.md section 5 says a stop deletes "its events", and section 10 lets events
// age out, but nothing in GET /api/2026-11-13/state reads an event (api.md section 6), so the MVP
// stores none.
// A stop that deletes the milestone and its samples therefore deletes everything the board holds
// about it. Add the table when a route first needs to read one.

import type {
  Agent,
  BoardStore,
  EpochSeconds,
  ReportPlan,
  Sample,
  StoredMilestone,
} from "../contract.ts";

// Idempotent: every statement is IF NOT EXISTS, so the constructor runs it on every start.
// The key column holds milestoneKey(); project and milestone hold the newest report's spelling.
// Samples use a rowid rather than (key, at) as their primary key: two reports MAY carry the same
// received time under the test clock (api.md section 9 refuses only time running backward).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS milestones (
  key               TEXT PRIMARY KEY NOT NULL,
  project           TEXT NOT NULL,
  milestone         TEXT NOT NULL,
  agent             TEXT NOT NULL,
  active_hours      REAL NOT NULL,
  cap_hours         REAL NOT NULL,
  ready_for_work    INTEGER NOT NULL,
  in_progress       INTEGER NOT NULL,
  needs_terry       INTEGER NOT NULL,
  ready_for_review  INTEGER NOT NULL,
  completed         INTEGER NOT NULL,
  reported_needs_me TEXT,
  first_report_at   REAL NOT NULL,
  updated_at        REAL NOT NULL,
  last_move_at      REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS samples (
  id       INTEGER PRIMARY KEY,
  key      TEXT NOT NULL,
  at       REAL NOT NULL,
  work     REAL NOT NULL,
  clock    REAL NOT NULL,
  finished INTEGER NOT NULL,
  total    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS samples_by_key ON samples (key, at, id);
CREATE INDEX IF NOT EXISTS samples_by_at ON samples (at);
`;

const MILESTONE_COLUMNS =
  "project, milestone, agent, active_hours, cap_hours, ready_for_work, in_progress, needs_terry," +
  " ready_for_review, completed, reported_needs_me, first_report_at, updated_at, last_move_at";

const SAMPLE_COLUMNS = "at, work, clock, finished, total";

// The rows extend Record<string, SqlStorageValue> because SqlStorage.exec<T> requires it.
interface MilestoneRow extends Record<string, SqlStorageValue> {
  project: string;
  milestone: string;
  agent: string;
  active_hours: number;
  cap_hours: number;
  ready_for_work: number;
  in_progress: number;
  needs_terry: number;
  ready_for_review: number;
  completed: number;
  reported_needs_me: string | null;
  first_report_at: number;
  updated_at: number;
  last_move_at: number;
}

interface SampleRow extends Record<string, SqlStorageValue> {
  at: number;
  work: number;
  clock: number;
  finished: number;
  total: number;
}

interface KeyedSampleRow extends SampleRow {
  key: string;
}

function asciiLower(name: string): string {
  return name.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

function toAgent(value: string): Agent {
  if (value === "claude" || value === "codex") {
    return value;
  }
  throw new Error(`The board holds an unknown agent: ${JSON.stringify(value)}`);
}

function toMilestone(row: MilestoneRow): StoredMilestone {
  return {
    project: row.project,
    milestone: row.milestone,
    agent: toAgent(row.agent),
    active_hours: row.active_hours,
    cap_hours: row.cap_hours,
    lanes: {
      ready_for_work: row.ready_for_work,
      in_progress: row.in_progress,
      needs_terry: row.needs_terry,
      ready_for_review: row.ready_for_review,
      completed: row.completed,
    },
    reported_needs_me: row.reported_needs_me,
    first_report_at: row.first_report_at,
    updated_at: row.updated_at,
    last_move_at: row.last_move_at,
  };
}

function toSample(row: SampleRow): Sample {
  return {
    at: row.at,
    work: row.work,
    clock: row.clock,
    finished: row.finished,
    total: row.total,
  };
}

/**
 * The storage key of a (project, milestone) pair (api.md 4.3).
 *
 * Only ASCII `A` to `Z` fold to `a` to `z`; every other character compares exactly, with no Unicode
 * case folding or normalization. `String.prototype.toLowerCase` folds far more than ASCII, so it
 * MUST NOT be applied to a whole name. The pair is encoded as a JSON array so that no choice of
 * separator character can make two different pairs collide.
 *
 * `Board.snapshot()` keys its samples map with this value.
 */
export function milestoneKey(project: string, milestone: string): string {
  return JSON.stringify([asciiLower(project), asciiLower(milestone)]);
}

export class SqlBoardStore implements BoardStore {
  readonly #storage: DurableObjectStorage;
  readonly #sql: SqlStorage;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
    this.#sql = storage.sql;
    this.#sql.exec(SCHEMA);
  }

  readonly findMilestone = (project: string, milestone: string): StoredMilestone | null => {
    const [row] = this.#sql
      .exec<MilestoneRow>(
        `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE key = ?`,
        milestoneKey(project, milestone),
      )
      .toArray();
    if (row === undefined) {
      return null;
    }
    return toMilestone(row);
  };

  readonly listMilestones = (): StoredMilestone[] =>
    this.#sql
      .exec<MilestoneRow>(`SELECT ${MILESTONE_COLUMNS} FROM milestones ORDER BY key`)
      .toArray()
      .map(toMilestone);

  readonly newestSample = (project: string, milestone: string): Sample | null => {
    const [row] = this.#sql
      .exec<SampleRow>(
        `SELECT ${SAMPLE_COLUMNS} FROM samples WHERE key = ? ORDER BY at DESC, id DESC LIMIT 1`,
        milestoneKey(project, milestone),
      )
      .toArray();
    if (row === undefined) {
      return null;
    }
    return toSample(row);
  };

  readonly listSamples = (project: string, milestone: string): Sample[] =>
    this.#sql
      .exec<SampleRow>(
        `SELECT ${SAMPLE_COLUMNS} FROM samples WHERE key = ? ORDER BY at, id`,
        milestoneKey(project, milestone),
      )
      .toArray()
      .map(toSample);

  /** Every stored sample grouped by milestoneKey(), each list oldest first. */
  readonly samplesByKey = (): Record<string, Sample[]> => {
    const grouped: Record<string, Sample[]> = {};
    const rows = this.#sql
      .exec<KeyedSampleRow>(`SELECT key, ${SAMPLE_COLUMNS} FROM samples ORDER BY key, at, id`)
      .toArray();
    for (const row of rows) {
      const list = grouped[row.key] ?? [];
      list.push(toSample(row));
      grouped[row.key] = list;
    }
    return grouped;
  };

  readonly commitReport = (plan: ReportPlan): void => {
    const m = plan.milestone;
    const key = milestoneKey(m.project, m.milestone);
    this.#storage.transactionSync(() => {
      // REPLACE rewrites every column, which is api.md 4.4 step 2: the newest report wins whole.
      this.#sql.exec(
        `INSERT OR REPLACE INTO milestones (key, ${MILESTONE_COLUMNS})` +
          " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        key,
        m.project,
        m.milestone,
        m.agent,
        m.active_hours,
        m.cap_hours,
        m.lanes.ready_for_work,
        m.lanes.in_progress,
        m.lanes.needs_terry,
        m.lanes.ready_for_review,
        m.lanes.completed,
        m.reported_needs_me,
        m.first_report_at,
        m.updated_at,
        m.last_move_at,
      );
      if (plan.sample !== null) {
        const s = plan.sample;
        this.#sql.exec(
          `INSERT INTO samples (key, ${SAMPLE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
          key,
          s.at,
          s.work,
          s.clock,
          s.finished,
          s.total,
        );
      }
    });
  };

  readonly stopMilestone = (project: string, milestone: string): StoredMilestone | null =>
    this.#storage.transactionSync(() => {
      const found = this.findMilestone(project, milestone);
      if (found === null) {
        return null;
      }
      const key = milestoneKey(project, milestone);
      this.#sql.exec("DELETE FROM samples WHERE key = ?", key);
      this.#sql.exec("DELETE FROM milestones WHERE key = ?", key);
      return found;
    });

  readonly pruneSamplesBefore = (cutoff: EpochSeconds): number =>
    // RETURNING counts deleted rows exactly; rowsWritten would also count index writes.
    this.#sql.exec("DELETE FROM samples WHERE at < ? RETURNING id", cutoff).toArray().length;
}
