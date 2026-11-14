// A contract-shaped error body that is not a 4xx (contract/api.md section 8, 500 internal): the CLI
// prints the server's own words before its summary, and the exit code stays 7 (cli.md section 4).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  json,
  type Mock,
  makeSandbox,
  reportArgs,
  runCli,
  type Sandbox,
  startMock,
} from "./harness.ts";

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

describe("exit 7 with a contract-shaped error body", () => {
  it("prints a 500's message and problems before the summary", async () => {
    mock = await startMock((_request, response) =>
      json(response, 500, {
        ok: false,
        error: "internal",
        message: "something broke.",
        problems: [{ path: "lanes", message: "is unreadable" }],
      }),
    );
    await sandbox.writeConfig(mock.url);
    const result = await runCli(["report", ...reportArgs(), "--config", sandbox.configPath]);
    expect(result.code).toBe(7);
    expect(result.stderr).toContain("Something broke.");
    expect(result.stderr).toContain("is unreadable");
    expect(result.stderr).toContain("The server answered 500 (internal).");
    expect(result.stderr).not.toContain("not this contract's JSON");
    expect(result.stderr.indexOf("Something broke.")).toBeLessThan(
      result.stderr.indexOf("The server answered 500"),
    );
  });
});
