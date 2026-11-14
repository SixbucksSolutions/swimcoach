// The one HTTP request every harness call goes through: Access service-token headers, the test
// clock header, no redirect ever followed, a fixed timeout, and no header value in any message.
import type { Config } from "./config.ts";
import { checkClockFreeWrite, hasTestClockHeader } from "./guard.ts";
import { isRecord, parseJson } from "./json.ts";
import type { Reply, Send } from "./types.ts";

/** The dated API version the suite tests (contract/api.md, "Versioning"). */
const API_VERSION = "2026-11-13";
const REPORT_PATH = `/api/${API_VERSION}/report`;
const STOP_PATH = `/api/${API_VERSION}/stop`;
const STATE_PATH = `/api/${API_VERSION}/state`;

const MAX_EPOCH_SECONDS = 999_999_999_999;
const MILLISECONDS_PER_SECOND = 1000;
const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;
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

/** A timed request's `at` MUST lie within 7 days before real time and not after it (t4-interfaces.md). */
function checkTimeBound(at: number): void {
  const now = Date.now() / MILLISECONDS_PER_SECOND;
  formatAt(at);
  if (at > now || at < now - SEVEN_DAYS_SECONDS) {
    throw new RangeError(
      `The test time ${String(at)} is outside the allowed window: at most 7 days before real time, never after it.`,
    );
  }
}

/** Refuses a request before it leaves: a bad path, or one the clock-free suite MUST NOT send. */
function preflight(suite: "clock-free" | "full", path: string, send: Send): void {
  if (!path.startsWith("/")) {
    throw new Error(`The request path "${path}" must start with a slash.`);
  }
  if (suite === "clock-free" && send.at !== undefined) {
    throw new Error(
      "The clock-free suite sends no Swimcoach-Test-Now from `at`: use a timed case.",
    );
  }
  if (send.at !== undefined) {
    checkTimeBound(send.at);
  }
  if (suite === "clock-free") {
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

/**
 * A timed request that meets test_clock_disabled FAILS the run; it never skips. A clock-free
 * request MAY carry the header by hand, only to prove production refuses it, so any answer other
 * than 400 test_clock_disabled fails the run (t4-interfaces.md, MVP-09 "Tiers").
 */
function checkClockAnswer(suite: "clock-free" | "full", send: Send, reply: Reply): void {
  const code = errorCode(reply);
  if (send.at !== undefined && code === "test_clock_disabled") {
    throw new Error(
      "The deployment answered test_clock_disabled to a timed request: the full suite needs a test deployment with the test clock on.",
    );
  }
  if (
    suite === "clock-free" &&
    hasTestClockHeader(send) &&
    (reply.status !== 400 || code !== "test_clock_disabled")
  ) {
    throw new Error(
      `A clock-free request carried Swimcoach-Test-Now and got status ${reply.status}, not 400 test_clock_disabled: the deployment honored the test clock, so it is not production.`,
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
  return async (requested, path, send = {}) => {
    const method = requested.toUpperCase();
    preflight(suite, path, send);
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
      // No `cause` and no error message is carried: a Headers error quotes the offending header
      // value, and that value can be the Access secret. Only the OS error code survives.
      // biome-ignore lint/style/useErrorCause: the cause is withheld on purpose, see above
      throw new Error(`The request ${method} ${path} failed to complete (${networkCode(error)}).`);
    }
    const text = await response.text();
    const reply: Reply = {
      status: response.status,
      headers: response.headers,
      body: parseJson(text),
      text,
    };
    checkClockAnswer(suite, send, reply);
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
