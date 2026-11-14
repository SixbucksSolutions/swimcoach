// Maps the server's answer to an exit code and its output (contract/cli.md section 4). The rules:
// 200 with the contract's JSON is success; 404 not_tracked is exit 3; any other 4xx JSON error is
// 4; 401, 403 and every redirect are 5; everything else, and any body that is not this contract's
// JSON, is 7. Clients branch on `error`, never on `message` (api.md section 8).
import type { Report, StopRequest } from "../src/contract.ts";
import type { Problem } from "../src/ingest/validate.ts";
import type { Command } from "./args.ts";
import { describeProblem } from "./build.ts";
import type { Sent } from "./http.ts";

type Outcome =
  | { readonly exit: 0; readonly line: string; readonly raw: string }
  | { readonly exit: 3 | 4 | 5 | 7; readonly lines: readonly string[] };

type JsonObject = Readonly<Record<string, unknown>>;

const MIN_REDIRECT = 300;
const MAX_REDIRECT = 399;
const MIN_CLIENT_ERROR = 400;
const MAX_CLIENT_ERROR = 499;

function parseObject(text: string): JsonObject | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    // Not JSON: the caller treats it as a response that breaks the contract.
  }
  return undefined;
}

function capitalize(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function isProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    "message" in value &&
    typeof value.path === "string" &&
    typeof value.message === "string"
  );
}

/** The server's `message` and each `problems` entry, as error lines (cli.md section 4). */
function refusalLines(body: JsonObject, fromFlags: boolean): string[] {
  const lines: string[] = [];
  if (typeof body.message === "string") {
    lines.push(capitalize(body.message));
  }
  if (Array.isArray(body.problems)) {
    lines.push(...body.problems.filter(isProblem).map((p) => describeProblem(p, fromFlags)));
  }
  return lines;
}

function authFailure(detail: string, body: JsonObject | undefined, fromFlags: boolean): Outcome {
  const lines = [`Authentication failed: ${detail}.`];
  if (body !== undefined) {
    lines.push(...refusalLines(body, fromFlags));
  }
  lines.push("Terry must check the service token in the config file and the Access policy.");
  return { exit: 5, lines };
}

function brokenContract(status: number): Outcome {
  return {
    exit: 7,
    lines: [`The server answered ${status} with a response that is not this contract's JSON.`],
  };
}

function reportLine(sent: Report, body: JsonObject): string | null {
  const { project, milestone, added } = body;
  if (typeof project !== "string" || typeof milestone !== "string" || typeof added !== "boolean") {
    return null;
  }
  const { ready_for_work, in_progress, needs_terry, ready_for_review, completed } = sent.lanes;
  const finished = ready_for_review + completed;
  const total = ready_for_work + in_progress + needs_terry + finished;
  const line = `Reported ${project} ${milestone}: ${finished} of ${total} finished, ${sent.active_hours} of ${sent.cap_hours} h used.`;
  if (added) {
    return `${line} New on the board.`;
  }
  return line;
}

/** The one-line summary of a 200 answer, or null when the answer lacks what the contract promises. */
function successLine(sent: Report | StopRequest, body: JsonObject): string | null {
  if (body.ok !== true) {
    return null;
  }
  if ("lanes" in sent) {
    return reportLine(sent, body);
  }
  const { project, milestone } = body;
  if (typeof project !== "string" || typeof milestone !== "string") {
    return null;
  }
  return `Stopped tracking ${project} ${milestone}.`;
}

interface ClassifyInput {
  readonly command: Command;
  readonly sent: Sent;
  readonly body: Report | StopRequest;
  readonly fromFlags: boolean;
}

function isRefusal(status: number, answer: JsonObject | undefined): answer is JsonObject {
  return (
    status >= MIN_CLIENT_ERROR &&
    status <= MAX_CLIENT_ERROR &&
    answer?.ok === false &&
    typeof answer.error === "string"
  );
}

function classify(input: ClassifyInput): Outcome {
  const { sent, body, fromFlags } = input;
  if (sent.kind === "network") {
    return { exit: 7, lines: [sent.reason, "The next push will replace this one."] };
  }
  const { status, text } = sent;
  if (status >= MIN_REDIRECT && status <= MAX_REDIRECT) {
    const detail = `the server redirected (${status}) to an interactive login`;
    return authFailure(detail, undefined, fromFlags);
  }
  const answer = parseObject(text);
  if (status === 401 || status === 403) {
    return authFailure(`the server answered ${status}`, answer, fromFlags);
  }
  if (status === 200) {
    let line: string | null = null;
    if (answer !== undefined) {
      line = successLine(body, answer);
    }
    if (line === null) {
      return brokenContract(status);
    }
    return { exit: 0, line, raw: text };
  }
  if (!isRefusal(status, answer)) {
    return brokenContract(status);
  }
  const lines = [
    `The server refused the request (${status} ${String(answer.error)}).`,
    ...refusalLines(answer, fromFlags),
  ];
  if (status === 404 && answer.error === "not_tracked") {
    return { exit: 3, lines };
  }
  return { exit: 4, lines };
}

export type { Outcome };
export { classify };
