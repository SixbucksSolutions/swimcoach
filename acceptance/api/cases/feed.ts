// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// Timed cases for the health box (api.md 6.7) and for the spark timeline (api.md 6.9).
// These cases need a board with nothing else on it, so they stop every listed milestone first
// (api.md 9); they run in the full tier only, on the test deployment.
import assert from "node:assert/strict";
import type { Case, Harness } from "../types.ts";
import {
  baseTime,
  clearBoard,
  eachSeries,
  expectedSparkLength,
  expectSparkPoint,
  lanesOf,
  mustFind,
  reportBody,
  sparkIndexes,
  stateOf,
  tracker,
} from "./helpers.ts";

const MINUTE = 60;

/** Sends `count` distinct reports 2 minutes apart, then checks the spark against api.md 6.9. */
async function checkSpark(h: Harness, count: number, name: string): Promise<void> {
  await clearBoard(h);
  const t = tracker(h);
  const project = h.project();
  const start = baseTime();
  const cap = 10;
  const sent: { time: number; value: number }[] = [];
  try {
    await eachSeries(
      Array.from({ length: count }, (_, index) => index),
      async (index) => {
        const time = start + index * 2 * MINUTE;
        const hours = Number((0.1 + index * 0.01).toFixed(2));
        const finished = Math.min(10, Math.floor(index / 16));
        const lanes = lanesOf({ ready_for_work: 10 - finished, ready_for_review: finished });
        const response = await t.ok(
          reportBody(project, name, { active_hours: hours, cap_hours: cap, lanes }),
          time,
          `report ${index}`,
        );
        assert.equal(
          response.sample,
          "stored",
          `report ${index} MUST store a sample, or the count below is wrong`,
        );
        sent.push({ time, value: finished / 10 / (hours / cap) });
      },
    );
    const last = start + (count - 1) * 2 * MINUTE;
    const entry = mustFind(await stateOf(h, last), project, name, `${count} samples`);
    assert.equal(
      entry.spark.length,
      expectedSparkLength(count),
      `spark length for ${count} samples`,
    );
    assert.ok(entry.spark.length <= 159, "spark never exceeds 159 points");
    sparkIndexes(count).forEach((index, position) => {
      const point = sent[index];
      assert.ok(point, "spark index is out of range");
      expectSparkPoint(
        entry.spark[position],
        point.time,
        point.value,
        `spark[${position}] is sample ${index}`,
      );
    });
  } finally {
    await t.cleanup();
  }
}

export const feedCases: Case[] = [
  {
    id: "API-130",
    title:
      "feed is no_data on an empty board, with last_report_at null, and again after the last stop",
    tier: "timed",
    cites: "api.md 6.1, 6.7: no_data when no milestone is tracked",
    async run(h) {
      await clearBoard(h);
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      try {
        const empty = await stateOf(h, start);
        assert.deepEqual(
          [empty.feed, empty.last_report_at, empty.milestones],
          ["no_data", null, []],
          "empty board",
        );
        await t.ok(reportBody(project, "was here"), start, "report");
        assert.equal((await stateOf(h, start)).feed, "live", "one fresh milestone");
        assert.equal((await h.stop(project, "was here")).status, 200, "stop");
        const after = await stateOf(h, start + MINUTE);
        assert.deepEqual(
          [after.feed, after.last_report_at, after.milestones],
          ["no_data", null, []],
          "after the stop",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-131",
    title:
      "feed is idle when every tracked milestone is done, however long ago, and live again when one is not",
    tier: "timed",
    cites: "api.md 6.7: first match wins, so idle outranks stale",
    async run(h) {
      await clearBoard(h);
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const done = lanesOf({ ready_for_review: 2, completed: 2 });
      try {
        await t.ok(reportBody(project, "done one", { lanes: done }), start, "done one");
        await t.ok(
          reportBody(project, "done two", { lanes: lanesOf({ completed: 1 }) }),
          start + 5 * MINUTE,
          "done two",
        );
        await eachSeries(
          [MINUTE, 24 * MINUTE, 26 * MINUTE, 6 * 3600, 30 * 3600],
          async (offset) => {
            const state = await stateOf(h, start + 5 * MINUTE + offset);
            assert.equal(state.feed, "idle", `feed ${offset} s after the last report`);
          },
        );
        await t.ok(reportBody(project, "open"), start + 10 * MINUTE, "an unfinished milestone");
        const live = await stateOf(h, start + 10 * MINUTE);
        assert.equal(live.feed, "live", "not every milestone is done");
        h.expectClose(
          live.last_report_at,
          start + 10 * MINUTE,
          "last_report_at is the newest updated_at",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-132",
    title:
      "feed is live up to 25 minutes after the newest report on the board, and stale after, even if others are older",
    tier: "timed",
    cites:
      "api.md 6.7: stale when now - last_report_at > stale_minutes; last_report_at is the newest updated_at",
    async run(h) {
      await clearBoard(h);
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      try {
        await t.ok(reportBody(project, "old"), start, "old");
        await t.ok(reportBody(project, "recent"), start + 20 * MINUTE, "recent");
        const live = await stateOf(h, start + 45 * MINUTE);
        assert.equal(
          live.feed,
          "live",
          "45 min after the old one, 25 min after the newest: not over 25",
        );
        h.expectClose(live.last_report_at, start + 20 * MINUTE, "last_report_at");
        assert.equal(
          mustFind(live, project, "old", "45 min").stale,
          true,
          "the old milestone is stale on its own",
        );
        assert.equal(
          mustFind(live, project, "recent", "45 min").stale,
          false,
          "the recent one is not",
        );
        const stale = await stateOf(h, start + 45 * MINUTE + 1);
        assert.equal(stale.feed, "stale", "25 min and 1 s after the newest report");
        await t.ok(reportBody(project, "old"), start + 46 * MINUTE, "the old one reports again");
        assert.equal(
          (await stateOf(h, start + 46 * MINUTE)).feed,
          "live",
          "a report brings the feed back",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-140",
    title: "spark holds one point per stored sample, oldest first, up to 80 samples",
    tier: "timed",
    cites: "api.md 6.9: [round(ts), round(work / clock, 4)] per sample; step is 1 while n < 160",
    async run(h) {
      await checkSpark(h, 80, "spark 80");
    },
  },
  {
    id: "API-141",
    title: "spark thins past 80 samples: every 2nd of the first n-1, then the newest",
    tier: "timed",
    cites: "api.md 6.9: step = max(1, floor(n / 80)); 160 samples give 81 points",
    async run(h) {
      await checkSpark(h, 160, "spark 160");
    },
  },
];
