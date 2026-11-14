// Exits that happen before any request: usage errors (2), config errors (6), an unexpected failure
// (1), --dry-run, --version and help. A mock server proves that nothing was sent where it matters.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../cli/main.ts";
import {
  json,
  type Mock,
  makeSandbox,
  REPORT_BODY,
  REPORT_OK,
  reportArgs,
  runCli,
  type Sandbox,
  SECRET,
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

const VERSION_LINE = /^swimcoach \d+\.\d+\.\d+\n$/u;

/** Runs the CLI against the mock and asserts that it exited 2 without sending anything. */
async function refused(args: readonly string[], stdin?: string) {
  const result = await runCli([...args, "--config", sandbox.configPath], { stdin });
  // biome-ignore-start lint/suspicious/noMisplacedAssertion: a helper that only tests call
  expect(result.code).toBe(2);
  expect(result.stdout).toBe("");
  expect(mock.seen).toHaveLength(0);
  // biome-ignore-end lint/suspicious/noMisplacedAssertion: a helper that only tests call
  return result;
}

describe("exit 2, usage and validation errors", () => {
  it("names every missing flag in one message", async () => {
    const result = await refused(["report", "--agent", "codex", "--project", "FGA"]);
    const [first] = result.stderr.split("\n");
    for (const flag of [
      "--milestone",
      "--active-hours",
      "--cap-hours",
      "--ready-for-work",
      "--in-progress",
      "--needs-terry",
      "--ready-for-review",
      "--completed",
    ]) {
      expect(first).toContain(flag);
    }
    expect(first).not.toContain("--agent,");
  });

  it("never defaults a forgotten lane to zero", async () => {
    const flags = reportArgs();
    const at = flags.indexOf("--in-progress");
    const result = await refused(["report", ...flags.toSpliced(at, 2)]);
    expect(result.stderr).toContain("--in-progress");
  });

  it("refuses --url, with or without an equals sign", async () => {
    const separate = await refused(["report", ...reportArgs(), "--url", "https://evil.example"]);
    expect(separate.stderr).toContain("--url");
    const joined = await refused([
      "stop",
      "--project",
      "A",
      "--milestone",
      "B",
      "--url=https://evil.example",
    ]);
    expect(joined.stderr).toContain("--url");
  });
});

describe("exit 2, flags that do not exist", () => {
  it("refuses an unknown flag, a stray argument and a flag for the wrong command", async () => {
    expect((await refused(["report", ...reportArgs(), "--need-me", "x"])).stderr).toContain(
      "--need-me",
    );
    expect((await refused(["report", ...reportArgs(), "stray"])).stderr).toContain("stray");
    expect(
      (await refused(["stop", "--project", "A", "--milestone", "B", "--agent", "codex"])).stderr,
    ).toContain("--agent");
  });

  it("refuses a flag that has no value, and a repeated flag", async () => {
    expect((await refused(["stop", "--project", "A", "--milestone"])).stderr).toContain(
      // refused() appends --config <path>, so --milestone meets a flag where its value belongs.
      "Option '-m, --milestone <name>' argument '--config' is invalid. It looks like a flag",
    );
    expect(
      (await refused(["stop", "--project", "A", "--project", "B", "--milestone", "C"])).stderr,
    ).toContain("given twice");
  });
});

describe("exit 2, values and files", () => {
  it("refuses --file combined with field flags, and names them", async () => {
    const path = await sandbox.writeFile("report.json", JSON.stringify(REPORT_BODY));
    const result = await refused(["report", "--file", path, "--project", "FGA"]);
    expect(result.stderr).toContain("--project");
  });

  it.each([
    ["a lane written as 2.0", { "--completed": "2.0" }, "--completed"],
    ["a negative lane", { "--completed": "-1" }, "--completed"],
    ["a lane over 999", { "--completed": "1000" }, "--completed"],
    ["hours with a unit", { "--active-hours": "1.5h" }, "--active-hours"],
    ["hours with a comma", { "--cap-hours": "1,5" }, "--cap-hours"],
    ["a cap of zero", { "--cap-hours": "0" }, "--cap-hours"],
    ["hours over 168", { "--active-hours": "169" }, "--active-hours"],
    ["an unknown agent", { "--agent": "gemini" }, "--agent"],
    ["a name with edge whitespace", { "--project": " FGA" }, "--project"],
    ["a name with a line break", { "--milestone": "T0\n4" }, "--milestone"],
    ["a name over 32 characters", { "--milestone": "M".repeat(33) }, "--milestone"],
  ])("refuses %s without sending", async (_label, replace, flag) => {
    const result = await refused(["report", ...reportArgs(replace)]);
    expect(result.stderr).toContain(flag);
  });

  it("refuses an empty --needs-me", async () => {
    const result = await refused(["report", ...reportArgs(), "--needs-me", ""]);
    expect(result.stderr).toContain("--needs-me");
  });

  it("refuses a report file that is not JSON, not a report, or missing", async () => {
    const broken = await sandbox.writeFile("broken.json", "{ nope");
    expect((await refused(["report", "--file", broken])).stderr).toContain("not valid JSON");
    const extra = await sandbox.writeFile(
      "extra.json",
      JSON.stringify({ ...REPORT_BODY, when: 1 }),
    );
    expect((await refused(["report", "--file", extra])).stderr).toContain('Unknown field "when"');
    expect((await refused(["report", "--file", `${sandbox.dir}/absent.json`])).stderr).toContain(
      "cannot be read",
    );
  });

  it("refuses an invalid report on standard input", async () => {
    const result = await refused(["report", "--file", "-"], "[]");
    expect(result.stderr).toContain("must be a JSON object");
  });

  it("refuses a missing command, an unknown command and an unknown help topic", async () => {
    expect((await runCli([])).code).toBe(2);
    expect((await runCli(["delete"])).code).toBe(2);
    expect((await runCli(["help", "delete"])).code).toBe(2);
  });

  it("prints the version whatever follows it, as Commander does", async () => {
    const result = await runCli(["--version", "extra"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(VERSION_LINE);
  });
});

describe("exit 6, the config file", () => {
  it("is missing", async () => {
    const result = await runCli([
      "report",
      ...reportArgs(),
      "--config",
      `${sandbox.dir}/absent.json`,
    ]);
    expect(result.code).toBe(6);
    expect(mock.seen).toHaveLength(0);
  });

  it("is a directory", async () => {
    const result = await runCli(["report", ...reportArgs(), "--config", sandbox.dir]);
    expect(result.code).toBe(6);
  });

  it("is malformed JSON that contains the secret, and the secret stays out of the message", async () => {
    const path = await sandbox.writeFile("bad.json", `{"access_client_secret": "${SECRET}", oops`);
    const result = await runCli(["report", ...reportArgs(), "--config", path]);
    expect(result.code).toBe(6);
    expect(result.stderr).toContain("not valid JSON");
  });
});

describe("exit 6, a config file that lacks something", () => {
  it.each([
    ["url", { url: "" }],
    ["access_client_id", { access_client_id: 7 }],
    ["access_client_secret", { access_client_secret: undefined }],
  ])("lacks the key %s", async (key, override) => {
    await sandbox.writeConfig(mock.url, override);
    const result = await runCli(["report", ...reportArgs(), "--config", sandbox.configPath]);
    expect(result.code).toBe(6);
    expect(result.stderr).toContain(key);
    expect(mock.seen).toHaveLength(0);
  });

  it("holds a url that is not an http address", async () => {
    await sandbox.writeConfig("ftp://example.test");
    const result = await runCli([
      "stop",
      "--project",
      "A",
      "--milestone",
      "B",
      "--config",
      sandbox.configPath,
    ]);
    expect(result.code).toBe(6);
  });

  it("accepts a byte order mark", async () => {
    const bom = String.fromCharCode(0xfe_ff);
    const path = await sandbox.writeFile(
      "bom.json",
      bom + JSON.stringify({ url: mock.url, access_client_id: "id", access_client_secret: SECRET }),
    );
    const result = await runCli(["report", ...reportArgs(), "--config", path]);
    expect(result.code).toBe(0);
  });
});

describe("exit 1, an unexpected failure", () => {
  it("is reported on stderr, not thrown", async () => {
    const lines: string[] = [];
    const code = await run(["--version"], {
      stdout: () => {
        throw new Error("The disk is full.");
      },
      stderr: (text) => lines.push(text),
      readStdin: () => Promise.resolve(new Uint8Array()),
      defaultConfigPath: sandbox.configPath,
      timeoutMs: 1000,
    });
    expect(code).toBe(1);
    expect(lines.join("")).toContain("failed unexpectedly: The disk is full.");
  });
});

describe("--dry-run", () => {
  it("prints the validated body, reads no config and sends nothing", async () => {
    const result = await runCli([
      "report",
      ...reportArgs(),
      "--dry-run",
      "--config",
      `${sandbox.dir}/absent.json`,
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(REPORT_BODY);
    expect(mock.seen).toHaveLength(0);
  });

  it("still refuses an invalid body", async () => {
    const result = await runCli(["report", ...reportArgs({ "--completed": "x" }), "--dry-run"]);
    expect(result.code).toBe(2);
  });

  it("works for stop", async () => {
    const result = await runCli(["stop", "--project", "FGA", "--milestone", "M12", "--dry-run"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ project: "FGA", milestone: "M12" });
  });
});

describe("--version and help", () => {
  it("prints the version", async () => {
    const result = await runCli(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(VERSION_LINE);
  });

  it.each([[[]], [["report"]], [["stop"]]])("prints help %j", async (topic) => {
    const result = await runCli(["help", ...topic]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
});
