// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: a timed case is a script of reports and checks in order; cutting it into helpers hides the order that is the test.
// Timed-tier cases for the ask that turns a card red (api.md 4.1, 6.4, 6.6). They sit in the full
// tier, never in clock-free: a red card chimes and jumps Terry's phone, so production never sees one.
import assert from "node:assert/strict";
import type { Case } from "../types.ts";
import {
  baseTime,
  clearBoard,
  eachSeries,
  expectConsistent,
  expectError,
  lanesOf,
  mustFind,
  problemsOf,
  reportBody,
  stateOf,
  tracker,
} from "./helpers.ts";

const MILESTONE = "ask";

const INNER_ASK = `Review${String.fromCodePoint(0xa0)}the${String.fromCodePoint(0x30_00)}demo`;

function at(point: number): string {
  return String.fromCodePoint(point);
}

const REFUSED_ASKS: { label: string; value: unknown }[] = [
  { label: "an empty string", value: "" },
  { label: "null", value: null },
  { label: "a number", value: 7 },
  { label: "201 characters", value: "n".repeat(201) },
  { label: "a leading space", value: " Review the demo" },
  { label: "a trailing space", value: "Review the demo " },
  { label: "a trailing newline", value: "Review the demo\n" },
  { label: "a leading U+00A0", value: `${at(0xa0)}Review the demo` },
  { label: "a trailing U+FEFF", value: `Review the demo${at(0xfe_ff)}` },
  { label: "a tab inside", value: "Review\tthe demo" },
  { label: "a line break inside", value: "Review\nthe demo" },
  { label: "U+2028 inside", value: `Review${at(0x20_28)}the demo` },
  { label: "U+0085 inside", value: "Review\u0085the demo" },
  { label: "U+007F inside", value: "Review\u007fthe demo" },
];

export const needsMeCases: Case[] = [
  {
    id: "API-150",
    title:
      "needs_me makes the card red and is shown as sent; without it, Needs Terry cards give the server's sentence",
    tier: "timed",
    cites:
      "api.md 6.4, 6.6: needs_me, else 'N ticket(s) in Needs Terry', else null; any non-null value is red; done outranks red",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      const ask = "Confirm the demo on the phone";
      try {
        await t.ok(reportBody(project, MILESTONE, { needs_me: ask }), start, "with an ask");
        let entry = mustFind(await stateOf(h, start), project, MILESTONE, "with an ask");
        assert.deepEqual(
          [entry.needs_me, entry.color, entry.reason],
          [ask, "red", "needs_terry"],
          "a sent ask",
        );
        expectConsistent(entry, "with an ask");
        await t.ok(
          reportBody(project, MILESTONE, { lanes: lanesOf({ ready_for_work: 2, needs_terry: 1 }) }),
          start + 60,
          "one ticket",
        );
        entry = mustFind(await stateOf(h, start + 60), project, MILESTONE, "one ticket");
        assert.deepEqual(
          [entry.needs_me, entry.color],
          ["1 ticket in Needs Terry", "red"],
          "one Needs Terry card",
        );
        await t.ok(
          reportBody(project, MILESTONE, { lanes: lanesOf({ in_progress: 1, needs_terry: 2 }) }),
          start + 120,
          "two tickets",
        );
        entry = mustFind(await stateOf(h, start + 120), project, MILESTONE, "two tickets");
        assert.equal(entry.needs_me, "2 tickets in Needs Terry", "two Needs Terry cards");
        const both = { needs_me: ask, lanes: lanesOf({ in_progress: 1, needs_terry: 2 }) };
        await t.ok(reportBody(project, MILESTONE, both), start + 180, "an ask and cards");
        entry = mustFind(await stateOf(h, start + 180), project, MILESTONE, "an ask and cards");
        assert.equal(entry.needs_me, ask, "the sent ask wins over the server's sentence");
        await t.ok(reportBody(project, MILESTONE), start + 240, "the ask cleared");
        entry = mustFind(await stateOf(h, start + 240), project, MILESTONE, "the ask cleared");
        assert.deepEqual(
          [entry.needs_me, entry.color === "red"],
          [null, false],
          "omitting needs_me clears it",
        );
        const done = lanesOf({ completed: 3 });
        await t.ok(
          reportBody(project, MILESTONE, { lanes: done, needs_me: ask }),
          start + 300,
          "done with an ask",
        );
        entry = mustFind(await stateOf(h, start + 300), project, MILESTONE, "done with an ask");
        assert.deepEqual(
          [entry.color, entry.reason],
          ["done", "done"],
          "done outranks red (api.md 6.6, row 1)",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-151",
    title:
      "needs_me is 1 to 200 characters and follows the name rules; the bad ones are invalid_report at /needs_me",
    tier: "timed",
    cites:
      "api.md 4.1: needs_me MUST be omitted rather than sent as an empty string or null; 1-200 chars; the name rules",
    async run(h) {
      await clearBoard(h);
      const t = tracker(h);
      const project = h.project();
      const start = baseTime();
      try {
        await eachSeries(REFUSED_ASKS, async ({ label, value }) => {
          const reply = await t.send(reportBody(project, MILESTONE, { needs_me: value }), start);
          expectError(h, reply, 400, "invalid_report", `needs_me as ${label}`);
          assert.ok(
            problemsOf(reply).some((problem) => problem.path === "/needs_me"),
            `needs_me as ${label}: no problem at /needs_me`,
          );
        });
        assert.deepEqual(
          (await stateOf(h, start)).milestones,
          [],
          "a refused ask stored a milestone",
        );
        const longest = "n".repeat(200);
        await t.ok(reportBody(project, "longest", { needs_me: longest }), start, "200 characters");
        await t.ok(reportBody(project, "shortest", { needs_me: "x" }), start, "1 character");
        await t.ok(
          reportBody(project, "inner", { needs_me: INNER_ASK }),
          start,
          "inner whitespace",
        );
        const state = await stateOf(h, start);
        assert.equal(
          mustFind(state, project, "longest", "200").needs_me,
          longest,
          "a 200-character ask is stored whole",
        );
        assert.equal(
          mustFind(state, project, "inner", "inner").needs_me,
          INNER_ASK,
          "inner whitespace is kept",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
];
