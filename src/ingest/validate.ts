// Validation of the two write bodies, POST /api/2026-11-14/report and POST /api/2026-11-14/stop
// (contract/api.md 4.1, 4.2 and 5). Hand-written checks, not a JSON Schema engine: Ajv compiles with new Function, which
// Workers forbid. These checks MUST agree with contract/schemas/report.schema.json exactly; the
// tests in test/ingest/ hold them to Python jsonschema's verdicts on every example, a corpus of
// broken bodies, and every BMP code point at the start, middle and end of a name.
import {
  type Agent,
  LANE_KEYS,
  type LaneKey,
  type Lanes,
  type Report,
  type StopRequest,
} from "../contract.ts";
import { codePointLength, firstControl, hasEdgeWhitespace } from "./name.ts";

/** One schema violation, as the errorResponse `problems` array carries it (api.md 4.2). */
interface Problem {
  /** JSON Pointer (RFC 6901) to the offending value; "" for the whole body. */
  readonly path: string;
  /** One sentence, starting with a capital. */
  readonly message: string;
}

type ValidateReportResult =
  | { readonly ok: true; readonly report: Report }
  | { readonly ok: false; readonly problems: readonly Problem[] };

type ValidateStopResult =
  | { readonly ok: true; readonly request: StopRequest }
  | { readonly ok: false; readonly problems: readonly Problem[] };

type JsonObject = Readonly<Record<string, unknown>>;
type NameField = "milestone" | "needs_me" | "project";
type HoursField = "active_hours" | "cap_hours";

/** What an object in a body must look like: its allowed and required keys, and how to say so. */
interface Shape {
  readonly path: string;
  readonly what: string;
  readonly allowed: readonly string[];
  readonly required: readonly string[];
  readonly missing: (key: string) => string;
  readonly unknown: (key: string) => string;
}

const AGENTS: readonly Agent[] = ["claude", "codex"];
const MAX_HOURS = 168;
const MAX_LANE_COUNT = 999;
/** maxLength per name field, in code points (report.schema.json $defs). */
const NAME_MAX: Readonly<Record<NameField, number>> = { project: 64, milestone: 32, needs_me: 200 };

const REQUIRED_REPORT_FIELDS = [
  "agent",
  "project",
  "milestone",
  "active_hours",
  "cap_hours",
  "lanes",
];
const REPORT_SHAPE: Shape = {
  path: "",
  what: "The body",
  allowed: [...REQUIRED_REPORT_FIELDS, "needs_me"],
  required: REQUIRED_REPORT_FIELDS,
  missing: (key) => `Required field "${key}" is missing.`,
  unknown: (key) => `Unknown field "${key}".`,
};
const STOP_SHAPE: Shape = {
  ...REPORT_SHAPE,
  allowed: ["project", "milestone"],
  required: ["project", "milestone"],
};
const LANES_SHAPE: Shape = {
  path: "/lanes",
  what: 'The field "lanes"',
  allowed: LANE_KEYS,
  required: LANE_KEYS,
  missing: (key) => `Required lane "${key}" is missing; every update carries all five lanes.`,
  unknown: (key) => `Unknown lane "${key}"; Backlog and Blocked are never reported.`,
};

/** The hour ranges of report.schema.json. Written so NaN fails too: every comparison with NaN is false. */
const HOURS: Readonly<
  Record<HoursField, { readonly accepts: (h: number) => boolean; readonly range: string }>
> = {
  active_hours: { accepts: (h) => h >= 0 && h <= MAX_HOURS, range: "from 0 to 168" },
  cap_hours: { accepts: (h) => h > 0 && h <= MAX_HOURS, range: "over 0 and at most 168" },
};

/** RFC 6901: "~" becomes "~0" and "/" becomes "~1", in that order. */
function pointer(...segments: readonly string[]): string {
  return segments.map((s) => `/${s.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks an object's shape: an object, every required key present, no unknown key. */
function checkShape(value: unknown, shape: Shape, problems: Problem[]): JsonObject | undefined {
  if (!isJsonObject(value)) {
    problems.push({ path: shape.path, message: `${shape.what} must be a JSON object.` });
    return undefined;
  }
  for (const key of shape.required) {
    if (!Object.hasOwn(value, key)) {
      problems.push({ path: shape.path, message: shape.missing(key) });
    }
  }
  for (const key of Object.keys(value)) {
    if (!shape.allowed.includes(key)) {
      problems.push({ path: `${shape.path}${pointer(key)}`, message: shape.unknown(key) });
    }
  }
  return value;
}

/**
 * Checks a name field (project, milestone, needs_me) against the shared name rule. Returns
 * undefined, adding nothing, when the field is absent: checkShape already reported a required one.
 */
function checkName(object: JsonObject, field: NameField, problems: Problem[]): string | undefined {
  if (!Object.hasOwn(object, field)) {
    return undefined;
  }
  const value = object[field];
  const path = pointer(field);
  if (typeof value !== "string") {
    problems.push({ path, message: `The field "${field}" must be a string.` });
    return undefined;
  }
  const length = codePointLength(value);
  if (length === 0) {
    problems.push({ path, message: `The field "${field}" must not be empty.` });
    return undefined;
  }
  const before = problems.length;
  if (length > NAME_MAX[field]) {
    const message = `The field "${field}" is ${length} characters; the limit is ${NAME_MAX[field]}.`;
    problems.push({ path, message });
  }
  if (hasEdgeWhitespace(value)) {
    const message = `The field "${field}" must not start or end with whitespace; the server does not trim names.`;
    problems.push({ path, message });
  }
  const control = firstControl(value);
  if (control !== null) {
    const message = `The field "${field}" contains the control character or line break ${control}.`;
    problems.push({ path, message });
  }
  if (problems.length > before) {
    return undefined;
  }
  return value;
}

function checkAgent(object: JsonObject, problems: Problem[]): Agent | undefined {
  if (!Object.hasOwn(object, "agent")) {
    return undefined;
  }
  const agent = AGENTS.find((a) => a === object.agent);
  if (agent === undefined) {
    problems.push({ path: "/agent", message: 'The field "agent" must be "claude" or "codex".' });
  }
  return agent;
}

function checkHours(
  object: JsonObject,
  field: HoursField,
  problems: Problem[],
): number | undefined {
  if (!Object.hasOwn(object, field)) {
    return undefined;
  }
  const value = object[field];
  const path = pointer(field);
  if (typeof value !== "number") {
    problems.push({ path, message: `The field "${field}" must be a number of hours.` });
    return undefined;
  }
  if (!HOURS[field].accepts(value)) {
    const message = `The field "${field}" is ${value}; it must be ${HOURS[field].range} hours.`;
    problems.push({ path, message });
    return undefined;
  }
  return value;
}

/** JSON Schema's integer is a mathematical integer, so 3.0 counts; Number.isInteger agrees. */
function isLaneCount(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_LANE_COUNT
  );
}

function checkLanes(object: JsonObject, problems: Problem[]): Lanes | undefined {
  if (!Object.hasOwn(object, "lanes")) {
    return undefined;
  }
  const before = problems.length;
  const lanes = checkShape(object.lanes, LANES_SHAPE, problems);
  if (lanes === undefined) {
    return undefined;
  }
  const counts: Partial<Record<LaneKey, number>> = {};
  for (const key of LANE_KEYS) {
    const count = lanes[key];
    if (isLaneCount(count)) {
      counts[key] = count;
    } else if (Object.hasOwn(lanes, key)) {
      const message = `The lane "${key}" must be a whole number from 0 to 999.`;
      problems.push({ path: pointer("lanes", key), message });
    }
  }
  const { ready_for_work, in_progress, needs_terry, ready_for_review, completed } = counts;
  if (
    problems.length > before ||
    ready_for_work === undefined ||
    in_progress === undefined ||
    needs_terry === undefined ||
    ready_for_review === undefined ||
    completed === undefined
  ) {
    return undefined;
  }
  return { ready_for_work, in_progress, needs_terry, ready_for_review, completed };
}

/**
 * Validates the body of POST /api/2026-11-14/report against report.schema.json and reports every
 * violation it finds. On success the report is a fresh object holding only the schema's fields;
 * needs_me is present only when it was sent.
 */
function validateReport(body: unknown): ValidateReportResult {
  const problems: Problem[] = [];
  const object = checkShape(body, REPORT_SHAPE, problems);
  if (object === undefined) {
    return { ok: false, problems };
  }
  const agent = checkAgent(object, problems);
  const project = checkName(object, "project", problems);
  const milestone = checkName(object, "milestone", problems);
  const activeHours = checkHours(object, "active_hours", problems);
  const capHours = checkHours(object, "cap_hours", problems);
  const lanes = checkLanes(object, problems);
  const needsMe = checkName(object, "needs_me", problems);
  if (
    problems.length > 0 ||
    agent === undefined ||
    project === undefined ||
    milestone === undefined ||
    activeHours === undefined ||
    capHours === undefined ||
    lanes === undefined
  ) {
    return { ok: false, problems };
  }
  const report: Report = {
    agent,
    project,
    milestone,
    active_hours: activeHours,
    cap_hours: capHours,
    lanes,
  };
  if (needsMe === undefined) {
    return { ok: true, report };
  }
  return { ok: true, report: { ...report, needs_me: needsMe } };
}

/**
 * Validates the body of POST /api/2026-11-14/stop against report.schema.json's $defs/stopRequest.
 */
function validateStop(body: unknown): ValidateStopResult {
  const problems: Problem[] = [];
  const object = checkShape(body, STOP_SHAPE, problems);
  if (object === undefined) {
    return { ok: false, problems };
  }
  const project = checkName(object, "project", problems);
  const milestone = checkName(object, "milestone", problems);
  if (problems.length > 0 || project === undefined || milestone === undefined) {
    return { ok: false, problems };
  }
  return { ok: true, request: { project, milestone } };
}

export type { Problem, ValidateReportResult, ValidateStopResult };
export { validateReport, validateStop };
