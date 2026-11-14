// The swimcoach command line (contract/cli.md sections 1 to 3), on Commander, the most used Node
// argument parser. Terry, 2026-11-14: use "the most common/ubiquitous TS equiv to argparse", and
// never manage help strings by hand: they are parameters to the library, which builds every usage
// line and help page. This module declares the commands and flags, and turns Commander's errors into
// the contract's wording. Pure: it reads no file and prints nothing.
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

/** Every field flag except --needs-me: none has a default (cli.md section 2). */
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
    "\nGive EITHER --file OR every field flag except --needs-me. Every report is complete: no flag\nhas a default. Lane counts are whole numbers. Leave --needs-me out when there is no ask.",
  ],
  stop: [
    "Stop tracking one milestone and delete its history",
    "\nRun it only after Terry says the milestone is complete. A milestone that is not tracked exits 3.",
  ],
};

const EXIT_CODES =
  "\nExit codes: 0 success, 1 unexpected failure, 2 usage or validation error, 3 not tracked,\n4 refused by the server, 5 authentication failed, 6 config file problem, 7 server unreachable or failed.";

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
const FLAG_LIKE = "looks like a flag";

/** The value Commander rejected, the second quoted part of its message: argument '-x' is invalid. */
const REJECTED = /argument '(?<value>[^']*)' is invalid/u;
const SEE_HELP = "Run swimcoach help for the commands.";

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

/** A value check for every value flag: refuses a second copy and an argument that is a flag. */
function once(value: string, previous: string | undefined): string {
  if (FLAG_TOKEN.test(value)) {
    throw new InvalidArgumentError(FLAG_LIKE);
  }
  if (previous !== undefined) {
    throw new InvalidArgumentError(TWICE);
  }
  return value;
}

/** One flag as a Commander option: its short form, long form, placeholder and description. */
function optionFor(name: string): Option {
  const [placeholder, description] = FLAG_HELP[name] ?? ["", ""];
  const flags = `-${LONG_TO_SHORT.get(name)}, --${name} ${placeholder}`.trimEnd();
  const option = new Option(flags, description);
  if (placeholder !== "") {
    option.argParser(once);
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

/** The long name of a flag token Commander did not know: "--url=x" is url, "-a" is agent. */
function unknownName(token: string): string {
  if (token.startsWith("--")) {
    return token.slice(2).split("=")[0] ?? "";
  }
  return SHORT_FLAGS[token.slice(1)] ?? "";
}

function unknownFlag(token: string, command: string): string {
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

/** The contract's wording for a Commander error about a flag or a stray argument. */
function explainFlag(error: CommanderError, command: string): string {
  const quoted = QUOTED.exec(error.message)?.groups?.quoted ?? "";
  const long = LONG_NAME.exec(quoted)?.groups?.name ?? "";
  if (error.code === "commander.unknownOption") {
    return unknownFlag(quoted, command);
  }
  if (error.code === "commander.optionMissingArgument") {
    return `The flag --${long} ${NO_VALUE}.`;
  }
  if (error.code === "commander.invalidArgument" && error.message.endsWith(TWICE)) {
    return `The flag --${long} ${TWICE}.`;
  }
  if (error.code === "commander.invalidArgument") {
    const value = REJECTED.exec(error.message)?.groups?.value ?? "";
    return `The flag --${long} ${NO_VALUE}; "${value}" is a flag, and a value cannot look like one.`;
  }
  const first = LEFT_OVER.exec(error.message)?.groups?.rest?.split(", ")[0] ?? "";
  return `Unexpected argument "${first}"; every value must follow its flag.`;
}

/** What a Commander error means for this command line: printed text, or a usage error (exit 2). */
function explain(
  error: CommanderError,
  argv: readonly string[],
  out: readonly string[],
): CommandLine {
  const [first = "", second = ""] = argv;
  if (error.exitCode === 0) {
    // Help or version, written through configureOutput: Commander built the text.
    return { kind: "print", text: out.join("") };
  }
  if (error.code === "commander.help" && first === "help") {
    return { kind: "error", lines: [`There is no help topic "${second}".`, SEE_HELP] };
  }
  if (error.code === "commander.help") {
    return { kind: "error", lines: ["The command is missing.", SEE_HELP] };
  }
  if (error.code === "commander.unknownCommand") {
    return { kind: "error", lines: [`Unknown command "${first}".`, SEE_HELP] };
  }
  return { kind: "error", lines: [explainFlag(error, first)] };
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

/** True when a switch was given. */
function switchOn(sub: Parser, name: string): boolean {
  return sub.getOptionValue(new Option(`--${name}`).attributeName()) === true;
}

/** Parses one whole command line (everything after `swimcoach`). */
function parseCommandLine(argv: readonly string[]): CommandLine {
  const attached = argv.find((arg) => SHORT_WITH_EQUALS.test(arg));
  if (attached !== undefined) {
    return {
      kind: "error",
      lines: [
        `Unexpected argument "${attached}"; a short flag takes its value as the next argument.`,
      ],
    };
  }
  const out: string[] = [];
  const { program, ran } = programFor(out);
  try {
    program.parse([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return explain(error, argv, out);
    }
    throw error;
  }
  if (ran.command === undefined || ran.sub === undefined) {
    return { kind: "error", lines: ["The command is missing.", SEE_HELP] };
  }
  return { kind: "run", command: ran.command, parsed: collect(ran.command, ran.sub) };
}

export type { Command, CommandLine, ParsedFlags };
export { FIELD_FLAGS, parseCommandLine, REQUIRED_FIELD_FLAGS, SHORT_FLAGS };
