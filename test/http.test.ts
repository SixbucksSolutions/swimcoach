import { describe, expect, it } from "vitest";
import {
  type BodyResult,
  errorResponse,
  MAX_BODY_BYTES,
  readJsonBody,
  requestTime,
  type TimeResult,
} from "../src/http.ts";

const REAL_NOW = 1_794_573_043;

function withHeader(value: string): Request {
  return new Request("https://example.com/api/state", { headers: { "Swimcoach-Test-Now": value } });
}

function post(body: BodyInit, contentType = "application/json"): Request {
  return new Request("https://example.com/api/report", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

/** The refusal's response; throws, failing the test, when the result was not a refusal. */
function refusal(result: BodyResult | TimeResult): Response {
  if (result.ok) {
    throw new Error("Expected a refusal, got ok.");
  }
  return result.response;
}

describe("requestTime (contract/api.md section 9)", () => {
  it("uses the real clock when the header is absent", () => {
    const result = requestTime(new Request("https://example.com/"), {}, REAL_NOW);
    expect(result).toEqual({ ok: true, now: REAL_NOW });
  });

  it.each([
    ["absent", {}],
    ["empty", { SWIMCOACH_TEST_CLOCK: "" }],
    ["false", { SWIMCOACH_TEST_CLOCK: "false" }],
    ["0", { SWIMCOACH_TEST_CLOCK: "0" }],
    ["padded", { SWIMCOACH_TEST_CLOCK: " on" }],
    ["upper case", { SWIMCOACH_TEST_CLOCK: "ON" }],
    ["boolean true", { SWIMCOACH_TEST_CLOCK: true }],
  ])("fails closed when the switch is %s", async (_label, env) => {
    const response = refusal(requestTime(withHeader("1794573043.25"), env, REAL_NOW));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "test_clock_disabled" });
  });

  it("uses the header's value on a test deployment", () => {
    const result = requestTime(
      withHeader("1794573043.25"),
      { SWIMCOACH_TEST_CLOCK: "on" },
      REAL_NOW,
    );
    expect(result).toEqual({ ok: true, now: 1_794_573_043.25 });
  });

  // A 13-digit value is one digit over the contract's 12; built here so it reads as a number, not a key.
  const thirteenDigits = "1".repeat(13);
  // Fetch trims surrounding whitespace from header values, so " 5" arrives as "5" and is valid.
  it.each(["", "-1", "+5", "1e9", "12.", thirteenDigits, "1.1234567", "5 5"])(
    "refuses the malformed value %j",
    async (value) => {
      const env = { SWIMCOACH_TEST_CLOCK: "on" };
      const response = refusal(requestTime(withHeader(value), env, REAL_NOW));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_test_clock" });
    },
  );
});

describe("readJsonBody (contract/api.md section 1)", () => {
  it("parses JSON, with or without a charset parameter", async () => {
    expect(await readJsonBody(post('{"a":1}'))).toEqual({ ok: true, body: { a: 1 } });
    expect(await readJsonBody(post('{"a":1}', "application/json; charset=utf-8"))).toEqual({
      ok: true,
      body: { a: 1 },
    });
  });

  it("drops one leading byte order mark", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"a":2}')]);
    expect(await readJsonBody(post(bytes))).toEqual({ ok: true, body: { a: 2 } });
  });

  it("refuses another media type with 415", async () => {
    const response = refusal(await readJsonBody(post('{"a":1}', "text/plain")));
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: "unsupported_media_type" });
  });

  it("refuses a body over 16 KiB with 413", async () => {
    const response = refusal(await readJsonBody(post(`"${"x".repeat(MAX_BODY_BYTES)}"`)));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "body_too_large" });
  });

  it.each([
    ["not JSON", new TextEncoder().encode("{oops")],
    ["not UTF-8", new Uint8Array([0x7b, 0xff, 0x7d])],
  ])("refuses a body that is %s with 400 invalid_json", async (_label, bytes) => {
    const response = refusal(await readJsonBody(post(bytes)));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_json" });
  });
});

describe("errorResponse (contract/api.md section 8)", () => {
  it("has the contract's body and no-store", async () => {
    const response = errorResponse(404, "not_found", "There is nothing here.");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      error: "not_found",
      message: "There is nothing here.",
    });
  });

  it("carries problems when given", async () => {
    const problems = [{ path: "/lanes", message: "Lanes are missing." }];
    const response = errorResponse(400, "invalid_report", "The report is invalid.", problems);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_report",
      message: "The report is invalid.",
      problems,
    });
  });
});
