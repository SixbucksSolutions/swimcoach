// The swimcoach command line (contract/cli.md). run() takes its streams and paths as an argument, so
// the entry point passes the real ones and a test can pass its own. Output goes through one place,
// which also removes the service token secret from any text, whatever the text's source.
import { readFile } from "node:fs/promises";
import { type Command, FIELD_FLAGS, type ParsedFlags, parseCommandLine } from "./args.ts";
import { type Built, buildFromFile, buildFromFlags } from "./build.ts";
import { loadConfig } from "./config.ts";
import { type ApiPath, post, REPORT_PATH, STOP_PATH } from "./http.ts";
import { classify } from "./response.ts";

interface Io {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readStdin: () => Promise<Uint8Array>;
  readonly defaultConfigPath: string;
  readonly timeoutMs: number;
}

const USAGE_ERROR = 2;
const CONFIG_ERROR = 6;
const UNEXPECTED = 1;

/** Every line the CLI prints passes through here, where the secret is replaced if it appears. */
class Output {
  readonly #io: Io;
  readonly #secrets: string[] = [];

  constructor(io: Io) {
    this.#io = io;
  }

  hide(secret: string): void {
    this.#secrets.push(secret);
  }

  out(line: string): void {
    this.#io.stdout(`${this.#clean(line)}\n`);
  }

  /** Prints each line on stderr and returns the exit code, so a caller can `return o.fail(...)`. */
  fail(code: number, lines: readonly string[]): number {
    for (const line of lines) {
      this.#io.stderr(`${this.#clean(line)}\n`);
    }
    return code;
  }

  #clean(text: string): string {
    let result = text;
    for (const secret of this.#secrets) {
      result = result.replaceAll(secret, "[redacted]");
    }
    return result;
  }
}

async function readReport(flags: ReadonlyMap<string, string>, io: Io): Promise<Built> {
  const conflicts = FIELD_FLAGS.filter((flag) => flags.has(flag)).map((flag) => `--${flag}`);
  if (conflicts.length > 0) {
    return {
      ok: false,
      lines: [`The flag --file cannot be combined with: ${conflicts.join(", ")}.`],
    };
  }
  const path = flags.get("file") ?? "";
  let source = path;
  if (path === "-") {
    source = "standard input";
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(path, io);
  } catch {
    return { ok: false, lines: [`The report from ${source} cannot be read.`] };
  }
  return buildFromFile(bytes, source);
}

/** The bytes of a --file argument: standard input for "-", else the file at that path. */
async function readBytes(path: string, io: Io): Promise<Uint8Array> {
  if (path === "-") {
    return await io.readStdin();
  }
  return await readFile(path);
}

async function runRequest(
  command: Command,
  parsed: ParsedFlags,
  io: Io,
  o: Output,
): Promise<number> {
  const { flags, dryRun, json } = parsed;
  let built: Built;
  if (command === "report" && flags.has("file")) {
    built = await readReport(flags, io);
  } else {
    built = buildFromFlags(command, flags);
  }
  if (!built.ok) {
    return o.fail(USAGE_ERROR, built.lines);
  }
  if (dryRun) {
    o.out(JSON.stringify(built.body, null, 2));
    return 0;
  }
  const loaded = await loadConfig(flags.get("config") ?? io.defaultConfigPath);
  if (!loaded.ok) {
    return o.fail(CONFIG_ERROR, [loaded.message]);
  }
  o.hide(loaded.config.accessClientSecret);
  let path: ApiPath = STOP_PATH;
  if (command === "report") {
    path = REPORT_PATH;
  }
  const sent = await post({
    config: loaded.config,
    path,
    body: built.body,
    timeoutMs: io.timeoutMs,
  });
  const outcome = classify({ command, sent, body: built.body, fromFlags: built.fromFlags });
  if (outcome.exit !== 0) {
    return o.fail(outcome.exit, outcome.lines);
  }
  if (json) {
    o.out(outcome.raw.trim());
  } else {
    o.out(outcome.line);
  }
  return 0;
}

/** Commander reads the whole command line; help and version text are its own (Terry, 2026-11-14). */
async function dispatch(argv: readonly string[], io: Io, o: Output): Promise<number> {
  const line = parseCommandLine(argv);
  if (line.kind === "print") {
    o.out(line.text.trimEnd());
    return 0;
  }
  if (line.kind === "error") {
    return o.fail(USAGE_ERROR, line.lines);
  }
  return await runRequest(line.command, line.parsed, io, o);
}

/** Runs one command line and returns its exit code (contract/cli.md section 4). */
async function run(argv: readonly string[], io: Io): Promise<number> {
  const o = new Output(io);
  try {
    return await dispatch(argv, io, o);
  } catch (error) {
    let detail = "Unknown error.";
    if (error instanceof Error) {
      detail = error.message;
    }
    return o.fail(UNEXPECTED, [`The swimcoach command line failed unexpectedly: ${detail}`]);
  }
}

export type { Io };
export { run };
