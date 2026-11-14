// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: a flat list of cases, one object each; splitting by line count would cut an area in two.
// Clock-free cases for the name rules (api.md 4.1, 4.3) and the bounds of every field.
// The needs_me name rules are in needs-me.ts: needs_me turns a card red, so they run on the test
// deployment only.
import assert from "node:assert/strict";
import type { Case, Harness } from "../types.ts";
import {
  asciiLower,
  asciiUpper,
  compareCodePoints,
  EDGE_WHITESPACE,
  eachSeries,
  expectError,
  findMilestone,
  hex,
  lanesOf,
  problemsOf,
  range,
  reportBody,
  STOP_PATH,
  stateOf,
  type Tracker,
  tracker,
} from "./helpers.ts";

/** The control characters and line breaks that are refused anywhere in a name. */
const CONTROLS = [...range(0x00, 0x1f), ...range(0x7f, 0x9f), 0x20_28, 0x20_29];

/** Whitespace that is not a control character, so it MAY appear inside a name. */
const INNER_WHITESPACE = EDGE_WHITESPACE.filter((point) => !CONTROLS.includes(point));

const MILESTONE = "names";
const EDGE_SAMPLE = [0x09, 0x0a, 0x20, 0x85, 0xa0, 0x20_28, 0x30_00, 0xfe_ff];
const CONTROL_SAMPLE = [0x00, 0x0a, 0x1f, 0x7f, 0x85, 0x9f, 0x20_28, 0x20_29];

// biome-ignore lint/complexity/useMaxParams: the call reads as "harness, tracker, body, label, path" at every site; an options object would only add braces.
async function expectRefusedName(
  h: Harness,
  t: Tracker,
  body: Record<string, unknown>,
  label: string,
  path: string,
): Promise<void> {
  const reply = await t.send(body);
  expectError(h, reply, 400, "invalid_report", label);
  assert.ok(
    problemsOf(reply).some((problem) => problem.path === path),
    `${label}: no problem at ${path}; got ${reply.text.slice(0, 300)}`,
  );
}

async function expectRefusedStopName(
  h: Harness,
  project: string,
  milestone: string,
  label: string,
): Promise<void> {
  const reply = await h.request("POST", STOP_PATH, { body: { project, milestone } });
  expectError(h, reply, 400, "invalid_stop", label);
}

async function expectNoMilestoneNamed(h: Harness, milestone: string, label: string): Promise<void> {
  const state = await stateOf(h);
  const strays = state.milestones.filter(
    (entry) => entry.project.includes(h.runId) && entry.milestone.includes(milestone),
  );
  assert.deepEqual(strays, [], `${label}: a refused name was stored`);
}

export const nameCases: Case[] = [
  {
    id: "API-040",
    title: "A project with Unicode whitespace at its end is refused, never trimmed",
    tier: "clock-free",
    cites:
      "api.md 4.1: names MUST NOT start or end with whitespace (the fixed set, U+FEFF included); the start is API-049",
    async run(h) {
      const t = tracker(h);
      try {
        await eachSeries(EDGE_WHITESPACE, async (point) => {
          const space = String.fromCodePoint(point);
          await expectRefusedName(
            h,
            t,
            reportBody(`${h.project()}${space}`, MILESTONE),
            `project with ${hex(point)} last`,
            "/project",
          );
        });
        await expectNoMilestoneNamed(h, MILESTONE, "whitespace at the edge of a project");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-041",
    title: "A milestone with whitespace at either end is refused, in a report and in a stop",
    tier: "clock-free",
    cites: "api.md 4.1, 5: the same name rules for a report and a stop",
    async run(h) {
      const t = tracker(h);
      try {
        await eachSeries(EDGE_SAMPLE, async (point) => {
          const space = String.fromCodePoint(point);
          await expectRefusedName(
            h,
            t,
            reportBody(h.project(), `${space}edge`),
            `milestone ${hex(point)} first`,
            "/milestone",
          );
          await expectRefusedName(
            h,
            t,
            reportBody(h.project(), `edge${space}`),
            `milestone ${hex(point)} last`,
            "/milestone",
          );
          await expectRefusedStopName(
            h,
            h.project(),
            `${space}edge`,
            `stop milestone ${hex(point)} first`,
          );
          await expectRefusedStopName(
            h,
            `${h.project()}${space}`,
            "edge",
            `stop project ${hex(point)} last`,
          );
        });
        await expectNoMilestoneNamed(h, "edge", "whitespace at the edge of a milestone");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-042",
    title: "A control character or line break anywhere in a project is refused",
    tier: "clock-free",
    cites: "api.md 4.1: U+0000-U+001F, U+007F-U+009F, U+2028 and U+2029 MUST NOT appear in a name",
    async run(h) {
      const t = tracker(h);
      try {
        await eachSeries(CONTROLS, async (point) => {
          const control = String.fromCodePoint(point);
          await expectRefusedName(
            h,
            t,
            reportBody(`${h.project()} a${control}b`, MILESTONE),
            `project with ${hex(point)} inside`,
            "/project",
          );
        });
        await expectNoMilestoneNamed(h, MILESTONE, "a control character in a project");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-043",
    title:
      "A control character or line break inside a milestone is refused, in a report and in a stop",
    tier: "clock-free",
    cites: "api.md 4.1, 5: the same name rules for a report and a stop",
    async run(h) {
      const t = tracker(h);
      try {
        await eachSeries(CONTROL_SAMPLE, async (point) => {
          const control = String.fromCodePoint(point);
          await expectRefusedName(
            h,
            t,
            reportBody(h.project(), `in${control}side`),
            `milestone with ${hex(point)} inside`,
            "/milestone",
          );
          await expectRefusedStopName(
            h,
            h.project(),
            `in${control}side`,
            `stop milestone with ${hex(point)} inside`,
          );
          await expectRefusedStopName(
            h,
            `${h.project()}${control}`,
            "inside",
            `stop project with ${hex(point)} last`,
          );
        });
        await expectNoMilestoneNamed(h, "side", "a control character in a milestone");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-044",
    title:
      "Whitespace that is not a control character is allowed inside a name, and names are not trimmed",
    tier: "clock-free",
    cites: "api.md 4.1: a whitespace character that is not also a control MAY appear inside a name",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        await eachSeries(INNER_WHITESPACE, async (point) => {
          const space = String.fromCodePoint(point);
          const name = `a${space}b`;
          const response = await t.ok(
            reportBody(`${project}${space}in`, name),
            undefined,
            `${hex(point)} inside both names`,
          );
          assert.equal(
            response.project,
            `${project}${space}in`,
            `${hex(point)}: the project was changed`,
          );
          assert.equal(response.milestone, name, `${hex(point)}: the milestone was changed`);
        });
        const slash = await t.ok(
          reportBody(`${project}/with/slashes`, "m/12"),
          undefined,
          "slashes",
        );
        assert.equal(slash.milestone, "m/12", "a slash in a milestone");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-045",
    title:
      "Lengths count code points: 64 project and 32 milestone characters pass, one more is refused",
    tier: "clock-free",
    cites: "api.md 4.1: lengths count Unicode code points, as JSON Schema's maxLength does",
    async run(h) {
      const t = tracker(h);
      try {
        const prefix = h.project();
        const room = 64 - [...prefix].length;
        assert.ok(room >= 1, `the run ID is too long for a 64-character project: "${prefix}"`);
        const ascii64 = `${prefix}${"x".repeat(room)}`;
        const emoji64 = `${prefix}${"\u{1F600}".repeat(room)}`;
        await t.ok(reportBody(ascii64, "limits"), undefined, "64 ASCII characters");
        const wide = await t.ok(
          reportBody(emoji64, "limits"),
          undefined,
          "64 code points, 128 UTF-16 units",
        );
        assert.equal(wide.project, emoji64, "the astral project was changed");
        await expectRefusedName(
          h,
          t,
          reportBody(`${ascii64}x`, "limits"),
          "65 ASCII characters",
          "/project",
        );
        await expectRefusedName(
          h,
          t,
          reportBody(`${emoji64}\u{1F600}`, "limits"),
          "65 code points",
          "/project",
        );
        const milestone32 = "\u{1F3CA}".repeat(32);
        await t.ok(
          reportBody(prefix, milestone32),
          undefined,
          "32-code-point milestone, 64 UTF-16 units",
        );
        await t.ok(reportBody(prefix, "m".repeat(32)), undefined, "32 ASCII characters");
        await expectRefusedName(
          h,
          t,
          reportBody(prefix, `${milestone32}x`),
          "33 code points",
          "/milestone",
        );
        await expectRefusedName(
          h,
          t,
          reportBody(prefix, "m".repeat(33)),
          "33 ASCII characters",
          "/milestone",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-046",
    title:
      "The numeric limits are inclusive: 0 and 168 active hours, 168 cap hours, 999 cards a lane",
    tier: "clock-free",
    cites: "api.md 4.1: active_hours 0 to 168, cap_hours over 0 and at most 168, lanes 0 to 999",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      try {
        const zero = await t.ok(
          reportBody(project, "hours 0", { active_hours: 0 }),
          undefined,
          "active_hours 0",
        );
        assert.equal(zero.sample, "none", "active_hours 0 stores no sample");
        const top = await t.ok(
          reportBody(project, "hours 168", { active_hours: 168, cap_hours: 168 }),
          undefined,
          "active_hours and cap_hours 168",
        );
        assert.equal(top.sample, "stored", "168 hours is a defined sample");
        const small = await t.ok(
          reportBody(project, "cap tiny", { cap_hours: 0.01 }),
          undefined,
          "cap_hours 0.01",
        );
        assert.equal(small.sample, "stored", "a tiny cap is still a defined sample");
        const full = lanesOf({
          ready_for_work: 999,
          in_progress: 999,
          needs_terry: 0,
          ready_for_review: 999,
          completed: 999,
        });
        await t.ok(reportBody(project, "lanes 999", { lanes: full }), undefined, "lanes of 999");
        const state = await stateOf(h);
        const entry = findMilestone(state, project, "lanes 999");
        assert.equal(entry?.total, 3996, "the 999-card lanes were not all counted");
        assert.equal(entry?.finished, 1998, "finished is ready_for_review plus completed");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-047",
    title:
      "Names compare ASCII case-insensitively, so the newest spelling wins, and A-Z is the only fold",
    tier: "clock-free",
    cites:
      "api.md 4.3: A-Z match a-z and every other character compares exactly; the newest spelling displays",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const upper = asciiUpper(project);
      try {
        const first = await t.ok(reportBody(project, "Case Probe"), undefined, "first spelling");
        assert.equal(first.added, true, "the first spelling adds");
        const second = await t.ok(reportBody(upper, "CASE PROBE"), undefined, "second spelling");
        assert.equal(
          second.added,
          false,
          "the same name in other ASCII case is the same milestone",
        );
        assert.equal(second.project, upper, "the response echoes the newest project spelling");
        assert.equal(
          second.milestone,
          "CASE PROBE",
          "the response echoes the newest milestone spelling",
        );
        let state = await stateOf(h);
        const mine = state.milestones.filter(
          (entry) => entry.milestone.toLowerCase() === "case probe",
        );
        assert.equal(mine.length, 1, "one milestone, not two");
        assert.equal(mine[0]?.project, upper, "the state shows the newest project spelling");
        assert.equal(
          mine[0]?.milestone,
          "CASE PROBE",
          "the state shows the newest milestone spelling",
        );
        const third = await t.ok(reportBody(project, "case probe"), undefined, "third spelling");
        assert.equal(third.added, false, "a third spelling is still the same milestone");
        state = await stateOf(h);
        assert.equal(
          findMilestone(state, upper, "Case Probe")?.milestone,
          "case probe",
          "the third spelling displays",
        );
        const stop = await h.stop(upper, "CASE probe");
        assert.equal(stop.status, 200, "stop matches in any ASCII case");
        assert.equal(
          (stop.body as { milestone?: string }).milestone,
          "case probe",
          "stop echoes the stored spelling",
        );
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-048",
    title:
      "Non-ASCII letters are not case-folded or normalized: e-acute and E-acute, NFC and NFD, are distinct",
    tier: "clock-free",
    cites: "api.md 4.3: no Unicode case folding or normalization, so every implementation agrees",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const eAcute = String.fromCharCode(0xe9);
      const upperAcute = String.fromCharCode(0xc9);
      const combining = String.fromCharCode(0x3_01);
      const sharpS = String.fromCharCode(0xdf);
      const names = [
        `caf${eAcute}`,
        `caf${upperAcute}`,
        `cafe${combining}`,
        "STRASSE",
        `stra${sharpS}e`,
      ];
      try {
        await eachSeries(names, async (name) => {
          const response = await t.ok(
            reportBody(project, name),
            undefined,
            `milestone ${JSON.stringify(name)}`,
          );
          assert.equal(
            response.added,
            true,
            `${JSON.stringify(name)} MUST be a milestone of its own`,
          );
        });
        const state = await stateOf(h);
        const mine = state.milestones
          .filter((entry) => entry.project === project)
          .map((entry) => entry.milestone);
        const sorted = names.toSorted((a, b) => compareCodePoints(asciiLower(a), asciiLower(b)));
        assert.deepEqual(
          mine,
          sorted,
          "api.md 6.9: sorted by ASCII-lowercased name, then by code point",
        );
        const again = await t.ok(
          reportBody(project, `CAF${eAcute}`),
          undefined,
          "ASCII letters fold, accents do not",
        );
        assert.equal(again.added, false, "CAF-e-acute is caf-e-acute in another ASCII case");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-049",
    title:
      "A project that is empty, or starts with whitespace, is refused, in a report and in a stop",
    tier: "timed",
    cites:
      "api.md 4.1, 5: 1-64 characters, no whitespace at either end; timed because these names carry no zz acceptance prefix, which the clock-free guard refuses",
    async run(h) {
      const t = tracker(h);
      try {
        await expectRefusedName(h, t, reportBody("", MILESTONE), "empty project", "/project");
        await expectRefusedStopName(h, "", MILESTONE, "stop with an empty project");
        await eachSeries(EDGE_WHITESPACE, async (point) => {
          const space = String.fromCodePoint(point);
          const label = `project with ${hex(point)} first`;
          const body = reportBody(`${space}${h.project()}`, MILESTONE);
          await expectRefusedName(h, t, body, label, "/project");
          await expectRefusedStopName(h, `${space}${h.project()}`, MILESTONE, `stop, ${label}`);
        });
        await expectNoMilestoneNamed(h, MILESTONE, "whitespace at the start of a project");
      } finally {
        await t.cleanup();
      }
    },
  },
];
