// The black-box API acceptance suite (MVP-09). Run it from the repository root:
//
//   node acceptance/api/run.ts --config <file> --suite clock-free|full
//
// Both flags are required: there is no default config and no --url. The config file has the CLI's
// shape (contract/cli.md section 5). `--cases <module>` is for the suite's own selftest and
// defaults to ./cases/index.ts, which MVP-09 B writes.
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { createHarness } from "./harness.ts";
import { checkCases, registerSuite } from "./runner.ts";

const USAGE = "Usage: node acceptance/api/run.ts --config <file> --suite clock-free|full\n";
const USAGE_ERROR = 2;

function fail(message: string): never {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exit(USAGE_ERROR);
}

function parseFlags(): { config: string; suite: "clock-free" | "full"; cases: string } {
  let values: { config?: string; suite?: string; cases?: string };
  try {
    ({ values } = parseArgs({
      options: {
        config: { type: "string" },
        suite: { type: "string" },
        cases: { type: "string" },
      },
      strict: true,
    }));
  } catch (error) {
    // parseArgs' own message names the offending flag and never quotes a file.
    let reason = "The arguments cannot be read.";
    if (error instanceof Error) {
      reason = error.message;
    }
    return fail(reason);
  }
  if (values.config === undefined) {
    fail("The flag --config is required.");
  }
  if (values.suite !== "clock-free" && values.suite !== "full") {
    fail('The flag --suite is required and MUST be "clock-free" or "full".');
  }
  return {
    config: values.config,
    suite: values.suite,
    cases: values.cases ?? fileURLToPath(new URL("./cases/index.ts", import.meta.url)),
  };
}

const flags = parseFlags();
const loaded = await loadConfig(flags.config);
if (!loaded.ok) {
  fail(loaded.message);
}
const casesModule: unknown = await import(pathToFileURL(resolve(flags.cases)).href);
const cases = checkCases((casesModule as { cases?: unknown }).cases);
registerSuite(cases, createHarness({ config: loaded.config, suite: flags.suite }));
