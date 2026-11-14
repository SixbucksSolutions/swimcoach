// Turns flags or a --file body into a validated request body (contract/cli.md section 2). The
// checks are the server's own: validateReport and validateStop from src/ingest/validate.ts.
import type { Report, StopRequest } from "../src/contract.ts";
import { type Problem, validateReport, validateStop } from "../src/ingest/validate.ts";
import { type Command, REQUIRED_FIELD_FLAGS } from "./args.ts";
import { stripByteOrderMark } from "./config.ts";

type Built =
  | { readonly ok: true; readonly body: Report | StopRequest; readonly fromFlags: boolean }
  | { readonly ok: false; readonly lines: readonly string[] };

const HOURS_PATTERN = /^\d+(?:\.\d+)?$/u;
const COUNT_PATTERN = /^\d+$/u;

/**
 * A flag value becomes a number only when it is plain digits (cli.md section 2: no unit, no sign,
 * no thousands separator, and no decimal point for a lane count). Anything else stays the raw
 * string, so the validator refuses it in the server's own words.
 */
function numberOrRaw(raw: string, pattern: RegExp): number | string {
  if (pattern.test(raw)) {
    return Number(raw);
  }
  return raw;
}

/** Names the flag a problem path belongs to, so a flag user is not sent hunting for JSON paths. */
function describeProblem(problem: Problem, fromFlags: boolean): string {
  if (problem.path === "") {
    return `Problem at the body: ${problem.message}`;
  }
  if (!fromFlags) {
    return `Problem at ${problem.path}: ${problem.message}`;
  }
  const last = problem.path.split("/").at(-1) ?? "";
  return `Problem with --${last.replaceAll("_", "-")}: ${problem.message}`;
}

function refused(problems: readonly Problem[], fromFlags: boolean): Built {
  return {
    ok: false,
    lines: [
      "The request is invalid, so nothing was sent.",
      ...problems.map((problem) => describeProblem(problem, fromFlags)),
    ],
  };
}

function missingFlags(
  flags: ReadonlyMap<string, string>,
  required: readonly string[],
): Built | null {
  const missing = required.filter((flag) => !flags.has(flag)).map((flag) => `--${flag}`);
  if (missing.length === 0) {
    return null;
  }
  return {
    ok: false,
    lines: [
      `Missing required flags: ${missing.join(", ")}.`,
      "Every status update is complete and no flag has a default; run swimcoach help report for the list.",
    ],
  };
}

function reportBodyFromFlags(flags: ReadonlyMap<string, string>): Record<string, unknown> {
  function get(flag: string): string {
    return flags.get(flag) ?? "";
  }
  const body: Record<string, unknown> = {
    agent: get("agent"),
    project: get("project"),
    milestone: get("milestone"),
    active_hours: numberOrRaw(get("active-hours"), HOURS_PATTERN),
    cap_hours: numberOrRaw(get("cap-hours"), HOURS_PATTERN),
    lanes: {
      ready_for_work: numberOrRaw(get("ready-for-work"), COUNT_PATTERN),
      in_progress: numberOrRaw(get("in-progress"), COUNT_PATTERN),
      needs_terry: numberOrRaw(get("needs-terry"), COUNT_PATTERN),
      ready_for_review: numberOrRaw(get("ready-for-review"), COUNT_PATTERN),
      completed: numberOrRaw(get("completed"), COUNT_PATTERN),
    },
  };
  if (flags.has("needs-me")) {
    body.needs_me = get("needs-me");
  }
  return body;
}

function validated(command: Command, body: unknown, fromFlags: boolean): Built {
  if (command === "stop") {
    const result = validateStop(body);
    if (result.ok) {
      return { ok: true, body: result.request, fromFlags };
    }
    return refused(result.problems, fromFlags);
  }
  const result = validateReport(body);
  if (result.ok) {
    return { ok: true, body: result.report, fromFlags };
  }
  return refused(result.problems, fromFlags);
}

function buildFromFlags(command: Command, flags: ReadonlyMap<string, string>): Built {
  if (command === "stop") {
    const missing = missingFlags(flags, ["project", "milestone"]);
    const body = { project: flags.get("project") ?? "", milestone: flags.get("milestone") ?? "" };
    return missing ?? validated(command, body, true);
  }
  return (
    missingFlags(flags, REQUIRED_FIELD_FLAGS) ??
    validated(command, reportBodyFromFlags(flags), true)
  );
}

/** Builds a report from the bytes of a --file, unchanged apart from the ignored byte order mark. */
function buildFromFile(bytes: Uint8Array, source: string): Built {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, lines: [`The report from ${source} is not valid UTF-8.`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripByteOrderMark(text));
  } catch {
    return { ok: false, lines: [`The report from ${source} is not valid JSON.`] };
  }
  return validated("report", parsed, false);
}

export type { Built };
export { buildFromFile, buildFromFlags, describeProblem };
