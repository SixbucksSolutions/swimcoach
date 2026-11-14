// The one-letter short forms (contract/cli.md section 1): each flag has exactly one, no letter is
// reused, and a short form behaves exactly like its long form, refusals included.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIELD_FLAGS, SHORT_FLAGS } from "../../cli/args.ts";
import {
  json,
  type Mock,
  makeSandbox,
  REPORT_BODY,
  REPORT_OK,
  runCli,
  type Sandbox,
  startMock,
} from "./harness.ts";

let sandbox: Sandbox;
let mock: Mock;

beforeEach(async () => {
  sandbox = await makeSandbox();
  mock = await startMock((_request, response) => json(response, 200, REPORT_OK));
  await sandbox.writeConfig(mock.url);
});

afterEach(async () => {
  await mock.close();
  await sandbox.cleanup();
});

/** The same complete report as the harness's long-form one, written with short forms only. */
const SHORT_REPORT = [
  ["-a", "codex"],
  ["-p", "FGA"],
  ["-m", "T04"],
  ["-u", "1.85"],
  ["-b", "4"],
  ["-w", "2"],
  ["-i", "1"],
  ["-t", "0"],
  ["-r", "3"],
  ["-d", "1"],
].flat();

const ONE_LOWERCASE_LETTER = /^[a-z]$/u;
const VERSION_LINE = /^swimcoach \d+\.\d+\.\d+\n$/u;
const CAPITAL = /^[A-Z]/u;
const COMMAND_ROW = /^(?:report|stop|help) \[/u;

function sorted(names: readonly string[]): string[] {
  return [...names].sort((x, y) => x.localeCompare(y));
}

describe("the short-form table", () => {
  it("gives every flag exactly one letter, and no letter twice", () => {
    const every = sorted([...FIELD_FLAGS, "file", "config", "dry-run", "json"]);
    const mapped = sorted(Object.values(SHORT_FLAGS));
    expect(mapped).toEqual(every);
    for (const letter of Object.keys(SHORT_FLAGS)) {
      expect(letter).toMatch(ONE_LOWERCASE_LETTER);
    }
    expect(Object.keys(SHORT_FLAGS)).not.toContain("v");
    expect(Object.keys(SHORT_FLAGS)).not.toContain("h");
  });
});

describe("Commander builds the help", () => {
  it.each([[["help"]], [["--help"]], [["-h"]], [["report", "-h"]], [["help", "stop"]]])(
    "prints help for %j on stdout, exit 0, in capitalized phrases",
    async (argv) => {
      const result = await runCli(argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage: swimcoach");
      expect(result.stdout).not.toContain("output the version number");
      expect(result.stdout).not.toContain("display help for command");
      // Terry's rule: a line a human reads starts with a capital. A flag row starts with its flag
      // and a command row with the command's name, which are identifiers and stay as they are.
      const lowercase = result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("-") && !COMMAND_ROW.test(l) && !CAPITAL.test(l));
      expect(lowercase, "help lines that do not start with a capital").toEqual([]);
    },
  );

  it("lists every report flag's description, as passed to Commander", async () => {
    const result = await runCli(["report", "--help"]);
    expect(result.stdout).toContain("-u, --active-hours <hours>");
    expect(result.stdout).toContain("Hours of agent time used so far, 0 to 168");
    expect(result.stdout).toContain("Give EITHER --file OR every field flag except --needs-me.");
  });
});

describe("short forms do what their long forms do", () => {
  it("builds the same report body", async () => {
    const result = await runCli(["report", ...SHORT_REPORT, "-n"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(REPORT_BODY);
    expect(mock.seen).toHaveLength(0);
  });

  it("adds the ask with -q, and mixes freely with long forms", async () => {
    const result = await runCli(["report", ...SHORT_REPORT, "--needs-me", "Look.", "--dry-run"]);
    expect(JSON.parse(result.stdout)).toEqual({ ...REPORT_BODY, needs_me: "Look." });
    const short = await runCli(["report", ...SHORT_REPORT, "-q", "Look.", "-n"]);
    expect(JSON.parse(short.stdout)).toEqual({ ...REPORT_BODY, needs_me: "Look." });
  });

  it("sends with -c and prints the server's JSON with -j", async () => {
    const result = await runCli(["report", ...SHORT_REPORT, "-c", sandbox.configPath, "-j"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(REPORT_OK);
    expect(mock.seen).toHaveLength(1);
    expect(JSON.parse(mock.seen[0]?.body ?? "")).toEqual(REPORT_BODY);
  });

  it("reads a report from standard input with -f -, and keeps --file exclusive", async () => {
    const stdin = JSON.stringify(REPORT_BODY);
    const ok = await runCli(["report", "-f", "-", "-n"], { stdin });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout)).toEqual(REPORT_BODY);
    const mixed = await runCli(["report", "-f", "-", "-a", "codex", "-n"], { stdin });
    expect(mixed.code).toBe(2);
    expect(mixed.stderr).toContain(
      "Option '-f, --file <path|->' cannot be used with option '-a, --agent",
    );
  });

  it("stops with -p and -m, and prints the version with -v", async () => {
    const stop = await runCli(["stop", "-p", "FGA", "-m", "M12", "-n"]);
    expect(JSON.parse(stop.stdout)).toEqual({ project: "FGA", milestone: "M12" });
    expect((await runCli(["-v"])).stdout).toMatch(VERSION_LINE);
  });
});

describe("Commander's conventions for short forms", () => {
  it("accepts an attached value and bundled switches", async () => {
    const attached = await runCli(["report", "-acodex", "-pFGA", ...SHORT_REPORT.slice(4), "-nj"]);
    expect(attached.code).toBe(0);
    expect(JSON.parse(attached.stdout)).toEqual(REPORT_BODY);
  });
});

describe("exit 2 for short forms used wrongly, in Commander's own words", () => {
  it.each([
    [["-x", "1"], "Unknown option '-x'"],
    [["-p=FGA"], "--project <name>' argument '=FGA' is invalid. A short flag takes its value"],
    [
      ["-p", "A", "--project", "B"],
      "--project <name>' argument 'B' is invalid. The flag is given twice.",
    ],
    [["-p", "-m", "B"], "--project <name>' argument '-m' is invalid. It looks like a flag"],
    [
      ["-p", "A", "-q", "-n"],
      "--needs-me <sentence>' argument '-n' is invalid. It looks like a flag",
    ],
    [["-p", "A", "--dry-run=1"], "Unknown option '--dry-run=1'"],
  ])("refuses %j", async (extra, message) => {
    const result = await runCli(["report", ...SHORT_REPORT.slice(4), ...extra, "-n"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
  });

  it("refuses a report flag on stop, short or long", async () => {
    const result = await runCli(["stop", "-p", "A", "-m", "B", "-a", "codex", "-n"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown option '-a'");
  });
});

describe("help shows the short forms", () => {
  it("lists each letter beside its flag", async () => {
    const result = await runCli(["help", "report"]);
    for (const [letter, name] of Object.entries(SHORT_FLAGS)) {
      expect(result.stdout).toContain(`-${letter}, --${name}`);
    }
  });
});
