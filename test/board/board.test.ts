// The Board Durable Object through its RPC methods, as MVP-07's router will call them.
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// biome-ignore lint/correctness/useImportExtensions: tsc refuses a .ts value import (TS5097) without allowImportingTsExtensions.
import { milestoneKey } from "../../src/board/store";
import type { Report } from "../../src/contract.ts";

const T0 = 1_794_573_043;
const DAY = 86_400;

function aReport(overrides: Partial<Report> = {}): Report {
  return {
    agent: "claude",
    project: "FGA",
    milestone: "M12",
    active_hours: 2,
    cap_hours: 8,
    lanes: { ready_for_work: 3, in_progress: 1, needs_terry: 0, ready_for_review: 1, completed: 2 },
    ...overrides,
  };
}

/** A fresh, uniquely named Board, so no test sees another's rows. */
function newBoard(): DurableObjectStub<import("../../src/board/board.ts").Board> {
  return env.BOARD.getByName(crypto.randomUUID());
}

function countSamples(stub: ReturnType<typeof newBoard>): Promise<number> {
  return runInDurableObject(
    stub,
    (_instance, state) => state.storage.sql.exec("SELECT id FROM samples").toArray().length,
  );
}

describe("Board.report, an untracked milestone", () => {
  it("adds an untracked milestone with its first sample", async () => {
    const board = newBoard();
    const result = await board.report(aReport(), T0);
    expect(result).toMatchObject({ ok: true, plan: { added: true, sampleOutcome: "stored" } });

    const snap = await board.snapshot();
    expect(snap.milestones).toEqual([
      {
        project: "FGA",
        milestone: "M12",
        agent: "claude",
        active_hours: 2,
        cap_hours: 8,
        lanes: {
          ready_for_work: 3,
          in_progress: 1,
          needs_terry: 0,
          ready_for_review: 1,
          completed: 2,
        },
        reported_needs_me: null,
        first_report_at: T0,
        updated_at: T0,
        last_move_at: T0,
      },
    ]);
    expect(snap.samples).toEqual({
      [milestoneKey("FGA", "M12")]: [{ at: T0, work: 3 / 7, clock: 0.25, finished: 3, total: 7 }],
    });
  });
});

describe("Board.report, a tracked milestone", () => {
  it("replaces the snapshot whole and keeps the first report time", async () => {
    const board = newBoard();
    await board.report(aReport(), T0);
    const moved = aReport({
      agent: "codex",
      active_hours: 3.5,
      lanes: {
        ready_for_work: 2,
        in_progress: 1,
        needs_terry: 1,
        ready_for_review: 1,
        completed: 2,
      },
      needs_me: "Approve the demo.",
    });
    const second = await board.report(moved, T0 + 120);
    expect(second).toMatchObject({ ok: true, plan: { added: false, sampleOutcome: "stored" } });

    let [m] = (await board.snapshot()).milestones;
    expect(m).toMatchObject({
      agent: "codex",
      active_hours: 3.5,
      lanes: moved.lanes,
      reported_needs_me: "Approve the demo.",
      first_report_at: T0,
      updated_at: T0 + 120,
      last_move_at: T0 + 120,
    });

    // The newest report wins whole: a report without needs_me clears it.
    await board.report(aReport({ lanes: moved.lanes, active_hours: 4 }), T0 + 240);
    const snap = await board.snapshot();
    [m] = snap.milestones;
    expect(m?.reported_needs_me).toBeNull();
    expect(snap.samples[milestoneKey("FGA", "M12")]?.map((s) => s.at)).toEqual([
      T0,
      T0 + 120,
      T0 + 240,
    ]);
  });
});

describe("Board.report, repeats and refusals", () => {
  it("appends no duplicate sample for a repeated picture, but stays fresh", async () => {
    const board = newBoard();
    await board.report(aReport(), T0);
    const repeat = await board.report(aReport({ agent: "codex" }), T0 + 30);
    expect(repeat).toMatchObject({ ok: true, plan: { added: false, sampleOutcome: "duplicate" } });

    const snap = await board.snapshot();
    expect(snap.milestones[0]?.updated_at).toBe(T0 + 30);
    expect(snap.samples[milestoneKey("FGA", "M12")]).toHaveLength(1);
    expect(await countSamples(board)).toBe(1);
  });

  it("changes nothing when the plan refuses the report", async () => {
    const board = newBoard();
    await board.report(aReport(), T0 + 100);
    const before = await board.snapshot();
    const result = await board.report(aReport({ active_hours: 5 }), T0);
    expect(result).toEqual({ ok: false, error: "clock_went_backward" });
    expect(await board.snapshot()).toEqual(before);
  });
});

describe("Board.stop", () => {
  it("deletes the milestone and all its samples, and a later report starts over", async () => {
    const board = newBoard();
    await board.report(aReport(), T0);
    await board.report(aReport({ active_hours: 3 }), T0 + 120);
    await board.report(aReport({ project: "Other" }), T0 + 120);
    expect(await countSamples(board)).toBe(3);

    const stopped = await board.stop({ project: "FGA", milestone: "M12" });
    expect(stopped).toMatchObject({ project: "FGA", milestone: "M12", updated_at: T0 + 120 });

    const snap = await board.snapshot();
    expect(snap.milestones.map((m) => m.project)).toEqual(["Other"]);
    expect(Object.keys(snap.samples)).toEqual([milestoneKey("Other", "M12")]);
    expect(await countSamples(board)).toBe(1);

    expect(await board.stop({ project: "FGA", milestone: "M12" })).toBeNull();

    const again = await board.report(aReport(), T0 + 600);
    expect(again).toMatchObject({ ok: true, plan: { added: true } });
    const fga = (await board.snapshot()).milestones.find((m) => m.project === "FGA");
    expect(fga?.first_report_at).toBe(T0 + 600);
  });
});

describe("milestone keys (api.md 4.3)", () => {
  it("match ASCII case-insensitively and show the newest spelling", async () => {
    const board = newBoard();
    await board.report(aReport({ project: "FGA", milestone: "M12" }), T0);
    const second = await board.report(aReport({ project: "fga", milestone: "m12" }), T0 + 120);
    expect(second).toMatchObject({ ok: true, plan: { added: false } });

    const snap = await board.snapshot();
    expect(snap.milestones).toHaveLength(1);
    expect(snap.milestones[0]).toMatchObject({ project: "fga", milestone: "m12" });
    expect(Object.keys(snap.samples)).toEqual([milestoneKey("FgA", "M12")]);

    expect(await board.stop({ project: "Fga", milestone: "M12" })).toMatchObject({
      project: "fga",
    });
    expect((await board.snapshot()).milestones).toEqual([]);
  });

  it("fold no character outside ASCII", async () => {
    // KELVIN SIGN lowercases to "k" under String.prototype.toLowerCase; api.md 4.3 forbids that.
    const kelvin = `${String.fromCharCode(0x21_2a)}iwi`;
    const board = newBoard();
    await board.report(aReport({ project: "kiwi" }), T0);
    await board.report(aReport({ project: kelvin }), T0);
    await board.report(aReport({ project: "Équipe" }), T0);
    await board.report(aReport({ project: "équipe" }), T0);
    expect((await board.snapshot()).milestones).toHaveLength(4);
    expect(milestoneKey(kelvin, "M12")).not.toBe(milestoneKey("kiwi", "M12"));
  });
});

describe("durability", () => {
  it("survives eviction and a fresh stub", async () => {
    const name = crypto.randomUUID();
    const first = env.BOARD.getByName(name);
    await first.report(aReport(), T0);
    const before = await first.snapshot();

    await evictDurableObject(first);
    const fresh = env.BOARD.getByName(name);
    expect(await fresh.snapshot()).toEqual(before);
    expect(before.milestones).toHaveLength(1);
  });
});

describe("retention alarm (api.md section 10)", () => {
  it("is armed about a day out when the object first starts", async () => {
    const board = newBoard();
    await board.snapshot();
    const alarm = await runInDurableObject(board, (_instance, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    const hoursOut = ((alarm ?? 0) - Date.now()) / 3_600_000;
    expect(hoursOut).toBeGreaterThan(23);
    expect(hoursOut).toBeLessThanOrEqual(24);
  });

  it("prunes samples older than 14 days, keeps the milestone, and re-arms", async () => {
    const board = newBoard();
    const now = Math.floor(Date.now() / 1000);
    await board.report(aReport(), now - 15 * DAY);
    await board.report(aReport({ active_hours: 3 }), now - DAY);
    expect(await countSamples(board)).toBe(2);

    expect(await runDurableObjectAlarm(board)).toBe(true);

    const snap = await board.snapshot();
    expect(snap.milestones).toHaveLength(1);
    expect(snap.samples[milestoneKey("FGA", "M12")]?.map((s) => s.at)).toEqual([now - DAY]);
    const rearmed = await runInDurableObject(board, (_instance, state) => state.storage.getAlarm());
    expect(rearmed).not.toBeNull();
  });
});
