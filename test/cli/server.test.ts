// What the CLI does with each answer a server can give (contract/cli.md sections 4 and 6), against
// a local mock HTTP server and a throwaway config file.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENT_ID,
  json,
  type Mock,
  makeSandbox,
  REPORT_BODY,
  REPORT_OK,
  type Result,
  reportArgs,
  runCli,
  type Sandbox,
  SECRET,
  startMock,
} from "./harness.ts";

const STOP_ARGS = ["stop", "--project", "FGA", "--milestone", "M12"];
const TIMEOUT_TEST_MS = 30_000;

let sandbox: Sandbox;
let mock: Mock | undefined;

beforeEach(async () => {
  sandbox = await makeSandbox();
});

afterEach(async () => {
  await mock?.close();
  mock = undefined;
  await sandbox.cleanup();
});

/** Starts a mock that answers every request the same way and points the config at it. */
async function serve(status: number, body: unknown): Promise<Mock> {
  mock = await startMock((_request, response) => json(response, status, body));
  await sandbox.writeConfig(mock.url);
  return mock;
}

function report(extra: readonly string[] = []): Promise<Result> {
  return runCli(["report", ...reportArgs(), "--config", sandbox.configPath, ...extra]);
}

function stop(extra: readonly string[] = []): Promise<Result> {
  return runCli([...STOP_ARGS, "--config", sandbox.configPath, ...extra]);
}

describe("exit 0, a report", () => {
  it("sends one POST /api/report with the contract's headers and body", async () => {
    const m = await serve(200, REPORT_OK);
    const result = await report();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Reported FGA T04: 4 of 7 finished, 1.85 of 4 h used.\n");
    expect(m.seen).toHaveLength(1);
    const [request] = m.seen;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("/api/report");
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(request?.headers["cf-access-client-id"]).toBe(CLIENT_ID);
    expect(request?.headers["cf-access-client-secret"]).toBe(SECRET);
    expect(request?.headers["swimcoach-test-now"]).toBeUndefined();
    expect(JSON.parse(request?.body ?? "")).toEqual(REPORT_BODY);
  });

  it("says when the milestone is new on the board", async () => {
    await serve(200, { ...REPORT_OK, added: true });
    const result = await report();
    expect(result.stdout).toBe(
      "Reported FGA T04: 4 of 7 finished, 1.85 of 4 h used. New on the board.\n",
    );
  });

  it("sends needs_me only when given, exactly as typed", async () => {
    const m = await serve(200, REPORT_OK);
    const result = await report(["--needs-me", "Confirm the M12 demo build on your phone."]);
    expect(result.code).toBe(0);
    expect(JSON.parse(m.seen[0]?.body ?? "")).toEqual({
      ...REPORT_BODY,
      needs_me: "Confirm the M12 demo build on your phone.",
    });
  });
});

describe("exit 0, a stop and the other input paths", () => {
  it("stops a milestone", async () => {
    const m = await serve(200, { ok: true, project: "FGA", milestone: "M12" });
    const result = await stop();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Stopped tracking FGA M12.\n");
    expect(m.seen[0]?.url).toBe("/api/stop");
    expect(JSON.parse(m.seen[0]?.body ?? "")).toEqual({ project: "FGA", milestone: "M12" });
  });

  it("prints the server's JSON body with --json", async () => {
    await serve(200, REPORT_OK);
    const result = await report(["--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(REPORT_OK);
  });

  it("sends a --file report unchanged, from a path and from standard input", async () => {
    const m = await serve(200, REPORT_OK);
    const bom = String.fromCharCode(0xfe_ff);
    const path = await sandbox.writeFile("report.json", bom + JSON.stringify(REPORT_BODY));
    const fromPath = await runCli(["report", "--file", path, "--config", sandbox.configPath]);
    const fromStdin = await runCli(["report", "--file", "-", "--config", sandbox.configPath], {
      stdin: JSON.stringify(REPORT_BODY),
    });
    expect([fromPath.code, fromStdin.code]).toEqual([0, 0]);
    expect(m.seen.map((s) => JSON.parse(s.body))).toEqual([REPORT_BODY, REPORT_BODY]);
  });

  it("reads the default config path from the home directory", async () => {
    mock = await startMock((_request, response) => json(response, 200, REPORT_OK));
    const home = join(sandbox.dir, "home");
    await mkdir(join(home, ".secrets", "swimcoach"), { recursive: true });
    await writeFile(
      join(home, ".secrets", "swimcoach", "cli.json"),
      JSON.stringify({
        url: mock.url,
        access_client_id: CLIENT_ID,
        access_client_secret: SECRET,
        a_future_key: true,
      }),
    );
    const result = await runCli(["report", ...reportArgs()], { home });
    expect(result.code).toBe(0);
    expect(mock.seen).toHaveLength(1);
  });
});

describe("exit 3, stop for a milestone that is not tracked", () => {
  it("names the 404 not_tracked answer", async () => {
    await serve(404, {
      ok: false,
      error: "not_tracked",
      message: "That milestone is not tracked.",
    });
    const result = await stop();
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("That milestone is not tracked.");
  });
});

describe("exit 4, any other 4xx JSON refusal", () => {
  it("prints the server's message and every problems entry", async () => {
    await serve(400, {
      ok: false,
      error: "invalid_report",
      message: "The report is incomplete or malformed; nothing was stored.",
      problems: [
        { path: "/lanes", message: 'Required lane "completed" is missing.' },
        { path: "/lanes/backlog", message: 'Unknown lane "backlog".' },
      ],
    });
    const result = await report();
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("The report is incomplete or malformed; nothing was stored.");
    expect(result.stderr).toContain('Required lane "completed" is missing.');
    expect(result.stderr).toContain('Unknown lane "backlog".');
  });

  it.each([
    [409, "clock_went_backward"],
    [404, "not_found"],
    [413, "body_too_large"],
  ])("treats %i %s as exit 4", async (status, error) => {
    await serve(status, { ok: false, error, message: "The server said no." });
    expect((await report()).code).toBe(4);
  });
});

describe("exit 5, authentication failed", () => {
  it.each([401, 403])("treats %i as exit 5", async (status) => {
    await serve(status, { ok: false, error: "unauthenticated", message: "No valid token." });
    const result = await report();
    expect(result.code).toBe(5);
    expect(result.stderr).toContain("No valid token.");
  });

  it("treats a 403 HTML page from Access as exit 5", async () => {
    mock = await startMock((_request, response) => {
      response.writeHead(403, { "Content-Type": "text/html" });
      response.end("Forbidden");
    });
    await sandbox.writeConfig(mock.url);
    expect((await report()).code).toBe(5);
  });

  it("does not follow a redirect and exits 5", async () => {
    const login = await startMock((_request, response) => json(response, 200, REPORT_OK));
    try {
      mock = await startMock((_request, response) => {
        response.writeHead(302, { location: `${login.url}/login` });
        response.end();
      });
      await sandbox.writeConfig(mock.url);
      const result = await report();
      expect(result.code).toBe(5);
      expect(login.seen).toHaveLength(0);
    } finally {
      await login.close();
    }
  });
});

describe("exit 7, the server could not be reached or failed", () => {
  it("treats a 5xx as exit 7 and makes exactly one attempt", async () => {
    const m = await serve(500, { ok: false, error: "internal", message: "Something broke." });
    const result = await report();
    expect(result.code).toBe(7);
    expect(m.seen).toHaveLength(1);
  });

  it("treats a refused connection as exit 7", async () => {
    const gone = await startMock(() => undefined);
    await sandbox.writeConfig(gone.url);
    await gone.close();
    expect((await report()).code).toBe(7);
  });

  it("treats a 200 that is not this contract's JSON as exit 7", async () => {
    mock = await startMock((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html>Login</html>");
    });
    await sandbox.writeConfig(mock.url);
    expect((await report()).code).toBe(7);
  });

  it("treats a 4xx that is not JSON as exit 7", async () => {
    mock = await startMock((_request, response) => {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("Bad request");
    });
    await sandbox.writeConfig(mock.url);
    expect((await report()).code).toBe(7);
  });

  it(
    "gives up after 15 seconds and exits 7",
    async () => {
      mock = await startMock(() => undefined);
      await sandbox.writeConfig(mock.url);
      const started = Date.now();
      const result = await report();
      expect(result.code).toBe(7);
      expect(result.stderr).toContain("timed out after 15 seconds");
      expect(Date.now() - started).toBeGreaterThanOrEqual(14_500);
    },
    TIMEOUT_TEST_MS,
  );
});

describe("the secret never reaches an output stream", () => {
  it("is redacted when a server echoes it back in a message", async () => {
    mock = await startMock((request, response) =>
      json(response, 400, {
        ok: false,
        error: "invalid_report",
        message: `The server echoed ${String(request.headers["cf-access-client-secret"])}.`,
        problems: [{ path: "", message: `Also ${SECRET}.` }],
      }),
    );
    await sandbox.writeConfig(mock.url);
    const result = await report();
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("[redacted]");
  });

  it("is redacted from --json output too", async () => {
    await serve(200, { ...REPORT_OK, note: SECRET });
    const result = await report(["--json"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[redacted]");
  });
});
