// Shared HTTP helpers for the swimcoach routes (Lead, T3; frozen before dispatch).
// Source of truth: contract/api.md section 1 (conventions), section 8 (errors) and section 9 (the
// test clock). Route modules MUST use these instead of building their own responses.

import type { Board } from "./board/board.ts";
import type { EpochSeconds } from "./contract.ts";
import type { Problem } from "./ingest/validate.ts";

// Section 9: the switch's name and its one enabling value are the implementation's business. Only a
// test Worker defines SWIMCOACH_TEST_CLOCK, and only the exact string "on" turns the clock on. The
// production wrangler.jsonc MUST NOT define it. Every other value, absent included, is production.
const TEST_CLOCK_SWITCH = "SWIMCOACH_TEST_CLOCK";
const TEST_CLOCK_ON = "on";
const TEST_CLOCK_VALUE = /^[0-9]{1,12}(?:\.[0-9]{1,6})?$/u;

const JSON_MEDIA_TYPE = /^application\/json\s*(?:;.*)?$/iu;

function tooLarge(): Response {
  return errorResponse(413, "body_too_large", "The body is over 16 KiB.");
}

function invalidJson(): Response {
  return errorResponse(400, "invalid_json", "The body is not UTF-8 JSON.");
}

/** Section 1: every /api/* and /healthz answer carries this. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Section 1: a body over 16 KiB is refused. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Section 9: the request header that carries a test time. */
export const TEST_CLOCK_HEADER = "Swimcoach-Test-Now";

/** Section 8: every error code the Worker returns. */
export type ErrorCode =
  | "body_too_large"
  | "clock_went_backward"
  | "internal"
  | "invalid_json"
  | "invalid_report"
  | "invalid_stop"
  | "invalid_test_clock"
  | "method_not_allowed"
  | "not_found"
  | "not_tracked"
  | "test_clock_disabled"
  | "unauthenticated"
  | "unsupported_media_type";

export type TimeResult =
  | { readonly ok: true; readonly now: EpochSeconds }
  | { readonly ok: false; readonly response: Response };

export type BodyResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly response: Response };

/** A JSON answer with Cache-Control: no-store. Extra headers (for example Allow) MAY be added. */
export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = new Headers(headers);
  merged.set("Cache-Control", NO_STORE["Cache-Control"]);
  return Response.json(body, { status, headers: merged });
}

/** Section 8's errorResponse body: { ok: false, error, message }, plus problems for invalid_*. */
export function errorResponse(
  status: number,
  error: ErrorCode,
  message: string,
  problems?: readonly Problem[],
): Response {
  if (problems === undefined) {
    return jsonResponse({ ok: false, error, message }, status);
  }
  return jsonResponse({ ok: false, error, message, problems }, status);
}

/**
 * The time this request runs at (section 9). Without the header it is the real clock. With it, a
 * test deployment uses the header's value, and production answers 400 test_clock_disabled. The
 * comparison with the enabling value is exact, so "false", "0" or " on" all mean production.
 */
export function requestTime(
  request: Request,
  env: object,
  realNow: EpochSeconds = Date.now() / 1000,
): TimeResult {
  const header = request.headers.get(TEST_CLOCK_HEADER);
  if (header === null) {
    return { ok: true, now: realNow };
  }
  const testClock: unknown = (env as Record<string, unknown>)[TEST_CLOCK_SWITCH];
  if (testClock !== TEST_CLOCK_ON) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "test_clock_disabled",
        "This deployment does not accept a test clock.",
      ),
    };
  }
  if (!TEST_CLOCK_VALUE.test(header)) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_test_clock",
        "The test clock value is not epoch seconds.",
      ),
    };
  }
  return { ok: true, now: Number(header) };
}

/**
 * Reads a write request's body (section 1): Content-Type application/json (a charset parameter is
 * allowed) else 415; over 16 KiB 413; not UTF-8 JSON 400 invalid_json. One leading byte order mark is
 * accepted and dropped. The caller validates the parsed value against the schema.
 */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  const mediaType = request.headers.get("Content-Type") ?? "";
  if (!JSON_MEDIA_TYPE.test(mediaType)) {
    return {
      ok: false,
      response: errorResponse(415, "unsupported_media_type", "Send the body as application/json."),
    };
  }
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }
  let text: string;
  try {
    // ignoreBOM false makes the decoder drop exactly one leading byte order mark, as section 1 requires.
    // biome-ignore lint/style/useNamingConvention: ignoreBOM is the Web platform's own option name.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { ok: false, response: invalidJson() };
  }
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: invalidJson() };
  }
}

/** The one Board every route talks to. */
export function boardStub(env: Env): DurableObjectStub<Board> {
  return env.BOARD.get(env.BOARD.idFromName("board"));
}
