// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: a flat list of cases, one object each; splitting by line count would cut an area in two.
// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: a timed case is a script of reports and checks in order; cutting it into helpers hides the order that is the test.
// Timed cases for the test clock and for everything that depends on time (api.md 4.4, 6.2, 9).
import assert from "node:assert/strict";
import type { Case } from "../types.ts";
import {
  baseTime,
  CLOCK_HEADER,
  DAY,
  eachSeries,
  expectConsistent,
  expectError,
  expectReported,
  findMilestone,
  lanesOf,
  mustFind,
  REPORT_PATH,
  reportBody,
  STATE_PATH,
  STOP_PATH,
  stateOf,
  tracker,
} from "./helpers.ts";

const MINUTE = 60;
const BAD_CLOCKS = [
  "abc",
  "-1",
  "+5",
  "1e9",
  "1.2.3",
  "0x10",
  "1794573043.",
  ".5",
  "1794573043.1234567",
  // biome-ignore lint/security/noSecrets: a malformed header value, not a secret.
  "1234567890123",
];

export const timeCases: Case[] = [
  {
    id: "API-120",
    title:
      "A malformed Swimcoach-Test-Now is 400 invalid_test_clock; a fraction is honored as given",
    tier: "timed",
    cites:
      "api.md 9: the header matches ^[0-9]{1,12}(\\.[0-9]{1,6})?$; its value becomes now; the check precedes Content-Type",
    async run(h) {
      const project = h.project();
      const body = reportBody(project, "bad clock");
      const t = tracker(h);
      try {
        await eachSeries(BAD_CLOCKS, async (value) => {
          const headers = { [CLOCK_HEADER]: value };
          const label = `${CLOCK_HEADER}: ${value}`;
          expectError(
            h,
            await h.request("GET", STATE_PATH, { headers }),
            400,
            "invalid_test_clock",
            `GET state, ${label}`,
          );
          expectError(
            h,
            await h.request("POST", REPORT_PATH, { body, headers }),
            400,
            "invalid_test_clock",
            `POST report, ${label}`,
          );
          expectError(
            h,
            await h.request("POST", STOP_PATH, {
              body: { project, milestone: "bad clock" },
              headers,
            }),
            400,
            "invalid_test_clock",
            `POST stop, ${label}`,
          );
        });
        const early = await h.request("POST", REPORT_PATH, {
          body,
          headers: { [CLOCK_HEADER]: "abc", "Content-Type": "text/plain" },
        });
        expectError(
          h,
          early,
          400,
          "invalid_test_clock",
          "malformed clock with text/plain (400 before 415)",
        );
        const unknown = await h.request("GET", "/api/2026-11-14/nope", {
          headers: { [CLOCK_HEADER]: "abc" },
        });
        expectError(h, unknown, 404, "not_found", "malformed clock on an unknown path (404 first)");
        assert.equal(
          findMilestone(await stateOf(h), project, "bad clock"),
          undefined,
          "a refused report stored a milestone",
        );
        const at = baseTime() + 0.25;
        h.expectClose((await stateOf(h, at)).now, at, "state.now echoes a fractional test clock");
        const stored = await t.ok(
          reportBody(project, "fraction"),
          at,
          "report at a fractional time",
        );
        h.expectClose(stored.received_at, at, "received_at echoes the test clock");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-121",
    title:
      "Time never runs backward per milestone: an earlier report is 409 clock_went_backward and changes nothing",
    tier: "timed",
    cites: "api.md 9: a report whose T is earlier than the milestone's updated_at MUST get 409",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      try {
        await t.ok(reportBody(project, "backward", { active_hours: 1 }), start + 600, "first");
        const back = await t.send(
          reportBody(project, "backward", { active_hours: 2 }),
          start + 599,
        );
        expectError(h, back, 409, "clock_went_backward", "one second earlier");
        const far = await t.send(reportBody(project, "backward", { active_hours: 3 }), start - DAY);
        expectError(h, far, 409, "clock_went_backward", "a day earlier");
        const entry = mustFind(
          await stateOf(h, start + 700),
          project,
          "backward",
          "after the refusals",
        );
        assert.equal(entry.active_hours, 1, "a refused report changed the snapshot");
        h.expectClose(entry.updated_at, start + 600, "a refused report moved updated_at");
        assert.equal(entry.spark.length, 1, "a refused report stored a sample");
        const same = await t.ok(
          reportBody(project, "backward", { active_hours: 1.5 }),
          start + 600,
          "same instant",
        );
        assert.equal(same.added, false, "a report at exactly updated_at is not earlier");
        const other = await t.ok(
          reportBody(project, "elsewhere"),
          start + 100,
          "another milestone, earlier time",
        );
        assert.equal(
          other.added,
          true,
          "the rule is per milestone, so another milestone MAY report earlier",
        );
        assert.equal((await h.stop(project, "backward")).status, 200, "stop");
        const again = await t.ok(
          reportBody(project, "backward"),
          start + 50,
          "re-added after a stop",
        );
        assert.equal(again.added, true, "a stopped milestone has no updated_at to be earlier than");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-122",
    title: "The duplicate window is 60 s: 59 s later is a duplicate, 60 s later is stored",
    tier: "timed",
    cites: "api.md 4.4 step 4: the newest stored sample was received less than 60 seconds before T",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const body = reportBody(project, "window");
      try {
        const steps: [number, string, Record<string, unknown>, string][] = [
          [0, "stored", {}, "the first report"],
          [59, "duplicate", {}, "59 s after the stored sample"],
          [60, "stored", {}, "60 s after the stored sample (not less than 60)"],
          [119, "duplicate", {}, "59 s after the sample stored at +60"],
          [120, "stored", {}, "60 s after the sample stored at +60"],
          [130, "stored", { active_hours: 1.1 }, "10 s later but the hours changed"],
          [
            135,
            "stored",
            { lanes: lanesOf({ ready_for_work: 1, in_progress: 1, ready_for_review: 1 }) },
            "5 s later but the lanes changed",
          ],
          [
            140,
            "duplicate",
            { lanes: lanesOf({ ready_for_work: 1, in_progress: 1, ready_for_review: 1 }) },
            "5 s later, same lanes",
          ],
        ];
        let stored = 0;
        await eachSeries(steps, async ([offset, sample, overrides, label]) => {
          const reply = await t.send({ ...body, ...overrides }, start + offset);
          const response = expectReported(h, reply, label);
          assert.equal(response.sample, sample, `${label}: sample`);
          if (sample === "stored") {
            stored += 1;
          }
          const entry = mustFind(await stateOf(h, start + offset), project, "window", label);
          assert.equal(entry.spark.length, stored, `${label}: stored samples`);
          h.expectClose(
            entry.updated_at,
            start + offset,
            `${label}: updated_at (a duplicate is a heartbeat)`,
          );
        });
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-123",
    title:
      "last_move_at changes only when a lane count changes, not for hours alone, a heartbeat or a new agent",
    tier: "timed",
    cites: "api.md 4.4 step 3: a change in hours alone is not a move",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const lanes = lanesOf({ ready_for_work: 3, in_progress: 1 });
      try {
        const first = await t.ok(reportBody(project, "moves", { lanes }), start, "first");
        const added = mustFind(await stateOf(h, start), project, "moves", "after the first report");
        h.expectClose(
          added.last_move_at,
          first.received_at,
          "last_move_at starts at first_report_at",
        );
        await t.ok(
          reportBody(project, "moves", { lanes, active_hours: 1.5 }),
          start + 600,
          "hours only",
        );
        await t.ok(
          reportBody(project, "moves", { lanes, active_hours: 1.5, agent: "codex" }),
          start + 1200,
          "heartbeat, other agent",
        );
        let entry = mustFind(
          await stateOf(h, start + 1200),
          project,
          "moves",
          "after hours and heartbeat",
        );
        h.expectClose(entry.last_move_at, start, "hours and heartbeats are not moves");
        h.expectClose(entry.updated_at, start + 1200, "updated_at");
        const moved = lanesOf({ ready_for_work: 2, in_progress: 1, ready_for_review: 1 });
        await t.ok(
          reportBody(project, "moves", { lanes: moved, active_hours: 2 }),
          start + 1800,
          "a card finished",
        );
        entry = mustFind(await stateOf(h, start + 1800), project, "moves", "after a lane change");
        h.expectClose(entry.last_move_at, start + 1800, "a lane change is a move");
        const swapped = lanesOf({ ready_for_work: 3, in_progress: 0, ready_for_review: 1 });
        await t.ok(
          reportBody(project, "moves", { lanes: swapped, active_hours: 2 }),
          start + 2400,
          "cards shuffled, same total",
        );
        entry = mustFind(await stateOf(h, start + 2400), project, "moves", "after a shuffle");
        h.expectClose(entry.last_move_at, start + 2400, "any one lane count changing is a move");
        await t.ok(
          reportBody(project, "moves", { lanes: swapped, active_hours: 2.5 }),
          start + 3000,
          "same lanes again",
        );
        entry = mustFind(await stateOf(h, start + 3000), project, "moves", "after the same lanes");
        h.expectClose(entry.last_move_at, start + 2400, "the same lanes are not a move");
        expectConsistent(entry, "moves");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-124",
    title:
      "stale turns true after 25 minutes of silence, never for a done milestone, and wins over the call",
    tier: "timed",
    cites: "api.md 6.2, 6.6, 6.8: stale is now - updated_at > stale_minutes (25); reason silent",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const ratio = lanesOf({ ready_for_work: 3, in_progress: 2, ready_for_review: 1 });
      const small = lanesOf({ ready_for_work: 1, in_progress: 1 });
      const done = lanesOf({ completed: 4 });
      try {
        await t.ok(reportBody(project, "ratio", { lanes: ratio }), start, "ratio");
        await t.ok(reportBody(project, "two cards", { lanes: small }), start, "two cards");
        await t.ok(reportBody(project, "all done", { lanes: done }), start, "all done");
        const live = await stateOf(h, start + 25 * MINUTE);
        assert.deepEqual(
          live.thresholds,
          {
            stale_minutes: 25,
            stall_minutes: 45,
            trend_minutes: 60,
            min_history_minutes: 45,
            min_block_used: 0.15,
            min_stories_for_rtr: 3,
          },
          "thresholds (api.md 6.8)",
        );
        for (const name of ["ratio", "two cards", "all done"]) {
          assert.equal(
            mustFind(live, project, name, "at 25 min").stale,
            false,
            `${name}: 25 minutes exactly is not over 25`,
          );
        }
        assert.equal(live.feed, "live", "feed at 25 minutes");
        assert.deepEqual(
          [
            mustFind(live, project, "ratio", "25").color,
            mustFind(live, project, "ratio", "25").reason,
          ],
          ["gray", "too_early"],
          "one sample is too early to call",
        );
        const silent = await stateOf(h, start + 25 * MINUTE + 1);
        h.expectClose(silent.now, start + 25 * MINUTE + 1, "state.now");
        for (const [name, color, reason, stale] of [
          ["ratio", "gray", "silent", true],
          ["two cards", "gray", "silent", true],
          ["all done", "done", "done", false],
        ] as const) {
          const entry = mustFind(silent, project, name, "at 25 min + 1 s");
          assert.equal(entry.stale, stale, `${name}: stale`);
          assert.deepEqual(
            [entry.color, entry.reason],
            [color, reason],
            `${name}: color and reason`,
          );
          expectConsistent(entry, name);
        }
        assert.equal(silent.feed, "stale", "feed at 25 minutes and 1 s");
        const late = mustFind(
          await stateOf(h, start + 10 * 3600),
          project,
          "all done",
          "ten hours on",
        );
        assert.deepEqual(
          [late.stale, late.stalled, late.color],
          [false, false, "done"],
          "a done milestone is never stale or stalled",
        );
        await t.ok(
          reportBody(project, "ratio", { lanes: ratio }),
          start + 26 * MINUTE,
          "heartbeat",
        );
        const heard = mustFind(
          await stateOf(h, start + 26 * MINUTE),
          project,
          "ratio",
          "after the heartbeat",
        );
        assert.equal(heard.stale, false, "a new report ends the silence");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-125",
    title:
      "stalled turns true after 45 minutes without a lane change, stays a flag in count_and_time mode",
    tier: "timed",
    cites:
      "api.md 6.2, 6.6, 6.8: stalled is now - last_move_at > stall_minutes (45); it does not turn a D1 card yellow",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const ratio = lanesOf({ ready_for_work: 3, in_progress: 2, ready_for_review: 1 });
      const small = lanesOf({ ready_for_work: 1, in_progress: 1 });
      try {
        await eachSeries([0, 1, 2, 3, 4], async (step) => {
          const at = start + step * 10 * MINUTE;
          const hours = 1 + step * 0.1;
          await t.ok(
            reportBody(project, "ratio", { lanes: ratio, active_hours: hours }),
            at,
            `ratio ${step}`,
          );
          await t.ok(
            reportBody(project, "two cards", { lanes: small, active_hours: hours }),
            at,
            `two cards ${step}`,
          );
        });
        const edge = await stateOf(h, start + 45 * MINUTE);
        assert.equal(
          mustFind(edge, project, "ratio", "45 min").stalled,
          false,
          "45 minutes exactly is not over 45",
        );
        for (const name of ["ratio", "two cards"]) {
          assert.equal(
            mustFind(edge, project, name, "45 min").stale,
            false,
            `${name}: reports every 10 minutes keep it fresh`,
          );
        }
        const hours = 1.5;
        await t.ok(
          reportBody(project, "ratio", { lanes: ratio, active_hours: hours }),
          start + 45 * MINUTE + 1,
          "heartbeat ratio",
        );
        await t.ok(
          reportBody(project, "two cards", { lanes: small, active_hours: hours }),
          start + 45 * MINUTE + 1,
          "heartbeat two",
        );
        const over = await stateOf(h, start + 45 * MINUTE + 1);
        const stalled = mustFind(over, project, "ratio", "45 min + 1 s");
        assert.equal(stalled.stalled, true, "46 minutes without a lane change is stalled");
        assert.equal(stalled.stale, false, "but it reported a second ago");
        expectConsistent(stalled, "ratio, stalled");
        const two = mustFind(over, project, "two cards", "45 min + 1 s");
        assert.equal(two.stalled, true, "the flag is set for a two-card milestone too");
        assert.deepEqual(
          [two.mode, two.color, two.reason],
          ["count_and_time", "green", "under_budget"],
          "stalled does not apply to D1 cards",
        );
        const moved = lanesOf({ ready_for_work: 2, in_progress: 2, ready_for_review: 2 });
        await t.ok(
          reportBody(project, "ratio", { lanes: moved, active_hours: hours }),
          start + 45 * MINUTE + 2,
          "a card finished",
        );
        const after = mustFind(
          await stateOf(h, start + 45 * MINUTE + 2),
          project,
          "ratio",
          "after a lane change",
        );
        assert.equal(after.stalled, false, "a lane change ends the stall");
        h.expectClose(after.last_move_at, start + 45 * MINUTE + 2, "last_move_at");
      } finally {
        await t.cleanup();
      }
    },
  },
];
