// The swimcoach command line (contract/cli.md sections 1 to 3), declared to Commander, the most used
// Node argument parser. Terry, 2026-11-14: argument parsing, checks and help belong to the
// battle-tested library, and our code stays business logic. So this module only declares commands,
// flags, descriptions and the conflicts between them; Commander parses, checks, builds every help
// page and words every parse error. Pure: it reads no file and prints nothing.
import { CommanderError, InvalidArgumentError, Option, Command as Parser } from "commander";
import pkg from "../package.json" with { type: "json" };

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

/**
 * Every field flag except --needs-me: none has a default (cli.md section 2). Commander cannot say
 * "required unless --file is given", so build.ts checks this as part of a complete report.
 */
const REQUIRED_FIELD_FLAGS: readonly string[] = FIELD_FLAGS.filter((flag) => flag !== "needs-me");

const VALUE_FLAGS: Readonly<Record<Command, readonly string[]>> = {
  report: [...FIELD_FLAGS, "file", "config"],
  stop: ["project", "milestone", "config"],
};

const SWITCHES: readonly string[] = ["dry-run", "json"];

/**
 * Each flag's one-letter short form (cli.md section 1). A letter means the same flag in every
 * command, and none is reused; `-v` and `-h` belong to Commander's version and help flags.
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

/** Each flag's value placeholder and help description: the parameters Commander's help is built from. */
const FLAG_HELP: Readonly<Record<string, readonly [placeholder: string, description: string]>> = {
  agent: ["<codex|claude>", "The agent sending the report"],
  project: ["<name>", "The project, 1 to 64 characters"],
  milestone: ["<name>", "The milestone, 1 to 32 characters"],
  "active-hours": ["<hours>", "Hours of agent time used so far, 0 to 168"],
  "cap-hours": ["<hours>", "The time budget in hours, over 0 and at most 168"],
  "ready-for-work": ["<n>", "Cards in Ready For Work, 0 to 999"],
  "in-progress": ["<n>", "Cards in In progress, 0 to 999"],
  "needs-terry": ["<n>", "Cards in Needs Terry, 0 to 999"],
  "ready-for-review": ["<n>", "Cards in Ready For Review, 0 to 999"],
  completed: ["<n>", "Cards in Completed, 0 to 999"],
  "needs-me": ["<sentence>", "Optional. One sentence of 1 to 200 characters: what Terry must do"],
  file: ["<path|->", "Read the whole report as JSON from a file, or - for standard input"],
  config: ["<path>", "Read this config file instead of the default"],
  "dry-run": ["", "Validate and print the JSON body; send nothing and read no config"],
  json: ["", "Print the server's JSON response instead of the one-line summary"],
};

const COMMAND_HELP: Readonly<Record<Command, readonly [summary: string, after: string]>> = {
  report: [
    "Send one complete status report",
    "\nGive EITHER --file OR every field flag except --needs-me.\nEvery report is complete: no flag has a default.\nLane counts are whole numbers.\nLeave --needs-me out when there is no ask.",
  ],
  stop: [
    "Stop tracking one milestone and delete its history",
    "\nRun it only after Terry says the milestone is complete.\nA milestone that is not tracked exits 3.",
  ],
};

const EXIT_CODES =
  "\nExit codes: 0 success, 1 unexpected failure, 2 usage or validation error, 3 not tracked, 4 refused by the server, 5 authentication failed, 6 config file problem, 7 server unreachable or failed.";

/** Wide enough that Commander never wraps a description onto a line of its own (each line starts with a capital). */
const HELP_WIDTH = 240;

/** The business rule behind refusing --url (cli.md section 5): the token never leaves its config file. */
const NO_URL =
  "The flag --url does not exist; the service address comes only from the config file.";

const NO_COMMAND = "Give a command: report or stop. Run swimcoach help for the commands.";

const LONG_TO_SHORT: ReadonlyMap<string, string> = new Map(
  Object.entries(SHORT_FLAGS).map(([letter, name]) => [name, letter]),
);

/** The prefix Commander puts on every error message. */
const ERROR_PREFIX = /^error: /u;

/** A value that is itself a flag: two dashes, or one dash and one letter. */
const FLAG_TOKEN = /^(?:--|-[A-Za-z]$)/u;

interface ParsedFlags {
  readonly flags: ReadonlyMap<string, string>;
  readonly dryRun: boolean;
  readonly json: boolean;
}

/** What one command line asks for: text to print (help, version), a usage error, or a request. */
type CommandLine =
  | { readonly kind: "print"; readonly text: string }
  | { readonly kind: "error"; readonly lines: readonly string[] }
  | { readonly kind: "run"; readonly command: Command; readonly parsed: ParsedFlags };

/**
 * Commander's per-value hook, for three refusals it has no setting for: a value that is a flag
 * (`-q -n` would otherwise send the sentence "-n" for real), a value Commander read from `-p=FGA`
 * as "=FGA", and the same flag given twice.
 */
function checkValue(value: string, previous: string | undefined): string {
  if (FLAG_TOKEN.test(value)) {
    throw new InvalidArgumentError("It looks like a flag, not a value.");
  }
  if (value.startsWith("=")) {
    throw new InvalidArgumentError("A short flag takes its value without an equals sign.");
  }
  if (previous !== undefined) {
    throw new InvalidArgumentError("The flag is given twice.");
  }
  return value;
}

/** One flag as a Commander option: its short form, long form, placeholder and description. */
function optionFor(name: string): Option {
  const [placeholder, description] = FLAG_HELP[name] ?? ["", ""];
  const option = new Option(
    `-${LONG_TO_SHORT.get(name)}, --${name} ${placeholder}`.trimEnd(),
    description,
  );
  if (placeholder !== "") {
    option.argParser(checkValue);
  }
  if (name === "file") {
    // --file carries the whole report, so no field flag MAY come with it (cli.md section 2).
    option.conflicts(FIELD_FLAGS.map((field) => new Option(`--${field}`).attributeName()));
  }
  return option;
}

/** The whole command line: the two commands, help and version, with output captured, not printed. */
function programFor(out: string[]): { program: Parser; ran: { command?: Command; sub?: Parser } } {
  const ran: { command?: Command; sub?: Parser } = {};
  const program = new Parser("swimcoach");
  program.exitOverride();
  program.configureOutput({ writeOut: (text) => out.push(text), writeErr: () => undefined });
  program.showSuggestionAfterError(false);
  program.configureHelp({ helpWidth: HELP_WIDTH });
  program.description("Put a milestone's status on Terry's phone.");
  program.version(`swimcoach ${pkg.version}`, "-v, --version", "Print the version");
  program.helpOption("-h, --help", "Show help");
  program.helpCommand("help [command]", "Show help for a command");
  program.addHelpText("after", EXIT_CODES);
  for (const command of ["report", "stop"] as const) {
    const [summary, after] = COMMAND_HELP[command];
    const sub = program.command(command).description(summary).allowExcessArguments(false);
    sub.helpOption("-h, --help", "Show help for this command");
    for (const name of [...VALUE_FLAGS[command], ...SWITCHES]) {
      sub.addOption(optionFor(name));
    }
    sub.addHelpText("after", after);
    sub.action(() => {
      ran.command = command;
      ran.sub = sub;
    });
  }
  return { program, ran };
}

/** Commander's own message, without its "error: " prefix and starting with a capital. */
function capitalized(message: string): string {
  const text = message.replace(ERROR_PREFIX, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a Commander error means here: printed text (help, version), or a usage error (exit 2). */
function explain(error: CommanderError, out: readonly string[]): CommandLine {
  if (error.exitCode === 0) {
    return { kind: "print", text: out.join("") };
  }
  if (error.code === "commander.help") {
    // No command, or help for one that does not exist: Commander would print help on stderr.
    return { kind: "error", lines: [NO_COMMAND] };
  }
  if (error.code === "commander.unknownOption" && error.message.includes("'--url")) {
    return { kind: "error", lines: [NO_URL] };
  }
  return { kind: "error", lines: [capitalized(error.message)] };
}

/** True when a switch was given. */
function switchOn(sub: Parser, name: string): boolean {
  return sub.getOptionValue(new Option(`--${name}`).attributeName()) === true;
}

/** The flags Commander collected for the command that ran, keyed by long name. */
function collect(command: Command, sub: Parser): ParsedFlags {
  const flags = new Map<string, string>();
  for (const name of VALUE_FLAGS[command]) {
    const value: unknown = sub.getOptionValue(new Option(`--${name}`).attributeName());
    if (typeof value === "string") {
      flags.set(name, value);
    }
  }
  return { flags, dryRun: switchOn(sub, "dry-run"), json: switchOn(sub, "json") };
}

/** Parses one whole command line (everything after `swimcoach`). */
function parseCommandLine(argv: readonly string[]): CommandLine {
  const out: string[] = [];
  const { program, ran } = programFor(out);
  try {
    program.parse([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return explain(error, out);
    }
    throw error;
  }
  if (ran.command === undefined || ran.sub === undefined) {
    return { kind: "error", lines: [NO_COMMAND] };
  }
  return { kind: "run", command: ran.command, parsed: collect(ran.command, ran.sub) };
}

export type { Command, CommandLine, ParsedFlags };
export { FIELD_FLAGS, parseCommandLine, REQUIRED_FIELD_FLAGS, SHORT_FLAGS };
