// The black-box UI acceptance suite (MVP-11). Run it from the repository root:
//
//   node acceptance/ui/run.ts --config <file>    against a deployment (cli.json's shape)
//   node acceptance/ui/run.ts --local public     against a local copy of a page directory
//
// --browser webkit (default; Chrome on the iPhone is WebKit) or chrome (the installed Chrome).
// --cases <module> defaults to ./cases/index.ts. The suite only reads: it answers the page's state
// polls itself, so it never writes to the server and is safe against production.
// First time on a machine: npx --prefix acceptance playwright install webkit
import { resolve } from "node:path";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "../api/config.ts";
import { type BrowserName, startUi, type Target, type UiRun } from "./harness.ts";
import { expectLiveRows } from "./ledger.ts";
import { serveDirectory } from "./serve.ts";
import type { UiCase } from "./types.ts";

const USAGE =
  // biome-ignore lint/security/noSecrets: the usage line, not a secret.
  "Usage: node acceptance/ui/run.ts (--config <file> | --local <dir>) [--browser webkit|chrome]\n";
const USAGE_ERROR = 2;
const UX_ID = /^UX-\d{3}$/u;

function fail(message: string): never {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exit(USAGE_ERROR);
}

interface Flags {
  readonly config: string | undefined;
  readonly local: string | undefined;
  readonly browser: BrowserName;
  readonly cases: string;
}

function parseFlags(): Flags {
  let values: { config?: string; local?: string; browser?: string; cases?: string };
  try {
    ({ values } = parseArgs({
      options: {
        config: { type: "string" },
        local: { type: "string" },
        browser: { type: "string" },
        cases: { type: "string" },
      },
      strict: true,
    }));
  } catch (error) {
    let reason = "The arguments cannot be read.";
    if (error instanceof Error) {
      reason = error.message;
    }
    return fail(reason);
  }
  if ((values.config === undefined) === (values.local === undefined)) {
    fail("Give exactly one of --config and --local.");
  }
  const browser = values.browser ?? "webkit";
  if (browser !== "webkit" && browser !== "chrome") {
    fail('The flag --browser MUST be "webkit" or "chrome".');
  }
  return {
    config: values.config,
    local: values.local,
    browser,
    cases: values.cases ?? fileURLToPath(new URL("./cases/index.ts", import.meta.url)),
  };
}

/** Checks the shape of whatever a cases module exported, and that every id names a live ledger row. */
function checkUiCases(value: unknown): UiCase[] {
  if (!Array.isArray(value)) {
    throw new TypeError("The cases module MUST export `cases` as an array.");
  }
  const titles = new Set<string>();
  value.forEach((entry: unknown, index) => {
    const c = entry as Partial<UiCase> | null;
    const ok =
      c !== null &&
      typeof c === "object" &&
      Array.isArray(c.ids) &&
      c.ids.length > 0 &&
      c.ids.every((id) => typeof id === "string" && UX_ID.test(id)) &&
      typeof c.title === "string" &&
      typeof c.run === "function";
    if (!ok) {
      throw new TypeError(`The cases entry at index ${index} does not match the UiCase format.`);
    }
    if (titles.has(c.title as string)) {
      throw new TypeError(`The case title "${c.title}" appears twice.`);
    }
    titles.add(c.title as string);
    expectLiveRows(c.ids as string[], `case "${c.title}"`);
  });
  return value as UiCase[];
}

const flags = parseFlags();
let target: Target;
let stopLocal: (() => Promise<void>) | undefined;
if (flags.config === undefined) {
  const local = await serveDirectory(flags.local as string);
  target = { url: local.url, headers: {} };
  stopLocal = local.stop;
} else {
  const loaded = await loadConfig(flags.config);
  if (!loaded.ok) {
    fail(loaded.message);
  }
  target = {
    url: loaded.config.url.replace(/\/+$/u, ""),
    headers: {
      "CF-Access-Client-Id": loaded.config.accessClientId,
      "CF-Access-Client-Secret": loaded.config.accessClientSecret,
    },
  };
}
const casesModule: unknown = await import(pathToFileURL(resolve(flags.cases)).href);
const cases = checkUiCases((casesModule as { cases?: unknown }).cases);

let ui: UiRun | undefined;

/** Runs one case in a fresh browser context, closing it whatever happens. */
async function runCase(entry: UiCase): Promise<void> {
  const ctx = await (ui as UiRun).newContext();
  try {
    await entry.run(ctx);
    const [failure] = ctx.failures();
    if (failure !== undefined) {
      throw new Error("The page's state route could not give the case's answer.", {
        cause: failure,
      });
    }
  } finally {
    await ctx.close();
  }
}

describe(`swimcoach UI acceptance (${flags.browser}, ${new URL(target.url).host})`, () => {
  before(async () => {
    ui = await startUi(target, flags.browser);
  });
  after(async () => {
    await ui?.close();
    await stopLocal?.();
  });
  for (const entry of cases) {
    it(`${entry.ids.join(" ")} ${entry.title}`, () => runCase(entry));
  }
});
