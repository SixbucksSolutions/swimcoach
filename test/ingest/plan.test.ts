import { describe, expect, it } from "vitest";
import type {
  Lanes,
  PlanReport,
  Report,
  ReportPlan,
  Sample,
  StoredMilestone,
} from "../../src/contract.ts";
import { DUPLICATE_WINDOW_SECONDS, planReport } from "../../src/ingest/plan.ts";

/** Compile-time proof that planReport has contract.ts's frozen PlanReport type. */
const FROZEN: PlanReport = planReport;

const T0 = 1_794_570_000;
const T = 1_794_573_043.512;

const LANES: Lanes = {
  ready_for_work: 2,
  in_progress: 1,
  needs_terry: 0,
  ready_for_review: 3,
  completed: 1,
};

const ZERO_LANES: Lanes = {
  ready_for_work: 0,
  in_progress: 0,
  needs_terry: 0,
  ready_for_review: 0,
  completed: 0,
};

const REPORT: Report = {
  agent: "codex",
  project: "FGA",
  milestone: "T04",
  active_hours: 1.85,
  cap_hours: 4,
  lanes: LANES,
};

const PREV: StoredMilestone = {
  project: "fga",
  milestone: "t04",
  agent: "claude",
  active_hours: 1.5,
  cap_hours: 4,
  lanes: LANES,
  reported_needs_me: "An old ask.",
  first_report_at: T0,
  updated_at: T0 + 1800,
  last_move_at: T0 + 600,
};

/** The sample REPORT makes at time `at`: finished 4 of 7, clock 1.85 / 4. */
function sampleAt(at: number): Sample {
  return { at, work: 4 / 7, clock: 1.85 / 4, finished: 4, total: 7 };
}

function planOf(
  prev: StoredMilestone | null,
  newest: Sample | null,
  report: Report,
  receivedAt: number,
): ReportPlan {
  const result = planReport(prev, newest, report, receivedAt);
  if (!result.ok) {
    throw new Error(`Expected a plan, got ${result.error}.`);
  }
  return result.plan;
}

describe("step 1: an untracked milestone is added", () => {
  it("stamps first_report_at, updated_at and last_move_at with T and stores a sample", () => {
    expect(planOf(null, null, REPORT, T)).toEqual({
      added: true,
      receivedAt: T,
      milestone: {
        project: "FGA",
        milestone: "T04",
        agent: "codex",
        active_hours: 1.85,
        cap_hours: 4,
        lanes: LANES,
        reported_needs_me: null,
        first_report_at: T,
        updated_at: T,
        last_move_at: T,
      },
      sample: sampleAt(T),
      sampleOutcome: "stored",
    });
  });

  it("never refuses an untracked milestone for its clock", () => {
    expect(FROZEN(null, null, REPORT, 0).ok).toBe(true);
  });
});

describe("step 2: the snapshot is replaced", () => {
  it("takes every field and the spelling from the newest report, and keeps first_report_at", () => {
    const plan = planOf(PREV, null, { ...REPORT, needs_me: "Confirm the demo." }, T);
    expect(plan.added).toBe(false);
    expect(plan.milestone).toEqual({
      project: "FGA",
      milestone: "T04",
      agent: "codex",
      active_hours: 1.85,
      cap_hours: 4,
      lanes: LANES,
      reported_needs_me: "Confirm the demo.",
      first_report_at: T0,
      updated_at: T,
      last_move_at: T0 + 600,
    });
  });

  it("clears reported_needs_me when the newest report sends none", () => {
    expect(planOf(PREV, null, REPORT, T).milestone.reported_needs_me).toBeNull();
  });

  it("lets active_hours go down", () => {
    const report = { ...REPORT, active_hours: 0.5 };
    expect(planOf(PREV, null, report, T).milestone.active_hours).toBe(0.5);
  });

  it("copies the lanes rather than sharing the report's object", () => {
    expect(planOf(PREV, null, REPORT, T).milestone.lanes).not.toBe(REPORT.lanes);
  });
});

describe("step 3: last_move_at moves only with a lane count", () => {
  it("keeps last_move_at when only the hours changed", () => {
    const report = { ...REPORT, active_hours: 3, cap_hours: 6 };
    expect(planOf(PREV, null, report, T).milestone.last_move_at).toBe(T0 + 600);
  });

  it.each(Object.keys(LANES) as (keyof Lanes)[])(
    "sets last_move_at = T when %s changes",
    (lane) => {
      const lanes = { ...LANES, [lane]: LANES[lane] + 1 };
      expect(planOf(PREV, null, { ...REPORT, lanes }, T).milestone.last_move_at).toBe(T);
    },
  );

  it("counts a move between lanes that keeps the total equal", () => {
    const lanes = { ...LANES, in_progress: 0, ready_for_review: 4 };
    expect(planOf(PREV, null, { ...REPORT, lanes }, T).milestone.last_move_at).toBe(T);
  });
});

describe("step 4: the sample's values", () => {
  it("uses finished = ready_for_review + completed and total = all five lanes", () => {
    const lanes = {
      ready_for_work: 1,
      in_progress: 2,
      needs_terry: 3,
      ready_for_review: 4,
      completed: 5,
    };
    const report = { ...REPORT, active_hours: 1, cap_hours: 4, lanes };
    expect(planOf(null, null, report, T).sample).toEqual({
      at: T,
      work: 9 / 15,
      clock: 0.25,
      finished: 9,
      total: 15,
    });
  });

  it("lets clock exceed 1", () => {
    const report = { ...REPORT, active_hours: 6, cap_hours: 4 };
    expect(planOf(null, null, report, T).sample?.clock).toBe(1.5);
  });

  it("stores a sample when there is no newest one", () => {
    expect(planOf(PREV, null, REPORT, T).sampleOutcome).toBe("stored");
  });
});

describe('step 4: "none"', () => {
  it.each([
    ["total is 0", { ...REPORT, lanes: ZERO_LANES }],
    ["active_hours is 0", { ...REPORT, active_hours: 0 }],
    ["both are 0", { ...REPORT, active_hours: 0, lanes: ZERO_LANES }],
  ])("stores none when %s, even beside a matching newest sample", (_, report) => {
    const plan = planOf(PREV, sampleAt(T - 1), report, T);
    expect(plan.sample).toBeNull();
    expect(plan.sampleOutcome).toBe("none");
  });
});

describe('step 4: "duplicate" inside the 60-second window', () => {
  it("treats an identical sample under 60 seconds old as a duplicate", () => {
    const plan = planOf(PREV, sampleAt(T - 59.999), REPORT, T);
    expect(plan.sample).toBeNull();
    expect(plan.sampleOutcome).toBe("duplicate");
  });

  it("treats an identical sample received at the same T as a duplicate", () => {
    expect(planOf(PREV, sampleAt(T), REPORT, T).sampleOutcome).toBe("duplicate");
  });

  it("stores an identical sample exactly 60 seconds old", () => {
    expect(DUPLICATE_WINDOW_SECONDS).toBe(60);
    const plan = planOf(PREV, sampleAt(T - 60), REPORT, T);
    expect(plan.sample).toEqual(sampleAt(T));
    expect(plan.sampleOutcome).toBe("stored");
  });

  it("still applies steps 2 and 3, so a heartbeat keeps the milestone fresh", () => {
    const fresh = planOf({ ...PREV, updated_at: T - 30 }, sampleAt(T - 30), REPORT, T);
    expect(fresh.sampleOutcome).toBe("duplicate");
    expect(fresh.milestone.updated_at).toBe(T);
    const prev = { ...PREV, lanes: { ...LANES, in_progress: 0, completed: 2 } };
    const moved = planOf(prev, sampleAt(T - 30), REPORT, T);
    expect(moved.sampleOutcome).toBe("duplicate");
    expect(moved.milestone.last_move_at).toBe(T);
  });
});

describe('step 4: not a "duplicate" when anything differs', () => {
  it.each([
    ["work", { work: 0.5 }],
    ["clock", { clock: 0.5 }],
    ["finished", { finished: 5 }],
    ["total", { total: 8 }],
  ])("stores a recent sample that differs in %s", (_, change) => {
    const newest = { ...sampleAt(T - 10), ...change };
    expect(planOf(PREV, newest, REPORT, T).sampleOutcome).toBe("stored");
  });

  it("stores the same work over a different total: 2 of 4 after 1 of 2", () => {
    const lanes = { ...ZERO_LANES, ready_for_work: 2, ready_for_review: 2 };
    const newest: Sample = { at: T - 10, work: 0.5, clock: 1.85 / 4, finished: 1, total: 2 };
    expect(planOf(PREV, newest, { ...REPORT, lanes }, T).sampleOutcome).toBe("stored");
  });
});

describe("clock_went_backward", () => {
  it("refuses a report received before the milestone's updated_at", () => {
    expect(planReport(PREV, null, REPORT, PREV.updated_at - 0.001)).toEqual({
      ok: false,
      error: "clock_went_backward",
    });
  });

  it("accepts a report received at exactly updated_at", () => {
    const plan = planOf(PREV, sampleAt(PREV.updated_at), REPORT, PREV.updated_at);
    expect(plan.milestone.updated_at).toBe(PREV.updated_at);
    expect(plan.sampleOutcome).toBe("duplicate");
  });
});
