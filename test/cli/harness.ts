// Test harness for the CLI: a local mock HTTP server, a throwaway config file in a temp directory,
// and a runner that spawns the real CLI under Node. Every run is checked on the way out: the secret
// must not appear in either stream, and every stderr line must start with a capital.
// This file never reads or writes the real %USERPROFILE%\.secrets.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const CAPITAL = /^[A-Z]/u;
const SECRET = "s3cr3t-VALUE-that-must-never-print-9f2c";
const CLIENT_ID = "test-client-id.access";
const CLI = join(import.meta.dirname, "..", "..", "cli", "swimcoach.ts");

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}

type Handler = (request: Seen, response: ServerResponse) => void;

interface Mock {
  readonly url: string;
  readonly seen: Seen[];
  readonly server: Server;
  readonly close: () => Promise<void>;
}

async function startMock(handler: Handler): Promise<Mock> {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const entry: Seen = {
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      seen.push(entry);
      handler(entry, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

interface Sandbox {
  readonly dir: string;
  readonly configPath: string;
  readonly writeConfig: (url: string, extra?: Record<string, unknown>) => Promise<void>;
  readonly writeFile: (name: string, content: string | Uint8Array) => Promise<string>;
  readonly cleanup: () => Promise<void>;
}

async function makeSandbox(): Promise<Sandbox> {
  const dir = await mkdtemp(join(tmpdir(), "swimcoach-cli-test-"));
  const configPath = join(dir, "cli.json");
  return {
    dir,
    configPath,
    writeConfig: (url, extra = {}) =>
      writeFile(
        configPath,
        JSON.stringify({
          url,
          access_client_id: CLIENT_ID,
          access_client_secret: SECRET,
          ...extra,
        }),
      ),
    writeFile: async (name, content) => {
      const path = join(dir, name);
      await writeFile(path, content);
      return path;
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface RunOptions {
  readonly stdin?: string;
  /** Becomes HOME and USERPROFILE, so the default config path points into a throwaway directory. */
  readonly home?: string;
}

function runCli(args: readonly string[], options: RunOptions = {}): Promise<Result> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (options.home !== undefined) {
      env.HOME = options.home;
      env.USERPROFILE = options.home;
    }
    const child = spawn(process.execPath, [CLI, ...args], { env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result: Result = { code: code ?? -1, stdout, stderr };
      assertClean(result);
      resolve(result);
    });
    child.stdin.end(options.stdin ?? "");
  });
}

/** The two promises every run keeps: no secret in any stream, and a capital on every error line. */
function assertClean(result: Result): void {
  if (result.stdout.includes(SECRET) || result.stderr.includes(SECRET)) {
    throw new Error("The secret reached an output stream.");
  }
  for (const line of result.stderr.split("\n")) {
    if (line !== "" && !CAPITAL.test(line)) {
      throw new Error(`The stderr line does not start with a capital: ${line}`);
    }
  }
}

const REPORT_FLAGS = [
  ["--agent", "codex"],
  ["--project", "FGA"],
  ["--milestone", "T04"],
  ["--active-hours", "1.85"],
  ["--cap-hours", "4"],
  ["--ready-for-work", "2"],
  ["--in-progress", "1"],
  ["--needs-terry", "0"],
  ["--ready-for-review", "3"],
  ["--completed", "1"],
] as const;

/** The flags of a complete report, with optional replacements keyed by flag name. */
function reportArgs(replace: Record<string, string> = {}): string[] {
  return REPORT_FLAGS.flatMap(([flag, value]) => [flag, replace[flag] ?? value]);
}

const REPORT_BODY = {
  agent: "codex",
  project: "FGA",
  milestone: "T04",
  active_hours: 1.85,
  cap_hours: 4,
  lanes: { ready_for_work: 2, in_progress: 1, needs_terry: 0, ready_for_review: 3, completed: 1 },
};

const REPORT_OK = {
  ok: true,
  project: "FGA",
  milestone: "T04",
  received_at: 1_794_573_043.512,
  added: false,
  sample: "stored",
};

export type { Mock, Result, Sandbox };
export {
  CLIENT_ID,
  json,
  makeSandbox,
  REPORT_BODY,
  REPORT_OK,
  reportArgs,
  runCli,
  SECRET,
  startMock,
};
