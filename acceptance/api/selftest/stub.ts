// A local stand-in for the swimcoach Worker, just faithful enough to prove the harness: Access
// credential checks, the test clock switch, report and stop bookkeeping, and a state body built
// from the contract's own example so it satisfies state.schema.json. It is NOT a second
// implementation of the API; the real one is the thing MVP-09's cases test.
import { readFileSync } from "node:fs";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isRecord, parseJson } from "../json.ts";

interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

interface StubOptions {
  readonly id: string;
  readonly secret: string;
  /** Whether the deployment honors Swimcoach-Test-Now. */
  readonly testClock: boolean;
  /** Milestones already on the board before the run, as [project, milestone] pairs. */
  readonly seeded?: readonly (readonly [string, string])[];
  /** Whether /api replies carry Cache-Control: no-store (the default). */
  readonly noStore?: boolean;
  /** A project whose stop requests answer 500, to prove cleanup attempts every stop. */
  readonly failStopFor?: string;
}

interface Tracked {
  readonly project: string;
  readonly milestone: string;
}

interface Stub {
  readonly url: string;
  readonly requests: Recorded[];
  /** The tracked milestones, keyed by lowercased "project|milestone". */
  readonly tracked: Map<string, Tracked>;
  close: () => Promise<void>;
}

interface World {
  readonly options: StubOptions;
  readonly requests: Recorded[];
  readonly tracked: Map<string, Tracked>;
}

const TEMPLATE = JSON.parse(
  readFileSync(
    new URL("../../../contract/schemas/examples/state.allgreen.json", import.meta.url),
    "utf8",
  ),
) as { milestones: Record<string, unknown>[] } & Record<string, unknown>;
const OK = 200;
const MILLISECONDS_PER_SECOND = 1000;
const REPORT = "/api/2026-11-13/report";
const STOP = "/api/2026-11-13/stop";
const STATE = "/api/2026-11-13/state";

function keyOf(project: string, milestone: string): string {
  return `${project.toLowerCase()}|${milestone.toLowerCase()}`;
}

function respond(world: World, res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (world.options.noStore !== false) {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(body));
}

function refuse(world: World, res: ServerResponse, status: number, code: string): void {
  respond(world, res, status, { ok: false, error: code, message: "The stub refused the request." });
}

function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

/** Access in front of the stub: no credentials redirects, a wrong token answers 403. */
function authorized(world: World, req: IncomingMessage, res: ServerResponse): boolean {
  const { id, secret } = world.options;
  if (req.headers["cf-access-client-id"] === undefined) {
    redirect(res, "https://team.cloudflareaccess.com/login");
    return false;
  }
  if (
    req.headers["cf-access-client-id"] !== id ||
    req.headers["cf-access-client-secret"] !== secret
  ) {
    res.statusCode = 403;
    res.end("forbidden");
    return false;
  }
  return true;
}

function sendState(world: World, res: ServerResponse, at: number): void {
  const [template] = TEMPLATE.milestones;
  const document: Record<string, unknown> = {
    ...TEMPLATE,
    now: at,
    milestones: [...world.tracked.values()].map((entry) => ({ ...template, ...entry })),
  };
  if (world.tracked.size === 0) {
    // state.schema.json ties an empty board to feed no_data and last_report_at null.
    document.feed = "no_data";
    document.last_report_at = null;
  }
  respond(world, res, OK, document);
}

function readEntry(body: unknown): Tracked | undefined {
  if (isRecord(body) && typeof body.project === "string" && typeof body.milestone === "string") {
    return { project: body.project, milestone: body.milestone };
  }
  return undefined;
}

function applyStop(world: World, res: ServerResponse, entry: Tracked): void {
  if (entry.project === world.options.failStopFor) {
    refuse(world, res, 500, "internal");
    return;
  }
  const key = keyOf(entry.project, entry.milestone);
  const found = world.tracked.get(key);
  if (found === undefined) {
    refuse(world, res, 404, "not_tracked");
    return;
  }
  world.tracked.delete(key);
  respond(world, res, OK, { ok: true, ...found });
}

function applyReport(world: World, res: ServerResponse, entry: Tracked, at: number): void {
  const key = keyOf(entry.project, entry.milestone);
  const added = !world.tracked.has(key);
  world.tracked.set(key, entry);
  respond(world, res, OK, { ok: true, ...entry, received_at: at, added, sample: "stored" });
}

/** The request's clock: the test header's value, or the real time. */
function timeOf(req: IncomingMessage): number {
  return Number(req.headers["swimcoach-test-now"] ?? Date.now() / MILLISECONDS_PER_SECOND);
}

function applyWrite(world: World, req: IncomingMessage, res: ServerResponse, text: string): void {
  const path = req.url;
  const body = parseJson(text);
  if (body === undefined) {
    refuse(world, res, 400, "invalid_json");
    return;
  }
  const entry = readEntry(body);
  if (entry === undefined) {
    let code = "invalid_stop";
    if (path === REPORT) {
      code = "invalid_report";
    }
    respond(world, res, 400, {
      ok: false,
      error: code,
      message: "The body is not valid.",
      problems: [{ path: "", message: "The body is not valid." }],
    });
  } else if (path === STOP) {
    applyStop(world, res, entry);
  } else {
    applyReport(world, res, entry, timeOf(req));
  }
}

function route(world: World, req: IncomingMessage, res: ServerResponse, text: string): void {
  const path = req.url ?? "/";
  if (req.method === "GET" && path === "/healthz") {
    respond(world, res, OK, { ok: true });
  } else if (req.method === "GET" && path === STATE) {
    sendState(world, res, timeOf(req));
  } else if (req.method === "POST" && (path === REPORT || path === STOP)) {
    applyWrite(world, req, res, text);
  } else {
    refuse(world, res, 404, "not_found");
  }
}

function handle(world: World, req: IncomingMessage, res: ServerResponse, text: string): void {
  if (req.url === "/redirected") {
    redirect(res, "/followed");
    return;
  }
  if (!authorized(world, req, res)) {
    return;
  }
  const testNow = req.headers["swimcoach-test-now"];
  if (testNow !== undefined && !world.options.testClock) {
    refuse(world, res, 400, "test_clock_disabled");
    return;
  }
  route(world, req, res, text);
}

function startStub(options: StubOptions): Promise<Stub> {
  const world: World = { options, requests: [], tracked: new Map() };
  for (const [project, milestone] of options.seeded ?? []) {
    world.tracked.set(keyOf(project, milestone), { project, milestone });
  }
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      world.requests.push({
        method: req.method ?? "",
        path: req.url ?? "/",
        headers: req.headers,
        body,
      });
      handle(world, req, res, body.toString("utf8"));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests: world.requests,
        tracked: world.tracked,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
            // fetch keeps connections alive, and close() alone waits for them.
            server.closeAllConnections();
          }),
      });
    });
  });
}

export type { Recorded, Stub, StubOptions };
export { startStub };
