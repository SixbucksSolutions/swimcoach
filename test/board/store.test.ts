// SqlBoardStore directly, inside a Board's own storage, with hand-built plans: no ingest step.
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SqlBoardStore } from "../../src/board/store.ts";
import type { ReportPlan, Sample, StoredMilestone } from "../../src/contract.ts";

const T0 = 1_794_573_043;

function aMilestone(overrides: Partial<StoredMilestone> = {}): StoredMilestone {
  return {
    project: "FGA",
    milestone: "M12",
    agent: "claude",
    active_hours: 2,
    cap_hours: 8,
    lanes: { ready_for_work: 3, in_progress: 1, needs_terry: 0, ready_for_review: 1, completed: 2 },
    reported_needs_me: null,
    first_report_at: T0,
    updated_at: T0,
    last_move_at: T0,
    ...overrides,
  };
}

function aSample(at: number, work = 3 / 7): Sample {
  return { at, work, clock: 0.25, finished: 3, total: 7 };
}

function aPlan(milestone: StoredMilestone, sample: Sample | null): ReportPlan {
  const base = { added: false, milestone, receivedAt: milestone.updated_at };
  if (sample === null) {
    return { ...base, sample, sampleOutcome: "duplicate" };
  }
  return { ...base, sample, sampleOutcome: "stored" };
}

/** Runs `body` against a fresh store over a fresh Board's storage. */
function withStore<R>(
  body: (store: SqlBoardStore, storage: DurableObjectStorage) => R,
): Promise<R> {
  const stub = env.BOARD.getByName(crypto.randomUUID());
  return runInDurableObject(stub, (_instance, state) =>
    body(new SqlBoardStore(state.storage), state.storage),
  );
}

describe("SqlBoardStore writes", () => {
  it("creates its schema idempotently and keeps existing rows", async () => {
    const found = await withStore((store, storage) => {
      store.commitReport(aPlan(aMilestone(), aSample(T0)));
      const reopened = new SqlBoardStore(storage);
      return [reopened.findMilestone("fga", "m12"), reopened.listSamples("FGA", "M12")];
    });
    expect(found).toEqual([aMilestone(), [aSample(T0)]]);
  });

  it("commits nothing when any part of a report fails", async () => {
    const state = await withStore((store) => {
      // NOT NULL refuses the sample after the milestone row is written; both MUST roll back.
      const broken = aPlan(aMilestone(), { ...aSample(T0), work: Number.NaN });
      let threw = false;
      try {
        store.commitReport(broken);
      } catch {
        threw = true;
      }
      return {
        threw,
        milestones: store.listMilestones(),
        samples: store.listSamples("FGA", "M12"),
      };
    });
    expect(state).toEqual({ threw: true, milestones: [], samples: [] });
  });

  it("appends exactly one sample per stored plan and none for a duplicate", async () => {
    const samples = await withStore((store) => {
      store.commitReport(aPlan(aMilestone(), aSample(T0)));
      store.commitReport(aPlan(aMilestone({ updated_at: T0 + 30 }), null));
      store.commitReport(aPlan(aMilestone({ updated_at: T0 + 120 }), aSample(T0 + 120, 0.5)));
      return store.listSamples("FGA", "M12");
    });
    expect(samples).toEqual([aSample(T0), aSample(T0 + 120, 0.5)]);
  });
});

describe("SqlBoardStore reads and deletes", () => {
  it("orders samples that share a received time by insertion", async () => {
    const newest = await withStore((store) => {
      store.commitReport(aPlan(aMilestone(), aSample(T0, 0.25)));
      store.commitReport(aPlan(aMilestone(), aSample(T0, 0.5)));
      return store.newestSample("FGA", "M12");
    });
    expect(newest).toEqual(aSample(T0, 0.5));
  });

  it("stops a milestone atomically and reports an untracked one as null", async () => {
    const result = await withStore((store) => {
      store.commitReport(aPlan(aMilestone(), aSample(T0)));
      const stopped = store.stopMilestone("Fga", "m12");
      return {
        stopped,
        again: store.stopMilestone("FGA", "M12"),
        newest: store.newestSample("FGA", "M12"),
      };
    });
    expect(result).toEqual({ stopped: aMilestone(), again: null, newest: null });
  });

  it("prunes only samples before the cutoff and counts them", async () => {
    const result = await withStore((store) => {
      for (const at of [T0, T0 + 10, T0 + 20, T0 + 30]) {
        store.commitReport(aPlan(aMilestone({ updated_at: at }), aSample(at, at)));
      }
      const deleted = store.pruneSamplesBefore(T0 + 20);
      return { deleted, left: store.listSamples("FGA", "M12").map((s) => s.at) };
    });
    expect(result).toEqual({ deleted: 2, left: [T0 + 20, T0 + 30] });
  });
});
