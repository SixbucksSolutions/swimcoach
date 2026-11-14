// The Board Durable Object (MVP-03 A): one instance holds every tracked milestone and its samples.
// MVP-07's router calls these RPC methods; their signatures are frozen in
// docs/planning/t2-interfaces.md, "MVP-03 A".

import { DurableObject } from "cloudflare:workers";
import type {
  EpochSeconds,
  PlanResult,
  Report,
  Sample,
  StopRequest,
  StoredMilestone,
} from "../contract.ts";
// biome-ignore lint/correctness/useImportExtensions: tsc refuses a .ts value import (TS5097) without allowImportingTsExtensions.
import { planReport } from "../ingest/plan";
// biome-ignore lint/correctness/useImportExtensions: tsc refuses a .ts value import (TS5097) without allowImportingTsExtensions.
import { SqlBoardStore } from "./store";

const SECONDS_PER_DAY = 86_400;
const MS_PER_DAY = SECONDS_PER_DAY * 1000;

/** api.md section 10: samples older than this MAY be deleted. */
const RETENTION_SECONDS = 14 * SECONDS_PER_DAY;

/** What `report` returns: the ingest plan's result, after the store has committed it when ok. */
export type ReportResult = PlanResult;

/** Everything GET /api/state reads. `samples` is keyed by `milestoneKey()` from ./store. */
export interface BoardSnapshot {
  readonly milestones: StoredMilestone[];
  readonly samples: Record<string, Sample[]>;
}

export class Board extends DurableObject<Env> {
  readonly #store: SqlBoardStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = new SqlBoardStore(ctx.storage);
    // Arm the daily prune once; alarm() re-arms itself. No request runs until this settles. A
    // constructor cannot await it; if the callback throws, the runtime resets the object.
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(Date.now() + MS_PER_DAY);
      }
    });
  }

  /**
   * api.md 4.4. Reads the previous row and newest sample, plans, and commits, with no await in
   * between, so no other request can interleave; the commit itself is one SQLite transaction.
   */
  report(report: Report, receivedAt: EpochSeconds): ReportResult {
    const prev = this.#store.findMilestone(report.project, report.milestone);
    const newest = this.#store.newestSample(report.project, report.milestone);
    const result = planReport(prev, newest, report, receivedAt);
    if (result.ok) {
      this.#store.commitReport(result.plan);
    }
    return result;
  }

  /** api.md section 5. The deleted row, or null when the pair is not tracked. */
  stop(request: StopRequest): StoredMilestone | null {
    return this.#store.stopMilestone(request.project, request.milestone);
  }

  /** Every tracked milestone and its samples, oldest first, for GET /api/state. */
  snapshot(): BoardSnapshot {
    return {
      milestones: this.#store.listMilestones(),
      samples: this.#store.samplesByKey(),
    };
  }

  /**
   * Once a day, delete samples older than 14 days (api.md section 10). An alarm has no request, so
   * it reads the real clock; a test deployment's header clock (api.md section 9) cannot reach it.
   * Milestones are never removed here: only POST /api/stop removes one.
   */
  override async alarm(): Promise<void> {
    this.#store.pruneSamplesBefore(Date.now() / 1000 - RETENTION_SECONDS);
    await this.ctx.storage.setAlarm(Date.now() + MS_PER_DAY);
  }
}
