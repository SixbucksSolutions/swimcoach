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

/**
 * Each flag's one-letter short form (cli.md section 1). A letter means the same flag in every
 * command, so no letter is reused; `-v` for `--version` is handled before a command is read.
 */
const SHORT_FLAGS: Readonly<Record<string, string>> = Object.freeze({
  a: "agent",
  p: "project",
  m: "milestone",
  u: "active-hours",
  b: "cap-hours",
  w: "ready-for-work",
  i: "in-progress",
  t: "needs-terry",
  r: "ready-for-review",
  d: "completed",
  q: "needs-me",
  f: "file",
  c: "config",
  n: "dry-run",
  j: "json",
});

/** A short flag token: one dash and one letter, nothing attached. */
const SHORT_TOKEN = /^-[A-Za-z]$/u;

/** One dash and a letter, with or without more after it: a short flag, or a mistyped one. */
const SHORT_LIKE = /^-[A-Za-z]/u;

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

/**
 * Reads one flag token as a long name and an inline value. A short form maps to its long name and
 * never carries an inline value. Returns undefined, after recording why, for a token that is no flag.
 */
function readFlag(
  token: string,
  state: State,
): { name: string; inline: string | undefined } | undefined {
  if (token.startsWith("--")) {
    return splitToken(token);
  }
  if (SHORT_TOKEN.test(token)) {
    const name = SHORT_FLAGS[token.slice(1)];
    if (name === undefined) {
      state.errors.push(`Unknown flag ${token}.`);
      return undefined;
    }
    return { name, inline: undefined };
  }
  if (SHORT_LIKE.test(token)) {
    state.errors.push(
      `Unexpected argument "${token}"; a short flag is one letter, with its value as the next argument.`,
    );
    return undefined;
  }
  state.errors.push(`Unexpected argument "${token}"; every value must follow its flag.`);
  return undefined;
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

/** True when an argument is itself a flag, so it can never be taken as the previous flag's value. */
function isFlagToken(arg: string): boolean {
  return arg.startsWith("--") || SHORT_TOKEN.test(arg);
}

/**
 * Takes a flag's value: after an equals sign, or the next argument. A next argument that is a flag
 * (two dashes, or one dash and one letter) is never a value, so a forgotten value cannot swallow
 * the next flag; write --project=--odd or --project=-x for such a name. Returns how many arguments
 * the flag used.
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
    if (next === undefined || isFlagToken(next)) {
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
  const flag = readFlag(args[index] ?? "", state);
  if (flag === undefined) {
    return 1;
  }
  const { name, inline } = flag;
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
export { FIELD_FLAGS, parseFlags, REQUIRED_FIELD_FLAGS, SHORT_FLAGS };
