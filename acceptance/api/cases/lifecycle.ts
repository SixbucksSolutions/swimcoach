// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: a flat list of cases, one object each; splitting by line count would cut an area in two.
// Clock-free cases for the milestone lifecycle (api.md 4.3, 4.4, 4.5, 5), on the real clock.
// Back-to-back requests are well inside the 60 s duplicate window; a run that stalls for a
// minute between two requests of one case can fail API-061 and MUST be rerun.
import assert from "node:assert/strict";
import type { Case } from "../types.ts";
import {
  eachSeries,
  expectConsistent,
  expectError,
  expectReported,
  findMilestone,
  lanesOf,
  mustFind,
  reportBody,
  SCHEMA,
  stateOf,
  tracker,
} from "./helpers.ts";

export const lifecycleCases: Case[] = [
  {
    id: "API-060",
    title:
      "The first report adds the milestone, with first_report_at, updated_at and last_move_at equal",
    tier: "clock-free",
    cites: "api.md 4.4 steps 1-2, 4.5: added true; the response echoes the stored spelling",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        const reply = await t.send(reportBody(project, "adds", { agent: "codex" }));
        const response = expectReported(h, reply, "first report");
        assert.equal(response.added, true, "added");
        assert.equal(response.sample, "stored", "three cards and one hour is a defined sample");
        assert.equal(response.project, project, "project echo");
        assert.equal(response.milestone, "adds", "milestone echo");
        const state = await stateOf(h);
        const entry = mustFind(state, project, "adds", "after the first report");
        assert.equal(entry.agent, "codex", "agent from the newest report");
        assert.equal(entry.first_report_at, response.received_at, "first_report_at is received_at");
        assert.equal(entry.updated_at, response.received_at, "updated_at is received_at");
        assert.equal(
          entry.last_move_at,
          response.received_at,
          "last_move_at starts as first_report_at",
        );
        assert.equal(entry.active_hours, 1, "active_hours");
        assert.equal(entry.cap_hours, 4, "cap_hours");
        assert.deepEqual(entry.lanes, lanesOf({ ready_for_work: 2, in_progress: 1 }), "lanes");
        assert.equal(entry.needs_me, null, "needs_me is null without an ask or a Needs Terry card");
        assert.equal(entry.spark.length, 1, "one stored sample is one spark point");
        assert.ok(
          state.last_report_at !== null && state.last_report_at >= response.received_at,
          "last_report_at",
        );
        expectConsistent(entry, "state after the first report");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-061",
    title:
      "An identical report within 60 s is a duplicate, a changed one is stored, and both refresh updated_at",
    tier: "clock-free",
    cites:
      "api.md 4.4 step 4 and the note after it: a duplicate stores no sample but is a heartbeat",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        const first = await t.ok(reportBody(project, "samples"), undefined, "first");
        assert.deepEqual([first.added, first.sample], [true, "stored"], "first");
        const second = await t.ok(reportBody(project, "samples"), undefined, "identical");
        assert.deepEqual(
          [second.added, second.sample],
          [false, "duplicate"],
          "identical within 60 s",
        );
        const third = await t.ok(
          reportBody(project, "samples", { agent: "codex" }),
          undefined,
          "another agent, same numbers",
        );
        assert.equal(
          third.sample,
          "duplicate",
          "two agents reporting one picture MUST NOT double the evidence",
        );
        let entry = mustFind(await stateOf(h), project, "samples", "after the duplicates");
        assert.equal(entry.spark.length, 1, "duplicates stored no sample");
        assert.equal(entry.updated_at, third.received_at, "a duplicate is still a heartbeat");
        assert.equal(entry.last_move_at, first.received_at, "a duplicate is not a move");
        const fourth = await t.ok(
          reportBody(project, "samples", { active_hours: 1.5 }),
          undefined,
          "hours changed",
        );
        assert.equal(fourth.sample, "stored", "a change in hours is a new sample");
        entry = mustFind(await stateOf(h), project, "samples", "after the changed report");
        assert.equal(entry.spark.length, 2, "two stored samples, two spark points");
        assert.equal(
          entry.last_move_at,
          first.received_at,
          "a change in hours alone is not a move",
        );
        assert.equal(entry.updated_at, fourth.received_at, "updated_at");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-062",
    title:
      "No cards, or no active hours, stores no sample ('none'), yet the milestone is on the board",
    tier: "clock-free",
    cites:
      "api.md 4.4 step 4, 6.3: total 0 or active_hours 0 leaves the sample undefined; work and rtr are null",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        const empty = await t.ok(
          reportBody(project, "no cards", { lanes: lanesOf() }),
          undefined,
          "no cards",
        );
        assert.deepEqual([empty.added, empty.sample], [true, "none"], "total 0");
        const idle = await t.ok(
          reportBody(project, "no hours", { active_hours: 0 }),
          undefined,
          "no hours",
        );
        assert.deepEqual([idle.added, idle.sample], [true, "none"], "active_hours 0");
        const state = await stateOf(h);
        const noCards = mustFind(state, project, "no cards", "total 0");
        assert.equal(noCards.metrics.work, null, "work is null when total is 0");
        assert.equal(noCards.metrics.rtr, null, "rtr is null when total is 0");
        assert.equal(noCards.metrics.too_early, true, "no samples, so too early");
        assert.equal(noCards.spark.length, 0, "no samples, no spark");
        assert.equal(noCards.color, "green", "a milestone with no cards is not done");
        expectConsistent(noCards, "total 0");
        const noHours = mustFind(state, project, "no hours", "active_hours 0");
        assert.equal(noHours.metrics.rtr, null, "rtr is null when clock is 0");
        assert.equal(noHours.spark.length, 0, "no samples, no spark");
        expectConsistent(noHours, "active_hours 0");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-063",
    title: "The newest report replaces the snapshot, even when active_hours went down",
    tier: "clock-free",
    cites: "api.md 4.4 step 2: each report is the agent's complete picture; the newest wins",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        await t.ok(
          reportBody(project, "newest wins", { active_hours: 2, cap_hours: 6 }),
          undefined,
          "first",
        );
        await t.ok(
          reportBody(project, "newest wins", {
            agent: "codex",
            active_hours: 1,
            cap_hours: 3,
            lanes: lanesOf({ ready_for_work: 1, in_progress: 1, ready_for_review: 1 }),
          }),
          undefined,
          "second",
        );
        const entry = mustFind(await stateOf(h), project, "newest wins", "after two reports");
        assert.equal(entry.active_hours, 1, "active_hours went down and the newest still wins");
        assert.equal(entry.cap_hours, 3, "cap_hours");
        assert.equal(entry.agent, "codex", "agent");
        assert.deepEqual(
          entry.lanes,
          lanesOf({ ready_for_work: 1, in_progress: 1, ready_for_review: 1 }),
          "lanes",
        );
        assert.equal(entry.finished, 1, "finished");
        assert.equal(entry.total, 3, "total");
        assert.ok(entry.last_move_at >= entry.first_report_at, "a lane change is a move");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-064",
    title: "A stop removes the milestone at once; a second stop is 404 not_tracked",
    tier: "clock-free",
    cites:
      "api.md 5: the milestone disappears from the state; a stop of an untracked pair is not a success",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        await t.ok(reportBody(project, "stop me"), undefined, "report");
        await t.ok(reportBody(project, "keep me"), undefined, "report");
        const stopped = await h.stop(project, "stop me");
        assert.equal(stopped.status, 200, `stop: ${stopped.text}`);
        h.expectSchema(SCHEMA.stop, stopped.body);
        assert.deepEqual(
          stopped.body,
          { ok: true, project, milestone: "stop me" },
          "stop echoes the stored spelling",
        );
        const state = await stateOf(h);
        assert.equal(
          findMilestone(state, project, "stop me"),
          undefined,
          "the stopped milestone is still listed",
        );
        assert.ok(findMilestone(state, project, "keep me"), "a stop removed a different milestone");
        expectError(h, await h.stop(project, "stop me"), 404, "not_tracked", "the second stop");
        assert.ok(
          findMilestone(await stateOf(h), project, "keep me"),
          "a refused stop changed the board",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-065",
    title: "After a stop, a new report adds the milestone from scratch: added true, no history",
    tier: "clock-free",
    cites: "api.md 5: after a stop a new report adds it again; the samples and events were deleted",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        await t.ok(reportBody(project, "fresh"), undefined, "first");
        await t.ok(reportBody(project, "fresh", { active_hours: 2 }), undefined, "second");
        await t.ok(
          reportBody(project, "fresh", {
            active_hours: 3,
            lanes: lanesOf({ ready_for_work: 1, in_progress: 1, ready_for_review: 1 }),
          }),
          undefined,
          "third",
        );
        const before = mustFind(await stateOf(h), project, "fresh", "before the stop");
        assert.equal(before.spark.length, 3, "three stored samples");
        assert.equal((await h.stop(project, "fresh")).status, 200, "stop");
        const again = await t.ok(
          reportBody(project, "fresh", { active_hours: 3.5 }),
          undefined,
          "re-add",
        );
        assert.equal(again.added, true, "a report after a stop adds again");
        assert.equal(again.sample, "stored", "and stores its own sample");
        const after = mustFind(await stateOf(h), project, "fresh", "after the re-add");
        assert.equal(after.spark.length, 1, "no history survived the stop");
        assert.equal(after.first_report_at, again.received_at, "first_report_at restarts");
        assert.equal(after.last_move_at, again.received_at, "last_move_at restarts");
        assert.ok(
          after.first_report_at >= before.updated_at,
          "the new first report is not older than the old history",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-066",
    title:
      "Milestones are listed by project, then milestone, each ASCII-lowercased, whatever the report order",
    tier: "clock-free",
    cites: "api.md 6.9: milestones order, so a card never changes position",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const other = `${project} b`;
      try {
        const order: [string, string][] = [
          [project, "m2"],
          [other, "a1"],
          [project, "M10"],
          [project, "m1"],
        ];
        await eachSeries(order, async ([owner, name]) => {
          await t.ok(reportBody(owner, name), undefined, `${owner} ${name}`);
        });
        const state = await stateOf(h);
        const mine = state.milestones
          .filter((entry) => entry.project === project || entry.project === other)
          .map((entry) => `${entry.project} / ${entry.milestone}`);
        assert.deepEqual(
          mine,
          [`${project} / m1`, `${project} / M10`, `${project} / m2`, `${other} / a1`],
          "order by project, then milestone, by ASCII-lowercased text",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
];
