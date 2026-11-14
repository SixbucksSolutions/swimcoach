// run.ts as a user runs it: a child node process against the stub. Proves the two required flags,
// the refused config, which cases each tier registers, the exit status, and that the Access
// secret reaches no output stream.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startStub } from "./stub.ts";

const RUN = fileURLToPath(new URL("../run.ts", import.meta.url));
const SAMPLE_CASES = fileURLToPath(new URL("./sample-cases.ts", import.meta.url));
const ID = "selftest-id.access";
const SECRET = "selftest-secret-value-0123456789";

interface Outcome {
  readonly code: number;
  readonly out: string;
}

function exitCodeOf(error: ExecFileException | null): number {
  if (error === null) {
    return 0;
  }
  if (typeof error.code === "number") {
    return error.code;
  }
  return 1;
}

function run(args: readonly string[]): Promise<Outcome> {
  return new Promise((resolve) => {
    // The child inherits NODE_TEST_CONTEXT from this test run, which switches its own node:test
    // reporter to a binary stream. Dropping it gives the child the plain output a user sees.
    // biome-ignore lint/style/noProcessEnv: the child needs the parent's environment minus one key
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    execFile(process.execPath, [RUN, ...args], { env }, (error, stdout, stderr) => {
      resolve({ code: exitCodeOf(error), out: `${stdout}${stderr}` });
    });
  });
}

async function withConfig(
  content: Record<string, unknown>,
  body: (path: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "swimcoach-selftest-"));
  try {
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify(content));
    await body(path);
  } finally {
    await rm(dir, { recursive: true });
  }
}

describe("run.ts", () => {
  it("requires both flags", async () => {
    const noConfig = await run(["--suite", "full"]);
    assert.equal(noConfig.code, 2);
    assert.match(noConfig.out, /--config is required/u);
    const noSuite = await run(["--config", "x.json"]);
    assert.equal(noSuite.code, 2);
    assert.match(noSuite.out, /--suite/u);
    const badSuite = await run(["--config", "x.json", "--suite", "everything"]);
    assert.equal(badSuite.code, 2);
    const url = await run(["--url", "http://localhost", "--suite", "full"]);
    assert.equal(url.code, 2);
  });

  it("refuses a config with a missing key, naming the key and never a value", async () => {
    await withConfig(
      { url: "https://example.invalid", access_client_secret: SECRET },
      async (path) => {
        const outcome = await run([
          "--config",
          path,
          "--suite",
          "clock-free",
          "--cases",
          SAMPLE_CASES,
        ]);
        assert.equal(outcome.code, 2);
        assert.match(outcome.out, /access_client_id/u);
        assert.ok(!outcome.out.includes(SECRET));
      },
    );
  });

  it("refuses a config that is not JSON without quoting it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swimcoach-selftest-"));
    try {
      const path = join(dir, "bad.json");
      await writeFile(path, `{ "access_client_secret": "${SECRET}" `);
      const outcome = await run(["--config", path, "--suite", "full", "--cases", SAMPLE_CASES]);
      assert.equal(outcome.code, 2);
      assert.match(outcome.out, /not valid JSON/u);
      assert.ok(!outcome.out.includes(SECRET));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("clock-free registers only clock-free cases, passes, and prints no secret", async () => {
    const stub = await startStub({
      id: ID,
      secret: SECRET,
      testClock: false,
      seeded: [["FGA", "T04"]],
    });
    try {
      await withConfig(
        { url: stub.url, access_client_id: ID, access_client_secret: SECRET },
        async (path) => {
          const outcome = await run([
            "--config",
            path,
            "--suite",
            "clock-free",
            "--cases",
            SAMPLE_CASES,
          ]);
          assert.equal(outcome.code, 0, outcome.out);
          assert.match(outcome.out, /SELFTEST-1/u);
          assert.match(outcome.out, /SELFTEST-2/u);
          assert.ok(!outcome.out.includes("SELFTEST-3"));
          assert.ok(!outcome.out.includes(SECRET));
          assert.ok(
            stub.requests.every((entry) => entry.headers["swimcoach-test-now"] === undefined),
          );
          assert.deepEqual(
            [...stub.tracked.values()].map((entry) => entry.project),
            ["FGA"],
          );
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("full runs every case after stopping everything, and prints no secret", async () => {
    const stub = await startStub({
      id: ID,
      secret: SECRET,
      testClock: true,
      seeded: [["FGA", "T04"]],
    });
    try {
      await withConfig(
        { url: stub.url, access_client_id: ID, access_client_secret: SECRET },
        async (path) => {
          const outcome = await run(["--config", path, "--suite", "full", "--cases", SAMPLE_CASES]);
          assert.equal(outcome.code, 0, outcome.out);
          assert.match(outcome.out, /SELFTEST-3/u);
          assert.ok(!outcome.out.includes(SECRET));
          assert.equal(stub.tracked.size, 0);
          const stopsBefore = stub.requests.findIndex((entry) => entry.path.endsWith("/stop"));
          const firstReport = stub.requests.findIndex((entry) => entry.path.endsWith("/report"));
          assert.ok(stopsBefore >= 0 && stopsBefore < firstReport, "the reset runs first");
        },
      );
    } finally {
      await stub.close();
    }
  });

  it("a full run against a deployment without the test clock fails", async () => {
    const stub = await startStub({ id: ID, secret: SECRET, testClock: false });
    try {
      await withConfig(
        { url: stub.url, access_client_id: ID, access_client_secret: SECRET },
        async (path) => {
          const outcome = await run(["--config", path, "--suite", "full", "--cases", SAMPLE_CASES]);
          assert.notEqual(outcome.code, 0);
          assert.match(outcome.out, /test_clock_disabled/u);
          assert.ok(!outcome.out.includes(SECRET));
        },
      );
    } finally {
      await stub.close();
    }
  });
});
