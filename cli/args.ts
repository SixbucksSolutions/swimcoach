// Command-line parsing for the swimcoach CLI (contract/cli.md sections 1 and 2), on Commander, the
// most used Node argument parser (Terry, 2026-11-14: "the most common/ubiquitous TS equiv to
// argparse"). Pure: it reads no file and prints nothing. This module only declares the flags and
// turns Commander's errors into the contract's wording; Commander does the parsing.
import { CommanderError, InvalidArgumentError, Option, Command as Parser } from "commander";

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

const LONG_TO_SHORT: ReadonlyMap<string, string> = new Map(
  Object.entries(SHORT_FLAGS).map(([letter, name]) => [name, letter]),
);

/** An argument that is itself a flag: two dashes, or one dash and one letter. Never a value. */
const FLAG_TOKEN = /^(?:--|-[A-Za-z]$)/u;

/** A short flag with an equals sign, `-p=FGA`, which Commander would read as the value "=FGA". */
const SHORT_WITH_EQUALS = /^-[A-Za-z]=/u;

/** The quoted token or option in a Commander message: '--url=x' or '-p, --project <name>'. */
const QUOTED = /'(?<quoted>[^']+)'/u;

/** A long flag name inside a Commander option description. */
const LONG_NAME = /--(?<name>[a-z-]+)/u;

/** The arguments Commander found left over, after "got N: ". */
const LEFT_OVER = /got \d+: (?<rest>.*)\.$/u;

const TWICE = "is given twice";
const NO_VALUE = "needs a value";

interface ParsedFlags {
  readonly flags: ReadonlyMap<string, string>;
  readonly dryRun: boolean;
  readonly json: boolean;
}

type ParseResult =
  | { readonly ok: true; readonly parsed: ParsedFlags }
  | { readonly ok: false; readonly errors: readonly string[] };

/** A value check for every value flag: refuses a second copy and an argument that is a flag. */
function once(value: string, previous: string | undefined): string {
  if (FLAG_TOKEN.test(value)) {
    throw new InvalidArgumentError(NO_VALUE);
  }
  if (previous !== undefined) {
    throw new InvalidArgumentError(TWICE);
  }
  return value;
}

/** Commander's flag spelling for one long name, with its short form. */
function spelling(name: string, takesValue: boolean): string {
  const letter = LONG_TO_SHORT.get(name);
  if (takesValue) {
    return `-${letter}, --${name} <value>`;
  }
  return `-${letter}, --${name}`;
}

/** A fresh parser for one command: the command's flags and nothing else. */
function parserFor(command: Command): Parser {
  const parser = new Parser(command);
  parser.exitOverride();
  parser.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
  parser.helpOption(false);
  parser.showSuggestionAfterError(false);
  parser.allowExcessArguments(false);
  for (const name of VALUE_FLAGS[command]) {
    parser.addOption(new Option(spelling(name, true)).argParser(once));
  }
  for (const name of SWITCHES) {
    parser.addOption(new Option(spelling(name, false)));
  }
  return parser;
}

/** The long name of a flag token Commander did not know: "--url=x" is url, "-a" is agent. */
function unknownName(token: string): string {
  if (token.startsWith("--")) {
    return token.slice(2).split("=")[0] ?? "";
  }
  return SHORT_FLAGS[token.slice(1)] ?? "";
}

function unknownFlag(token: string, command: Command): string {
  const name = unknownName(token);
  if (name === "url") {
    return "The flag --url does not exist; the service address comes only from the config file.";
  }
  if (SWITCHES.includes(name) && token.includes("=")) {
    return `The flag --${name} takes no value.`;
  }
  if (name === "") {
    return `Unknown flag ${token}.`;
  }
  return `Unknown flag --${name} for the ${command} command.`;
}

/** The contract's wording for one Commander error, which always starts with a capital. */
function explain(error: CommanderError, command: Command): string {
  const quoted = QUOTED.exec(error.message)?.groups?.quoted ?? "";
  const long = LONG_NAME.exec(quoted)?.groups?.name ?? "";
  if (error.code === "commander.unknownOption") {
    return unknownFlag(quoted, command);
  }
  if (error.code === "commander.optionMissingArgument") {
    return `The flag --${long} ${NO_VALUE}.`;
  }
  if (error.code === "commander.invalidArgument") {
    if (error.message.endsWith(TWICE)) {
      return `The flag --${long} ${TWICE}.`;
    }
    return `The flag --${long} ${NO_VALUE}.`;
  }
  if (error.code === "commander.excessArguments") {
    const first = LEFT_OVER.exec(error.message)?.groups?.rest?.split(", ")[0] ?? "";
    return `Unexpected argument "${first}"; every value must follow its flag.`;
  }
  return "The command line cannot be read.";
}

/** True when a switch was given. */
function switchOn(parser: Parser, name: string): boolean {
  return parser.getOptionValue(new Option(`--${name}`).attributeName()) === true;
}

/** Parses the arguments after the command word. */
function parseFlags(command: Command, args: readonly string[]): ParseResult {
  const attached = args.find((arg) => SHORT_WITH_EQUALS.test(arg));
  if (attached !== undefined) {
    return {
      ok: false,
      errors: [
        `Unexpected argument "${attached}"; a short flag takes its value as the next argument.`,
      ],
    };
  }
  const parser = parserFor(command);
  try {
    parser.parse([...args], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return { ok: false, errors: [explain(error, command)] };
    }
    throw error;
  }
  const flags = new Map<string, string>();
  for (const name of VALUE_FLAGS[command]) {
    const value: unknown = parser.getOptionValue(new Option(`--${name}`).attributeName());
    if (typeof value === "string") {
      flags.set(name, value);
    }
  }
  return {
    ok: true,
    parsed: { flags, dryRun: switchOn(parser, "dry-run"), json: switchOn(parser, "json") },
  };
}

export type { Command, ParsedFlags, ParseResult };
export { FIELD_FLAGS, parseFlags, REQUIRED_FIELD_FLAGS, SHORT_FLAGS };
