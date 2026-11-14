// The one HTTP request every harness call goes through: Access service-token headers, the test
// clock header, no redirect ever followed, a fixed timeout, and no header value in any message.
import type { Config } from "./config.ts";
import { checkClockFreeWrite } from "./guard.ts";
import { isRecord, parseJson } from "./json.ts";
import type { Reply, Send } from "./types.ts";

/** The dated API version the suite tests (contract/api.md, "Versioning"). */
const API_VERSION = "2026-11-13";
const REPORT_PATH = `/api/${API_VERSION}/report`;
const STOP_PATH = `/api/${API_VERSION}/stop`;
const STATE_PATH = `/api/${API_VERSION}/state`;

const MAX_EPOCH_SECONDS = 999_999_999_999;
const DEFAULT_TIMEOUT_MS = 30_000;
const TRAILING_SLASHES = /\/+$/u;
const TRAILING_ZEROS = /0+$/u;
const TRAILING_POINT = /\.$/u;
const UNRELATED_SECRET = "this-is-not-the-access-secret";

interface TransportOptions {
  readonly config: Config;
  readonly suite: "clock-free" | "full";
  readonly timeoutMs?: number;
}

/** The Swimcoach-Test-Now value: api.md section 9 allows at most 6 fraction digits. */
function formatAt(at: number): string {
  if (!Number.isFinite(at) || at < 0 || at > MAX_EPOCH_SECONDS) {
    throw new RangeError(`The test time ${String(at)} is not a usable epoch second.`);
  }
  if (Number.isInteger(at)) {
    return String(at);
  }
  return at.toFixed(6).replace(TRAILING_ZEROS, "").replace(TRAILING_POINT, "");
}

function errorCode(reply: Reply): string | undefined {
  if (isRecord(reply.body) && typeof reply.body.error === "string") {
    return reply.body.error;
  }
  return undefined;
}

function describeFailure(reply: Reply): string {
  const code = errorCode(reply);
  if (code === undefined) {
    return `status ${reply.status}`;
  }
  return `status ${reply.status} (${code})`;
}

function payloadOf(send: Send): string | Uint8Array | undefined {
  if (send.raw !== undefined) {
    return send.raw;
  }
  if (send.body !== undefined) {
    return JSON.stringify(send.body);
  }
  return undefined;
}

function secretFor(auth: "token" | "bad-secret", config: Config): string {
  if (auth === "token") {
    return config.accessClientSecret;
  }
  return UNRELATED_SECRET;
}

/** The OS error code behind a failed fetch; the code names no header value. */
function networkCode(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error && "code" in error.cause) {
    return String(error.cause.code);
  }
  return "unknown";
}

/** Refuses a request before it leaves: a bad path, or one the clock-free suite MUST NOT send. */
function preflight(suite: "clock-free" | "full", method: string, path: string, send: Send): void {
  if (!path.startsWith("/")) {
    throw new Error(`The request path "${path}" must start with a slash.`);
  }
  if (suite !== "clock-free") {
    return;
  }
  if (send.at !== undefined) {
    throw new Error("The clock-free suite sends no Swimcoach-Test-Now header: use a timed case.");
  }
  if (method === "POST" && (path === REPORT_PATH || path === STOP_PATH)) {
    checkClockFreeWrite(send);
  }
}

function buildHeaders(config: Config, send: Send, hasPayload: boolean): Headers {
  const headers = new Headers();
  const auth = send.auth ?? "token";
  if (auth !== "none") {
    headers.set("CF-Access-Client-Id", config.accessClientId);
    headers.set("CF-Access-Client-Secret", secretFor(auth, config));
  }
  if (hasPayload) {
    headers.set("Content-Type", "application/json");
  }
  if (send.at !== undefined) {
    headers.set("Swimcoach-Test-Now", formatAt(send.at));
  }
  for (const [name, value] of Object.entries(send.headers ?? {})) {
    headers.set(name, value);
  }
  return headers;
}

/** A timed request that meets test_clock_disabled FAILS the run; it never skips (t4-interfaces.md). */
function rejectDisabledClock(send: Send, reply: Reply): void {
  if (send.at !== undefined && errorCode(reply) === "test_clock_disabled") {
    throw new Error(
      "The deployment answered test_clock_disabled to a timed request: the full suite needs a test deployment with the test clock on.",
    );
  }
}

/** Builds `request`: one attempt per call, redirects never followed. */
function createRequest(
  options: TransportOptions,
): (method: string, path: string, send?: Send) => Promise<Reply> {
  const { config, suite } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = config.url.replace(TRAILING_SLASHES, "");
  return async (method, path, send = {}) => {
    preflight(suite, method, path, send);
    const payload = payloadOf(send);
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: buildHeaders(config, send, payload !== undefined),
        body: payload,
      });
    } catch (error) {
      throw new Error(`The request ${method} ${path} failed to complete (${networkCode(error)}).`, {
        cause: error,
      });
    }
    const text = await response.text();
    const reply: Reply = {
      status: response.status,
      headers: response.headers,
      body: parseJson(text),
      text,
    };
    rejectDisabledClock(send, reply);
    return reply;
  };
}

export type { TransportOptions };
export {
  API_VERSION,
  createRequest,
  describeFailure,
  errorCode,
  formatAt,
  REPORT_PATH,
  STATE_PATH,
  STOP_PATH,
};
