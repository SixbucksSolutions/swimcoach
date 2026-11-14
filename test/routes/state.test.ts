// GET /api/state (MVP-07 A): the body builder against api.md section 6, and one trip through the
// real Durable Object. The contract's examples are in state-examples.test.ts.

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { milestoneKey } from "../../src/board/store.ts";
import type { Report } from "../../src/contract.ts";
import { boardStub } from "../../src/http.ts";
import { handleState } from "../../src/routes/state.ts";
import {
  aSample,
  type Body,
  build,
  HOUR,
  lanes,
  MINUTE,
  problemsOf,
  snapshotOf,
  stored,
  T0,
} from "./state-support.ts";

describe("stateBody top level", () => {
  it("answers no_data with a null last_report_at for an empty board", () => {
    const body = build(snapshotOf([]), T0);
    expect(body).toMatchObject({ now: T0, last_report_at: null, feed: "no_data", milestones: [] });
    expect(body.thresholds).toEqual({
      stale_minutes: 25,
      stall_minutes: 45,
      trend_minutes: 60,
      min_history_minutes: 45,
      min_block_used: 0.15,
      min_stories_for_rtr: 3,
    });
  });

  it("answers idle when every milestone is done, however old the reports are", () => {
    const done = lanes({ ready_for_review: 2, completed: 1 });
    const body = build(snapshotOf([stored({ lanes: done, updated_at: T0 - 5 * HOUR })]), T0);
    expect(body.feed).toBe("idle");
    expect(body.milestones[0]).toMatchObject({ color: "done", reason: "done", stale: false });
  });

  it("answers stale only past stale_minutes since the newest report", () => {
    const m = stored({ updated_at: T0 - 25 * MINUTE });
    expect(build(snapshotOf([m]), T0).feed).toBe("live");
    expect(build(snapshotOf([m]), T0 + 1).feed).toBe("stale");
  });

  it("measures the feed from the newest report across milestones", () => {
    const old = stored({ milestone: "T01", updated_at: T0 - 3 * HOUR });
    const fresh = stored({ milestone: "T02", updated_at: T0 - MINUTE });
    const body = build(snapshotOf([old, fresh]), T0);
    expect(body.feed).toBe("live");
    expect(body.last_report_at).toBe(T0 - MINUTE);
  });

  it("is live when a done milestone sits beside a working one", () => {
    const done = stored({ milestone: "T01", lanes: lanes({ completed: 2 }) });
    const working = stored({ milestone: "T02" });
    expect(build(snapshotOf([done, working]), T0).feed).toBe("live");
  });
});

describe("stateBody ordering (api.md 6.9)", () => {
  function order(names: readonly (readonly [string, string])[]): string[] {
    const ms = names.map(([project, milestone]) => stored({ project, milestone }));
    return build(snapshotOf(ms), T0).milestones.map((c) => `${c.project} ${c.milestone}`);
  }

  it("sorts by project then milestone, ignoring ASCII case", () => {
    const sorted = order([
      ["fga", "T10"],
      ["Alpha", "b"],
      ["alpha", "A"],
      ["FGA", "T02"],
    ]);
    expect(sorted).toEqual(["alpha A", "Alpha b", "FGA T02", "fga T10"]);
  });

  it("breaks exact lowercase ties by code point, uppercase first", () => {
    const sorted = order([
      ["fga", "t1"],
      ["FGA", "t1"],
      ["FGA", "T1"],
    ]);
    expect(sorted).toEqual(["FGA T1", "FGA t1", "fga t1"]);
  });

  it("compares by code point, not by UTF-16 code unit", () => {
    const astral = String.fromCodePoint(0x1_f3_ca);
    const highBmp = String.fromCharCode(0xff_21);
    expect(
      order([
        [astral, "M1"],
        [highBmp, "M1"],
      ]),
    ).toEqual([`${highBmp} M1`, `${astral} M1`]);
  });

  it("does not fold non-ASCII case", () => {
    const upper = String.fromCharCode(0xc9);
    const lower = String.fromCharCode(0xe9);
    expect(
      order([
        [lower, "M1"],
        [upper, "M1"],
      ]),
    ).toEqual([`${upper} M1`, `${lower} M1`]);
  });
});

describe("stateBody D1 and silence", () => {
  it("gives a one-story milestone its math but a D1 card", () => {
    const m = stored({
      project: "dotfiles",
      milestone: "M1",
      active_hours: 0.75,
      cap_hours: 2,
      lanes: lanes({ in_progress: 1 }),
    });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card).toMatchObject({
      mode: "count_and_time",
      color: "green",
      reason: "under_budget",
      stale: false,
    });
    expect(card?.metrics).toMatchObject({ work: 0, clock: 0.375, rtr: 0, too_early: true });
  });

  it("turns a D1 card yellow over budget", () => {
    const m = stored({ active_hours: 2.6, cap_hours: 2, lanes: lanes({ in_progress: 1 }) });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card).toMatchObject({ color: "yellow", reason: "over_budget" });
  });

  it("marks a silent agent and a stalled lane count", () => {
    const m = stored({ updated_at: T0 - 26 * MINUTE, last_move_at: T0 - 50 * MINUTE });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card).toMatchObject({ stale: true, stalled: true, color: "gray", reason: "silent" });
  });

  it("builds a spark from the milestone's own samples only", () => {
    const own = [aSample(T0 - 600, 0.25), aSample(T0, 0.5)];
    const body = build(
      snapshotOf([stored(), stored({ milestone: "T05" })], { [milestoneKey("FGA", "T04")]: own }),
      T0,
    );
    expect(body.milestones[0]?.spark).toEqual([
      [T0 - 600, 1],
      [T0, 2],
    ]);
    expect(body.milestones[1]?.spark).toEqual([]);
  });
});

describe("stateBody needs_me (api.md 6.4)", () => {
  it("words one ticket in Needs Terry as a red card", () => {
    const m = stored({ lanes: lanes({ ready_for_work: 2, needs_terry: 1, completed: 1 }) });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card).toMatchObject({
      needs_me: "1 ticket in Needs Terry",
      color: "red",
      reason: "needs_terry",
    });
  });

  it("words several tickets in Needs Terry in the plural", () => {
    const m = stored({ lanes: lanes({ ready_for_work: 1, needs_terry: 3, completed: 1 }) });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card?.needs_me).toBe("3 tickets in Needs Terry");
  });

  it("prefers the report's own needs_me to the server's sentence", () => {
    const m = stored({
      lanes: lanes({ ready_for_work: 2, needs_terry: 1, completed: 1 }),
      reported_needs_me: "Pick an index strategy",
    });
    const [card] = build(snapshotOf([m]), T0).milestones;
    expect(card?.needs_me).toBe("Pick an index strategy");
  });
});

describe("handleState through the Board", () => {
  it("answers a report written through Board.report", async () => {
    const report: Report = {
      agent: "claude",
      project: "FGA",
      milestone: "T04",
      active_hours: 1,
      cap_hours: 4,
      lanes: lanes({ ready_for_work: 2, in_progress: 1, needs_terry: 1, completed: 1 }),
    };
    expect(await boardStub(env).report(report, T0)).toMatchObject({ ok: true });

    const response = await handleState(env, T0 + 10);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as Body;
    expect(problemsOf(body)).toEqual([]);
    expect(body).toMatchObject({ now: T0 + 10, last_report_at: T0, feed: "live" });
    expect(body.milestones).toHaveLength(1);
    expect(body.milestones[0]).toMatchObject({
      project: "FGA",
      milestone: "T04",
      needs_me: "1 ticket in Needs Terry",
      color: "red",
      spark: [[T0, 0.8]],
    });
  });
});
