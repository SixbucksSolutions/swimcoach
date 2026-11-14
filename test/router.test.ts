import { env, exports } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { JwksSource } from "../src/access.ts";
import { API_VERSION, handle } from "../src/index.ts";

// The router (contract/api.md sections 1 to 3, 8 and 9). Every request goes through handle() with
// a token signed by a key generated here, for the team domain and AUD tag in wrangler.jsonc. This
// suite runs on the production configuration, so the test clock is off.

const KID = "router-test-key";
const FIVE_MINUTES = 300;
const API = `/api/${API_VERSION}`;

let privateKey: CryptoKey;
let keys: JwksSource;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  ({ privateKey } = pair);
  const publicJwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: KID, use: "sig" };
  keys = createLocalJWKSet({ keys: [publicJwk] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function validToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "terry@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: KID, typ: "JWT" })
    .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
    .setAudience([env.ACCESS_AUD])
    .setIssuedAt(now)
    .setExpirationTime(now + FIVE_MINUTES)
    .sign(privateKey);
}

interface Call {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** Sends one request through handle() with a valid Access token. */
async function call(path: string, options: Call = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Cf-Access-Jwt-Assertion", await validToken());
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  return handle(new Request(`https://example.com${path}`, init), env, keys);
}

interface Body {
  readonly ok?: boolean;
  readonly error?: string;
  readonly project?: string;
  readonly milestones?: readonly { readonly project: string }[];
}

async function bodyOf(response: Response): Promise<Body> {
  return (await response.json()) as Body;
}

/** The projects GET state lists right now. */
async function listedProjects(): Promise<string[]> {
  const body = await bodyOf(await call(`${API}/state`));
  return body.milestones?.map((m) => m.project) ?? [];
}

function aReport(project: string): Record<string, unknown> {
  return {
    agent: "codex",
    project,
    milestone: "M1",
    active_hours: 2,
    cap_hours: 8,
    lanes: { ready_for_work: 3, in_progress: 1, needs_terry: 0, ready_for_review: 1, completed: 2 },
  };
}

function uniqueProject(): string {
  return `R-${crypto.randomUUID().slice(0, 8)}`;
}

describe("the router's Access check", () => {
  it("refuses /healthz without a token, with the contract's 401 body", async () => {
    const response = await exports.default.fetch("https://example.com/healthz");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      error: "unauthenticated",
      message: "A valid Cloudflare Access token is required.",
    });
  });

  it("logs which check failed, and never the token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await exports.default.fetch("https://example.com/healthz");
    expect(warn).toHaveBeenCalledWith(
      "swimcoach: 401 unauthenticated: Cf-Access-Jwt-Assertion header is missing or empty",
    );
  });

  it("refuses the page without a token: assets do not bypass the check", async () => {
    const response = await exports.default.fetch("https://example.com/");
    expect(response.status).toBe(401);
  });

  it("refuses a dated API route without a token", async () => {
    const response = await exports.default.fetch(`https://example.com${API}/state`);
    expect(response.status).toBe(401);
  });

  it("refuses a token signed by a key that is not Access's", async () => {
    const other = await generateKeyPair("RS256", { extractable: true });
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({ email: "terry@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: KID, typ: "JWT" })
      .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
      .setAudience([env.ACCESS_AUD])
      .setExpirationTime(now + FIVE_MINUTES)
      .sign(other.privateKey);
    const request = new Request("https://example.com/healthz", {
      headers: { "Cf-Access-Jwt-Assertion": forged },
    });
    const response = await handle(request, env, keys);
    expect(response.status).toBe(401);
  });
});

describe("the router's routes", () => {
  it("answers /healthz with a valid token, as contract/api.md section 7 requires", async () => {
    const response = await call("/healthz");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("dates the API with 2026-11-13", () => {
    expect(API_VERSION).toBe("2026-11-13");
  });

  it("stores a report and lists it in state, through the real Board", async () => {
    const project = uniqueProject();
    const reported = await call(`${API}/report`, { method: "POST", body: aReport(project) });
    expect(reported.status).toBe(200);
    expect((await bodyOf(reported)).project).toBe(project);

    const state = await call(`${API}/state`);
    expect(state.status).toBe(200);
    expect(state.headers.get("Cache-Control")).toBe("no-store");
    expect((await bodyOf(state)).milestones?.map((m) => m.project)).toContain(project);
  });

  it("stops a tracked milestone, which then leaves state", async () => {
    const project = uniqueProject();
    await call(`${API}/report`, { method: "POST", body: aReport(project) });
    const stopped = await call(`${API}/stop`, {
      method: "POST",
      body: { project, milestone: "M1" },
    });
    expect(stopped.status).toBe(200);
    expect((await bodyOf(stopped)).ok).toBe(true);
    expect(await listedProjects()).not.toContain(project);
  });

  it("ignores query strings", async () => {
    const response = await call(`${API}/state?since=0`);
    expect(response.status).toBe(200);
  });
});

describe("the router's refusals", () => {
  it.each([
    "/api/report",
    "/api/stop",
    "/api/state",
    "/index.html",
    "/healthz/",
    `${API}/state/`,
    "/api/2026-11-12/state",
    "/nope",
  ])("answers %s with 404 not_found", async (path) => {
    const response = await call(path);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await bodyOf(response)).error).toBe("not_found");
  });

  it("answers an unversioned POST /api/report with 404, not as an alias", async () => {
    const response = await call("/api/report", { method: "POST", body: aReport(uniqueProject()) });
    expect(response.status).toBe(404);
  });

  it.each([
    ["GET", `${API}/report`, "POST"],
    ["GET", `${API}/stop`, "POST"],
    ["POST", `${API}/state`, "GET"],
    ["DELETE", "/healthz", "GET"],
    ["POST", "/", "GET"],
  ])("answers %s %s with 405 and Allow: %s", async (method, path, allow) => {
    const response = await call(path, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe(allow);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await bodyOf(response)).error).toBe("method_not_allowed");
  });
});

describe("the router's test clock and failure handling", () => {
  it("answers a test clock header with 400 test_clock_disabled on the production config", async () => {
    const response = await call(`${API}/state`, {
      headers: { "Swimcoach-Test-Now": "1794573043" },
    });
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("test_clock_disabled");
  });

  it("refuses a test clock header before a report can store anything", async () => {
    const project = uniqueProject();
    const response = await call(`${API}/report`, {
      method: "POST",
      body: aReport(project),
      headers: { "Swimcoach-Test-Now": "1794573043" },
    });
    expect((await bodyOf(response)).error).toBe("test_clock_disabled");
    expect(await listedProjects()).not.toContain(project);
  });

  it("answers a thrown error with 500 internal and logs it", async () => {
    const failure = new Error("the Board is unreachable");
    const broken = {
      ...env,
      BOARD: {
        idFromName(): never {
          throw failure;
        },
      },
    } as unknown as Env;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request(`https://example.com${API}/state`, {
      headers: { "Cf-Access-Jwt-Assertion": await validToken() },
    });
    const response = await handle(request, broken, keys);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await bodyOf(response)).error).toBe("internal");
    expect(logged).toHaveBeenCalledWith("swimcoach: 500 internal:", failure);
  });
});
