import { describe, expect, it } from "vitest";
import invalidReportError from "../../contract/schemas/examples/error.invalid-report.json" with {
  type: "json",
};
import allCompleted from "../../contract/schemas/examples/report.all-completed.json" with {
  type: "json",
};
import fga from "../../contract/schemas/examples/report.fga.json" with { type: "json" };
import needsMe from "../../contract/schemas/examples/report.needs-me.json" with { type: "json" };
import reportResponse from "../../contract/schemas/examples/report.response.json" with {
  type: "json",
};
import stopRequest from "../../contract/schemas/examples/stop.request.json" with { type: "json" };
import stopResponse from "../../contract/schemas/examples/stop.response.json" with { type: "json" };
import type { Report } from "../../src/contract.ts";
import { type Problem, validateReport, validateStop } from "../../src/ingest/validate.ts";
import sweep from "./fixtures/name-sweep.json" with { type: "json" };
import corpus from "./fixtures/report-bodies.json" with { type: "json" };

type Position = keyof typeof sweep.refused;
type Ranges = readonly (readonly number[])[];

const JSON_POINTER = /^(?:\/(?:[^/~]|~[01])*)*$/u;
const SENTENCE = /^[A-Z].*\.$/u;
const POSITIONS: Readonly<Record<Position, (c: string) => string>> = {
  alone: (c) => c,
  start: (c) => `${c}ab`,
  middle: (c) => `a${c}b`,
  end: (c) => `ab${c}`,
};
const SWEPT_POINTS = [
  ...Array.from({ length: 0x1_00_00 }, (_, i) => i),
  0x1_00_00,
  0x1_f6_00,
  0xe_00_01,
  0x10_ff_ff,
];
/** api.md 4.1's whitespace set, written out a second time to check the fixture against. */
const WHITESPACE: Ranges = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0x85, 0x85],
  [0xa0, 0xa0],
  [0x16_80, 0x16_80],
  [0x20_00, 0x20_0a],
  [0x20_28, 0x20_29],
  [0x20_2f, 0x20_2f],
  [0x20_5f, 0x20_5f],
  [0x30_00, 0x30_00],
  [0xfe_ff, 0xfe_ff],
];
/** api.md 4.1's control and line-break set. */
const CONTROL: Ranges = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x20_28, 0x20_29],
];

function inRanges(ranges: Ranges, point: number): boolean {
  return ranges.some(([lo = 0, hi = -1]) => point >= lo && point <= hi);
}

/** The problems a body gets as a report or a stop; empty when it is valid. */
function problemsOf(kind: string, body: unknown): readonly Problem[] {
  let result: ReturnType<typeof validateReport> | ReturnType<typeof validateStop>;
  if (kind === "stop") {
    result = validateStop(body);
  } else {
    result = validateReport(body);
  }
  if (result.ok) {
    return [];
  }
  return result.problems;
}

function reportOf(body: unknown): Report {
  const result = validateReport(body);
  if (!result.ok) {
    throw new Error(`Expected a valid report, got ${JSON.stringify(result.problems)}.`);
  }
  return result.report;
}

function reportProblems(body: unknown): readonly Problem[] {
  const result = validateReport(body);
  if (result.ok) {
    throw new Error("Expected the report to be refused.");
  }
  return result.problems;
}

function withProject(project: string): unknown {
  return { ...fga, project };
}

describe("the contract's examples", () => {
  it.each([
    ["report.fga.json", fga],
    ["report.needs-me.json", needsMe],
    ["report.all-completed.json", allCompleted],
  ])("accepts %s as a report and refuses it as a stop", (_, body) => {
    expect(validateReport(body).ok).toBe(true);
    expect(validateStop(body).ok).toBe(false);
  });

  it("accepts stop.request.json as a stop and refuses it as a report", () => {
    expect(validateStop(stopRequest)).toEqual({ ok: true, request: stopRequest });
    expect(validateReport(stopRequest).ok).toBe(false);
  });

  it.each([
    ["report.response.json", reportResponse],
    ["stop.response.json", stopResponse],
    ["error.invalid-report.json", invalidReportError],
  ])("refuses the response body %s as either request", (_, body) => {
    expect(validateReport(body).ok).toBe(false);
    expect(validateStop(body).ok).toBe(false);
  });

  it("reproduces error.invalid-report.json's problems for its lanes", () => {
    const lanes = {
      ready_for_work: 1,
      in_progress: 1,
      needs_terry: 0,
      ready_for_review: 1,
      backlog: 4,
    };
    expect(reportProblems({ ...fga, lanes })).toEqual(invalidReportError.problems);
  });
});

describe("agreement with Python jsonschema on whole bodies", () => {
  it(`covers a corpus of ${corpus.cases.length} bodies, both valid and invalid`, () => {
    expect(corpus.cases.length).toBeGreaterThan(200);
    expect(corpus.cases.filter((c) => c.valid).length).toBeGreaterThan(40);
    expect(corpus.cases.filter((c) => !c.valid).length).toBeGreaterThan(150);
  });

  it.each(corpus.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const problems = problemsOf(c.kind, c.body);
    expect(problems.length === 0).toBe(c.valid);
    for (const problem of problems) {
      expect(problem.path).toMatch(JSON_POINTER);
      expect(problem.message).toMatch(SENTENCE);
    }
  });
});

describe("agreement with Python jsonschema on every code point", () => {
  it("gives jsonschema's verdict at the start, middle and end of a name and alone", () => {
    const disagreements: string[] = [];
    let checked = 0;
    for (const [position, name] of Object.entries(POSITIONS)) {
      const refused = sweep.refused[position as Position];
      for (const point of SWEPT_POINTS) {
        const { ok } = validateReport(withProject(name(String.fromCodePoint(point))));
        checked += 1;
        if (ok === inRanges(refused, point)) {
          disagreements.push(`${position} U+${point.toString(16)}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
    expect(checked).toBe(sweep.names_checked);
  });

  it("holds a fixture that matches api.md 4.1's two sets", () => {
    for (const point of SWEPT_POINTS) {
      const edge = inRanges(CONTROL, point) || inRanges(WHITESPACE, point);
      expect(inRanges(sweep.refused.middle, point)).toBe(inRanges(CONTROL, point));
      expect(inRanges(sweep.refused.start, point)).toBe(edge);
      expect(inRanges(sweep.refused.end, point)).toBe(edge);
      expect(inRanges(sweep.refused.alone, point)).toBe(edge);
    }
  });
});

describe("validateReport on success", () => {
  it("returns a fresh report with only the schema's fields", () => {
    const report = reportOf(fga);
    expect(report).toEqual(fga);
    expect(report).not.toBe(fga);
    expect(report.lanes).not.toBe(fga.lanes);
    expect(Object.hasOwn(report, "needs_me")).toBe(false);
  });

  it("keeps needs_me when it was sent", () => {
    expect(reportOf(needsMe).needs_me).toBe(needsMe.needs_me);
  });

  it("returns a fresh stop request", () => {
    const result = validateStop(stopRequest);
    expect(result).toEqual({ ok: true, request: stopRequest });
    expect(result.ok && result.request).not.toBe(stopRequest);
  });
});

describe("validateReport problems", () => {
  it("reports every violation, not only the first", () => {
    const body = { ...fga, agent: "gpt", project: " FGA", cap_hours: 0, extra: true };
    expect(reportProblems(body).map((p) => p.path)).toEqual([
      "/extra",
      "/agent",
      "/project",
      "/cap_hours",
    ]);
  });

  it("names every missing field at the body's root", () => {
    const fields = ["agent", "project", "milestone", "active_hours", "cap_hours", "lanes"];
    expect(reportProblems({})).toEqual(
      fields.map((field) => ({ path: "", message: `Required field "${field}" is missing.` })),
    );
  });

  it("escapes an unknown key's path as RFC 6901 requires", () => {
    expect(reportProblems({ ...fga, "a/b~c": 1 })).toEqual([
      { path: "/a~1b~0c", message: 'Unknown field "a/b~c".' },
    ]);
  });

  it("names the control character it found", () => {
    expect(reportProblems({ ...fga, milestone: "T0\u00854" })).toEqual([
      {
        path: "/milestone",
        message: 'The field "milestone" contains the control character or line break U+0085.',
      },
    ]);
  });

  it("names every missing lane under /lanes", () => {
    expect(reportProblems({ ...fga, lanes: {} }).map((p) => p.path)).toEqual(
      Array.from({ length: 5 }, () => "/lanes"),
    );
  });
});

describe("validateReport on bodies JSON cannot express or that JSON.parse builds oddly", () => {
  it("refuses an own __proto__ key as unknown", () => {
    const parsed: unknown = JSON.parse(`{"__proto__": {}, ${JSON.stringify(fga).slice(1)}`);
    expect(reportProblems(parsed)).toEqual([
      { path: "/__proto__", message: 'Unknown field "__proto__".' },
    ]);
  });

  it("never reads a field from the prototype", () => {
    const { agent: _, ...rest } = fga;
    const inherited: unknown = Object.assign(Object.create({ agent: "codex" }) as object, rest);
    expect(reportProblems(inherited)).toEqual([
      { path: "", message: 'Required field "agent" is missing.' },
    ]);
  });

  it("refuses an own field whose value is undefined", () => {
    expect(reportProblems({ ...fga, needs_me: undefined }).map((p) => p.path)).toEqual([
      "/needs_me",
    ]);
  });

  it("refuses Infinity, which JSON.parse makes from 1e400, and NaN", () => {
    const parsed: unknown = JSON.parse(JSON.stringify(fga).replace("1.85", "1e400"));
    expect(reportProblems(parsed).map((p) => p.path)).toEqual(["/active_hours"]);
    expect(reportProblems({ ...fga, cap_hours: Number.NaN }).map((p) => p.path)).toEqual([
      "/cap_hours",
    ]);
  });
});

describe("validateStop", () => {
  it("names missing and unknown fields", () => {
    expect(validateStop({ project: "FGA", agent: "codex" })).toEqual({
      ok: false,
      problems: [
        { path: "", message: 'Required field "milestone" is missing.' },
        { path: "/agent", message: 'Unknown field "agent".' },
      ],
    });
  });
});
