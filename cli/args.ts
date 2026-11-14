// Command-line parsing for the swimcoach CLI (contract/cli.md sections 1 and 2). Pure: it reads no
// file and prints nothing. Every problem it finds is collected, so one message can name them all.

type Command = "report" | "stop";

/** The report fields that arrive as flags, in the order cli.md section 1 lists them. */
const FIELD_FLAGS = [
  "agent",
  "project",
  "milestone",
  "active-hours",
  "cap-hours",
  "ready-for-work",
  "in-progress",
  "needs-terry",
  "ready-for-review",
  "completed",
  "needs-me",
] as const;

/** Every field flag except --needs-me: none has a default (cli.md section 2). */
const REQUIRED_FIELD_FLAGS: readonly string[] = FIELD_FLAGS.filter((flag) => flag !== "needs-me");

const VALUE_FLAGS: Readonly<Record<Command, readonly string[]>> = {
  report: [...FIELD_FLAGS, "file", "config"],
  stop: ["project", "milestone", "config"],
};

const SWITCHES: readonly string[] = ["dry-run", "json"];

interface ParsedFlags {
  readonly flags: ReadonlyMap<string, string>;
  readonly dryRun: boolean;
  readonly json: boolean;
}

type ParseResult =
  | { readonly ok: true; readonly parsed: ParsedFlags }
  | { readonly ok: false; readonly errors: readonly string[] };

/** What the parser has collected so far. */
interface State {
  readonly flags: Map<string, string>;
  readonly errors: string[];
  dryRun: boolean;
  json: boolean;
}

function unknownFlag(name: string, command: Command): string {
  if (name === "url") {
    return "The flag --url does not exist; the service address comes only from the config file.";
  }
  return `Unknown flag --${name} for the ${command} command.`;
}

/** Splits "--name=value" at the first equals sign; a token without one has no inline value. */
function splitToken(token: string): { name: string; inline: string | undefined } {
  const equals = token.indexOf("=");
  if (equals === -1) {
    return { name: token.slice(2), inline: undefined };
  }
  return { name: token.slice(2, equals), inline: token.slice(equals + 1) };
}

function parseSwitch(name: string, inline: string | undefined, state: State): void {
  if (inline !== undefined) {
    state.errors.push(`The flag --${name} takes no value.`);
  } else if (name === "dry-run") {
    state.dryRun = true;
  } else {
    state.json = true;
  }
}

/**
 * Takes a flag's value: after an equals sign, or the next argument. A next argument that starts
 * with two dashes is never a value, so a forgotten value cannot swallow the next flag; write
 * --project=--odd for such a name. Returns how many arguments the flag used.
 */
function parseValueFlag(
  name: string,
  inline: string | undefined,
  next: string | undefined,
  state: State,
): number {
  let value = inline;
  let used = 1;
  if (value === undefined) {
    if (next === undefined || next.startsWith("--")) {
      state.errors.push(`The flag --${name} needs a value.`);
      return 1;
    }
    value = next;
    used = 2;
  }
  if (state.flags.has(name)) {
    state.errors.push(`The flag --${name} is given twice.`);
  } else {
    state.flags.set(name, value);
  }
  return used;
}

/** Parses the token at `index` and returns how many arguments it used. */
function parseToken(
  command: Command,
  args: readonly string[],
  index: number,
  state: State,
): number {
  const token = args[index] ?? "";
  if (!token.startsWith("--")) {
    state.errors.push(`Unexpected argument "${token}"; every value must follow its flag.`);
    return 1;
  }
  const { name, inline } = splitToken(token);
  if (SWITCHES.includes(name)) {
    parseSwitch(name, inline, state);
    return 1;
  }
  if (!VALUE_FLAGS[command].includes(name)) {
    state.errors.push(unknownFlag(name, command));
    return 1;
  }
  return parseValueFlag(name, inline, args[index + 1], state);
}

/** Parses the arguments after the command word. */
function parseFlags(command: Command, args: readonly string[]): ParseResult {
  const state: State = { flags: new Map(), errors: [], dryRun: false, json: false };
  let index = 0;
  while (index < args.length) {
    index += parseToken(command, args, index, state);
  }
  if (state.errors.length > 0) {
    return { ok: false, errors: state.errors };
  }
  return { ok: true, parsed: { flags: state.flags, dryRun: state.dryRun, json: state.json } };
}

export type { Command, ParsedFlags, ParseResult };
export { FIELD_FLAGS, parseFlags, REQUIRED_FIELD_FLAGS };
