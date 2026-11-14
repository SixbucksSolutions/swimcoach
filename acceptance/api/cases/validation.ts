// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// biome-ignore-all lint/style/noExcessiveLinesPerFile: a flat list of cases, one object each; splitting by line count would cut an area in two.
// Clock-free cases for the checks that run before anything is stored (api.md 4.1, 4.2, 5, 8).
// Every body here is refused or is a control, uses only the "zz acceptance" project, and never
// sends needs_me or a Needs Terry card.
import assert from "node:assert/strict";
import type { Case, Harness } from "../types.ts";
import {
  eachSeries,
  errorCode,
  expectError,
  expectReported,
  findMilestone,
  lanesOf,
  problemsOf,
  REPORT_PATH,
  reportBody,
  STOP_PATH,
  stateOf,
  type Tracker,
  tracker,
  without,
} from "./helpers.ts";

const MILESTONE = "validation";
const KIB = 1024;
const BOM = String.fromCodePoint(0xfe_ff);

/** Sends a body that MUST be refused with invalid_report; checks the code, problems and, when given, a path. */
// biome-ignore lint/complexity/useMaxParams: the call reads as "harness, tracker, body, label, path" at every site; an options object would only add braces.
async function expectInvalid(
  h: Harness,
  t: Tracker,
  body: unknown,
  label: string,
  path?: string,
): Promise<void> {
  const reply = await t.send(body);
  expectError(h, reply, 400, "invalid_report", label);
  const problems = problemsOf(reply);
  const found = path === undefined || problems.some((problem) => problem.path === path);
  assert.ok(found, `${label}: no problem at ${path}; got ${JSON.stringify(problems)}`);
}

async function expectNothingStored(h: Harness, project: string, label: string): Promise<void> {
  const state = await stateOf(h);
  assert.equal(
    findMilestone(state, project, MILESTONE),
    undefined,
    `${label}: a refused request stored a milestone`,
  );
}

/** A report body padded with an unknown field to exactly `size` bytes of JSON. */
function paddedBody(project: string, size: number): string {
  const base = JSON.stringify({ ...reportBody(project, MILESTONE), pad: "" });
  const padding = size - new TextEncoder().encode(base).length;
  assert.ok(padding >= 0, "the base body is larger than the requested size");
  return JSON.stringify({ ...reportBody(project, MILESTONE), pad: "x".repeat(padding) });
}

const MISSING_FIELDS = [
  "agent",
  "project",
  "milestone",
  "active_hours",
  "cap_hours",
  "lanes",
] as const;
const LANE_KEYS = [
  "ready_for_work",
  "in_progress",
  "needs_terry",
  "ready_for_review",
  "completed",
] as const;

const BAD_VALUES: { label: string; overrides: Record<string, unknown>; path: string }[] = [
  { label: "agent claude-code", overrides: { agent: "claude-code" }, path: "/agent" },
  { label: "agent Claude (case)", overrides: { agent: "Claude" }, path: "/agent" },
  { label: "agent empty", overrides: { agent: "" }, path: "/agent" },
  { label: "agent a number", overrides: { agent: 1 }, path: "/agent" },
  { label: "active_hours negative", overrides: { active_hours: -0.01 }, path: "/active_hours" },
  { label: "active_hours 168.01", overrides: { active_hours: 168.01 }, path: "/active_hours" },
  { label: "active_hours a string", overrides: { active_hours: "1" }, path: "/active_hours" },
  { label: "active_hours null", overrides: { active_hours: null }, path: "/active_hours" },
  { label: "cap_hours 0", overrides: { cap_hours: 0 }, path: "/cap_hours" },
  { label: "cap_hours negative", overrides: { cap_hours: -1 }, path: "/cap_hours" },
  {
    label: "cap_hours 240 (minutes by mistake)",
    overrides: { cap_hours: 240 },
    path: "/cap_hours",
  },
  { label: "cap_hours a string", overrides: { cap_hours: "4" }, path: "/cap_hours" },
  {
    label: "lane 1000",
    overrides: { lanes: lanesOf({ in_progress: 1000 }) },
    path: "/lanes/in_progress",
  },
  {
    label: "lane negative",
    overrides: { lanes: lanesOf({ ready_for_work: -1 }) },
    path: "/lanes/ready_for_work",
  },
  {
    label: "lane fractional",
    overrides: { lanes: lanesOf({ completed: 1.5 }) },
    path: "/lanes/completed",
  },
  {
    label: "lane a string",
    overrides: { lanes: { ...lanesOf(), in_progress: "2" } },
    path: "/lanes/in_progress",
  },
  {
    label: "lane null",
    overrides: { lanes: { ...lanesOf(), needs_terry: null } },
    path: "/lanes/needs_terry",
  },
  { label: "lanes an array", overrides: { lanes: [] }, path: "/lanes" },
  { label: "lanes a string", overrides: { lanes: "none" }, path: "/lanes" },
  { label: "lanes null", overrides: { lanes: null }, path: "/lanes" },
  { label: "project a number", overrides: { project: 7 }, path: "/project" },
  { label: "project null", overrides: { project: null }, path: "/project" },
  { label: "milestone empty", overrides: { milestone: "" }, path: "/milestone" },
  { label: "milestone null", overrides: { milestone: null }, path: "/milestone" },
];

const UNKNOWN_FIELDS: { label: string; overrides: Record<string, unknown> }[] = [
  { label: "need_me (a misspelled needs_me)", overrides: { need_me: "Look at it" } },
  { label: "estimate_hours (D2)", overrides: { estimate_hours: 3 } },
  { label: "at (a timestamp)", overrides: { at: 1_794_573_043 } },
  { label: "timestamp", overrides: { timestamp: 1_794_573_043 } },
  { label: "status", overrides: { status: "done" } },
  { label: "a lane named backlog", overrides: { lanes: { ...lanesOf(), backlog: 1 } } },
  { label: "a lane named blocked", overrides: { lanes: { ...lanesOf(), blocked: 1 } } },
];

export const validationCases: Case[] = [
  {
    id: "API-020",
    title: "A write without Content-Type: application/json is 415, before the body is read",
    tier: "clock-free",
    cites: "api.md 4.2, 8: Content-Type (415) is checked before size and JSON parse",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        await eachSeries(
          [
            "text/plain",
            "application/x-www-form-urlencoded",
            "multipart/form-data; boundary=x",
            "text/json",
            "application/xml",
          ],
          async (type) => {
            const headers = { "Content-Type": type };
            const report = await h.request("POST", REPORT_PATH, {
              body: reportBody(project, MILESTONE),
              headers,
            });
            expectError(h, report, 415, "unsupported_media_type", `report as ${type}`);
            const stop = await h.request("POST", STOP_PATH, {
              body: { project, milestone: MILESTONE },
              headers,
            });
            expectError(h, stop, 415, "unsupported_media_type", `stop as ${type}`);
          },
        );
        const oversize = await h.request("POST", REPORT_PATH, {
          raw: "x".repeat(20 * KIB),
          headers: { "Content-Type": "text/plain" },
        });
        expectError(
          h,
          oversize,
          415,
          "unsupported_media_type",
          "an oversize text/plain body (415 before 413)",
        );
        await expectNothingStored(h, project, "415");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-021",
    title: "A body over 16 KiB is 413 body_too_large, before JSON parse; exactly 16 KiB is not",
    tier: "clock-free",
    cites:
      "api.md 1, 4.2, 8: the server MUST refuse a body over 16 KiB; size (413) precedes JSON parse",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        const atLimit = await h.request("POST", REPORT_PATH, {
          raw: paddedBody(project, 16 * KIB),
        });
        expectError(
          h,
          atLimit,
          400,
          "invalid_report",
          "16384 bytes (the unknown pad field makes it invalid, not too large)",
        );
        const over = await h.request("POST", REPORT_PATH, {
          raw: paddedBody(project, 16 * KIB + 1),
        });
        expectError(h, over, 413, "body_too_large", "16385 bytes");
        const garbage = await h.request("POST", REPORT_PATH, { raw: "x".repeat(20 * KIB) });
        expectError(
          h,
          garbage,
          413,
          "body_too_large",
          "20 KiB that is not JSON (413 before invalid_json)",
        );
        const huge = await h.request("POST", REPORT_PATH, { raw: paddedBody(project, 512 * KIB) });
        expectError(h, huge, 413, "body_too_large", "512 KiB");
        const stop = await h.request("POST", STOP_PATH, { raw: "x".repeat(20 * KIB) });
        expectError(h, stop, 413, "body_too_large", "20 KiB stop body");
        await expectNothingStored(h, project, "413");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-022",
    title: "A body that is not UTF-8 JSON is 400 invalid_json, on a report and on a stop",
    tier: "clock-free",
    cites: "api.md 4.2, 8: JSON parse (400 invalid_json) precedes the schema",
    async run(h) {
      const good = JSON.stringify(reportBody(h.project(), MILESTONE));
      const bodies: { label: string; raw: string | Uint8Array }[] = [
        { label: "empty", raw: "" },
        { label: "an open brace", raw: "{" },
        { label: "not JSON at all", raw: "{not json" },
        { label: "a trailing comma", raw: '{"agent": "claude",}' },
        { label: "single quotes", raw: "{'agent': 'claude'}" },
        { label: "NaN", raw: '{"active_hours": NaN}' },
        { label: "truncated", raw: good.slice(0, good.length - 3) },
        { label: "two byte order marks", raw: `${BOM}${BOM}${good}` },
        {
          label: "invalid UTF-8 inside a string",
          raw: Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]),
        },
        { label: "UTF-16 text", raw: Uint8Array.from([0xff, 0xfe, 0x7b, 0x00, 0x7d, 0x00]) },
      ];
      await eachSeries(bodies, async ({ label, raw }) => {
        expectError(
          h,
          await h.request("POST", REPORT_PATH, { raw }),
          400,
          "invalid_json",
          `report: ${label}`,
        );
        expectError(
          h,
          await h.request("POST", STOP_PATH, { raw }),
          400,
          "invalid_json",
          `stop: ${label}`,
        );
      });
      await expectNothingStored(h, h.project(), "invalid_json");
    },
  },
  {
    id: "API-023",
    title:
      "One leading UTF-8 byte order mark is accepted and ignored; a charset on Content-Type is fine",
    tier: "clock-free",
    cites:
      "api.md 1: the server MUST accept and ignore one leading BOM (Windows PowerShell 5.1 writes one)",
    async run(h) {
      const project = h.project();
      try {
        const first = expectReported(
          h,
          await h.request("POST", REPORT_PATH, {
            raw: `${BOM}${JSON.stringify(reportBody(project, "bom"))}`,
          }),
          "report with a BOM",
        );
        assert.equal(first.added, true, "the report with a BOM added the milestone");
        const charset = expectReported(
          h,
          await h.request("POST", REPORT_PATH, {
            body: reportBody(project, "bom"),
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }),
          "report with a charset",
        );
        assert.equal(charset.added, false, "the report with a charset found the milestone");
        const stopped = await h.request("POST", STOP_PATH, {
          raw: `${BOM}${JSON.stringify({ project, milestone: "bom" })}`,
        });
        assert.equal(stopped.status, 200, `stop with a BOM: ${stopped.text}`);
        assert.equal(
          findMilestone(await stateOf(h), project, "bom"),
          undefined,
          "the stop left the milestone",
        );
      } finally {
        await h.stop(project, "bom");
      }
    },
  },
  {
    id: "API-024",
    title:
      "A report missing any required field, or any lane key, is 400 invalid_report with problems",
    tier: "clock-free",
    cites: "api.md 4.1, 4.2: every update is complete; one problems entry per violation",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      const full = reportBody(project, MILESTONE);
      try {
        await eachSeries(MISSING_FIELDS, async (field) => {
          await expectInvalid(h, t, without(full, field), `missing ${field}`);
        });
        await eachSeries(LANE_KEYS, async (key) => {
          const lanes = { ...lanesOf({ ready_for_work: 2, in_progress: 1 }) } as Record<
            string,
            number
          >;
          delete lanes[key];
          await expectInvalid(h, t, { ...full, lanes }, `missing lanes.${key}`);
        });
        await expectInvalid(h, t, { ...full, lanes: {} }, "empty lanes");
        await expectNothingStored(h, project, "missing fields");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-025",
    title:
      "A value of the wrong type or outside its range is invalid_report, with a problem at its JSON Pointer",
    tier: "clock-free",
    cites:
      "api.md 4.1, 4.2, 8: agent, hours, lane counts and names; problems carry a JSON Pointer path",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        await eachSeries(BAD_VALUES, async ({ label, overrides, path }) => {
          await expectInvalid(h, t, reportBody(project, MILESTONE, overrides), label, path);
        });
        await expectNothingStored(h, project, "bad values");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-026",
    title: "Several violations in one body give several problems, one per violation",
    tier: "clock-free",
    cites: "api.md 4.2: one problems entry per violation found",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        const reply = await t.send(
          reportBody(project, MILESTONE, {
            agent: "gpt",
            active_hours: 169,
            cap_hours: 0,
            lanes: lanesOf({ in_progress: 1000 }),
          }),
        );
        expectError(h, reply, 400, "invalid_report", "four violations");
        const paths = problemsOf(reply).map((problem) => problem.path);
        for (const path of ["/agent", "/active_hours", "/cap_hours", "/lanes/in_progress"]) {
          assert.ok(paths.includes(path), `no problem at ${path}; got ${JSON.stringify(paths)}`);
        }
        await expectNothingStored(h, project, "four violations");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-027",
    title: "Unknown fields are refused, at the top level and inside lanes",
    tier: "clock-free",
    cites:
      "api.md 4.1: unknown fields MUST be refused; a misspelled need_me or a backlog lane fails loudly",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        await eachSeries(UNKNOWN_FIELDS, async ({ label, overrides }) => {
          await expectInvalid(h, t, reportBody(project, MILESTONE, overrides), label);
        });
        await expectNothingStored(h, project, "unknown fields");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-028",
    title:
      "One report per request: an array, and any other JSON that is not an object, is invalid_report",
    tier: "clock-free",
    cites: "api.md 4.1: a JSON array MUST be refused; the body parses, so it is not invalid_json",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        const one = reportBody(project, MILESTONE);
        const bodies: [string, string][] = [
          ["an array of one report", JSON.stringify([one])],
          ["an array of two reports", JSON.stringify([one, one])],
          ["an empty array", "[]"],
          ["null", "null"],
          ["a number", "42"],
          ["a string", '"report"'],
          ["true", "true"],
        ];
        await eachSeries(bodies, async ([label, raw]) => {
          const reply = await h.request("POST", REPORT_PATH, { raw });
          expectError(h, reply, 400, "invalid_report", label);
          problemsOf(reply);
        });
        await expectNothingStored(h, project, "arrays");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-029",
    title: "A malformed stop is 400 invalid_stop with problems, and stops nothing",
    tier: "clock-free",
    cites: "api.md 5, 8: a malformed body gets 400 invalid_stop",
    async run(h) {
      const project = h.project();
      const t = tracker(h);
      try {
        await t.ok(reportBody(project, MILESTONE), undefined, "setup report");
        const bodies: [string, unknown][] = [
          ["missing project", { milestone: MILESTONE }],
          ["missing milestone", { project }],
          ["an empty object", {}],
          ["an unknown field", { project, milestone: MILESTONE, force: true }],
          ["an empty milestone", { project, milestone: "" }],
          ["a numeric milestone", { project, milestone: 3 }],
          ["a null project", { project: null, milestone: MILESTONE }],
          [
            "a project over 64 characters",
            { project: `${project}${"p".repeat(64)}`, milestone: MILESTONE },
          ],
          ["a 33-character milestone", { project, milestone: "m".repeat(33) }],
          ["an array", [{ project, milestone: MILESTONE }]],
          ["null", null],
        ];
        await eachSeries(bodies, async ([label, body]) => {
          const reply = await h.request("POST", STOP_PATH, { raw: JSON.stringify(body) });
          expectError(h, reply, 400, "invalid_stop", label);
          problemsOf(reply);
        });
        const state = await stateOf(h);
        assert.ok(findMilestone(state, project, MILESTONE), "a refused stop removed the milestone");
      } finally {
        await t.cleanup();
      }
    },
  },
  {
    id: "API-030",
    title: "Stopping a milestone that is not tracked is 404 not_tracked, not a success",
    tier: "clock-free",
    cites: "api.md 5, 8: a mistyped stop MUST NOT look like success",
    async run(h) {
      const reply = await h.stop(h.project(), "never reported");
      expectError(h, reply, 404, "not_tracked", "stop of an untracked milestone");
      assert.notEqual(
        errorCode(reply),
        "not_found",
        "not_tracked is distinct from an unknown path",
      );
    },
  },
];
