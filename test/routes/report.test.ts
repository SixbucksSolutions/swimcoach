// POST /api/report through the real Board Durable Object. Every body is checked against
// contract/schemas/report.schema.json with @cfworker/json-schema, because Ajv cannot run in Workers.
// Helpers return plain values and every assertion sits in an it(), as Biome's noMisplacedAssertion wants.
import { env } from "cloudflare:workers";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import schemaFile from "../../contract/schemas/report.schema.json" with { type: "json" };
import { MAX_BODY_BYTES } from "../../src/http.ts";
import { handleReport } from "../../src/routes/report.ts";

const T0 = 1_794_573_043;

function validatorFor(definition: string): Validator {
  return new Validator(
    // biome-ignore lint/style/useNamingConvention: $defs and $ref are JSON Schema keywords.
    { $schema: schemaFile.$schema, $defs: schemaFile.$defs, $ref: `#/$defs/${definition}` },
    "2020-12",
  );
}

const reportResponseSchema = validatorFor("reportResponse");
const errorResponseSchema = validatorFor("errorResponse");

interface Body {
  readonly error?: string;
  readonly problems?: readonly { readonly path: string }[];
}

/** What a test needs to know about one response: its status, cache header, body and schema errors. */
interface Reply {
  readonly status: number;
  readonly cache: string | null;
  readonly body: Body;
  readonly schemaErrors: string[];
}

async function reply(response: Response, validator: Validator): Promise<Reply> {
  const body = (await response.json()) as Body;
  return {
    status: response.status,
    cache: response.headers.get("Cache-Control"),
    body,
    schemaErrors: validator.validate(body).errors.map((e) => `${e.instanceLocation}: ${e.error}`),
  };
}

/** The Board is shared by name, so each test uses a project name no other test uses. */
function uniqueProject(): string {
  return `P-${crypto.randomUUID().slice(0, 8)}`;
}

function aReport(
  project: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agent: "claude",
    project,
    milestone: "M12",
    active_hours: 2,
    cap_hours: 8,
    lanes: { ready_for_work: 3, in_progress: 1, needs_terry: 0, ready_for_review: 1, completed: 2 },
    ...overrides,
  };
}

function post(body: BodyInit, contentType = "application/json"): Request {
  return new Request("https://example.com/api/report", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

/** Sends a request and reads the answer as a success body. */
async function sendOk(request: Request, now: number): Promise<Reply> {
  return reply(await handleReport(request, env, now), reportResponseSchema);
}

/** Sends a request and reads the answer as an error body. */
async function sendError(request: Request, now: number): Promise<Reply> {
  return reply(await handleReport(request, env, now), errorResponseSchema);
}

function json(body: unknown): Request {
  return post(JSON.stringify(body));
}

/** A valid report body, as bytes, padded with trailing spaces (valid JSON) to exactly `size`. */
function paddedTo(size: number, project: string): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(new TextEncoder().encode(JSON.stringify(aReport(project))));
  return bytes;
}

const GOOD = { status: 200, cache: "no-store", schemaErrors: [] };

describe("POST /api/report: add and replace", () => {
  it("adds a milestone with the exact response shape", async () => {
    const project = uniqueProject();
    const first = await sendOk(json(aReport(project)), T0);
    expect(first).toMatchObject(GOOD);
    expect(first.body).toEqual({
      ok: true,
      project,
      milestone: "M12",
      received_at: T0,
      added: true,
      sample: "stored",
    });
  });

  it("replaces it on the next report", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    const second = await sendOk(json(aReport(project, { active_hours: 3 })), T0 + 120);
    expect(second).toMatchObject(GOOD);
    expect(second.body).toEqual({
      ok: true,
      project,
      milestone: "M12",
      received_at: T0 + 120,
      added: false,
      sample: "stored",
    });
  });

  it("matches the pair ASCII case-insensitively and echoes the newest spelling", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    const second = await sendOk(
      json(aReport(project.toLowerCase(), { milestone: "m12" })),
      T0 + 120,
    );
    expect(second).toMatchObject(GOOD);
    expect(second.body).toEqual({
      ok: true,
      project: project.toLowerCase(),
      milestone: "m12",
      received_at: T0 + 120,
      added: false,
      sample: "stored",
    });
  });
});

describe("POST /api/report: samples", () => {
  it("reports a duplicate within 60 seconds", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    const duplicate = await sendOk(json(aReport(project)), T0 + 59);
    expect(duplicate).toMatchObject({ ...GOOD, body: { added: false, sample: "duplicate" } });
  });

  it("stores a sample again once 60 seconds have passed", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    const later = await sendOk(json(aReport(project)), T0 + 60);
    expect(later).toMatchObject({ ...GOOD, body: { added: false, sample: "stored" } });
  });

  it("reports sample none when active_hours is 0", async () => {
    const first = await sendOk(json(aReport(uniqueProject(), { active_hours: 0 })), T0);
    expect(first).toMatchObject({ ...GOOD, body: { added: true, sample: "none" } });
  });
});

describe("POST /api/report: body forms", () => {
  it("accepts a body that starts with one byte order mark", async () => {
    const text = new TextEncoder().encode(JSON.stringify(aReport(uniqueProject())));
    const bytes = new Uint8Array(text.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(text, 3);
    const result = await sendOk(post(bytes), T0);
    expect(result).toMatchObject({ ...GOOD, body: { added: true } });
  });

  it("accepts a charset parameter on the media type", async () => {
    const request = post(
      JSON.stringify(aReport(uniqueProject())),
      "application/json; charset=utf-8",
    );
    expect(await sendOk(request, T0)).toMatchObject(GOOD);
  });

  it("refuses a wrong media type with 415", async () => {
    const result = await sendError(post("{}", "text/plain"), T0);
    expect(result).toMatchObject({
      status: 415,
      cache: "no-store",
      schemaErrors: [],
      body: { error: "unsupported_media_type" },
    });
  });

  it("refuses a body that is not JSON with 400 invalid_json", async () => {
    const result = await sendError(post("{nope"), T0);
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_json" },
    });
  });

  it("refuses a body that is not UTF-8 with 400 invalid_json", async () => {
    const result = await sendError(post(new Uint8Array([0x7b, 0xff, 0x7d])), T0);
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_json" },
    });
  });
});

describe("POST /api/report: invalid_report", () => {
  it("refuses a body that is not an object", async () => {
    const result = await sendError(json([]), T0);
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_report" },
    });
    expect(result.body.problems?.length).toBeGreaterThan(0);
  });

  it("names every problem found", async () => {
    const bad = aReport(uniqueProject(), {
      agent: "gemini",
      active_hours: -1,
      lanes: { ready_for_work: 1 },
      extra: true,
    });
    const result = await sendError(json(bad), T0);
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_report" },
    });
    expect(result.body.problems?.map((p) => p.path)).toEqual(
      expect.arrayContaining(["/agent", "/active_hours", "/lanes", "/extra"]),
    );
  });

  it("stores nothing when the report is invalid", async () => {
    const project = uniqueProject();
    await sendError(json(aReport(project, { agent: "gemini" })), T0);
    const added = await sendOk(json(aReport(project)), T0);
    expect(added).toMatchObject({ ...GOOD, body: { added: true } });
  });

  it("refuses a missing field and an empty needs_me", async () => {
    const { agent: _agent, ...withoutAgent } = aReport(uniqueProject());
    const missing = await sendError(json(withoutAgent), T0);
    const empty = await sendError(json(aReport(uniqueProject(), { needs_me: "" })), T0);
    expect([missing.body.error, empty.body.error]).toEqual(["invalid_report", "invalid_report"]);
    expect([missing.schemaErrors, empty.schemaErrors]).toEqual([[], []]);
  });
});

describe("POST /api/report: clock and size", () => {
  it("refuses a clock that went backward with 409", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    const result = await sendError(json(aReport(project, { active_hours: 5 })), T0 - 1);
    expect(result).toMatchObject({
      status: 409,
      cache: "no-store",
      schemaErrors: [],
      body: { ok: false, error: "clock_went_backward" },
    });
  });

  it("keeps the earlier state after a 409", async () => {
    const project = uniqueProject();
    await sendOk(json(aReport(project)), T0);
    await sendError(json(aReport(project, { active_hours: 5 })), T0 - 1);
    const after = await sendOk(json(aReport(project)), T0 + 1);
    expect(after).toMatchObject({ ...GOOD, body: { added: false, sample: "duplicate" } });
  });

  it("accepts a valid body of exactly 16384 bytes", async () => {
    const bytes = paddedTo(16_384, uniqueProject());
    expect([MAX_BODY_BYTES, bytes.byteLength]).toEqual([16_384, 16_384]);
    expect(await sendOk(post(bytes), T0)).toMatchObject({ ...GOOD, body: { added: true } });
  });

  it("refuses a body of 16385 bytes with 413", async () => {
    const bytes = paddedTo(16_385, uniqueProject());
    expect(bytes.byteLength).toBe(16_385);
    const result = await sendError(post(bytes), T0);
    expect(result).toMatchObject({
      status: 413,
      cache: "no-store",
      schemaErrors: [],
      body: { error: "body_too_large" },
    });
  });
});
