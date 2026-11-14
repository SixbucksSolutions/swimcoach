// POST /api/stop through the real Board Durable Object, with every body checked against
// contract/schemas/report.schema.json (@cfworker/json-schema; Ajv cannot run in Workers).
// Helpers return plain values and every assertion sits in an it(), as Biome's noMisplacedAssertion wants.
import { env } from "cloudflare:workers";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import schemaFile from "../../contract/schemas/report.schema.json" with { type: "json" };
import { handleReport } from "../../src/routes/report.ts";
import { handleStop } from "../../src/routes/stop.ts";

const T0 = 1_794_573_043;

function validatorFor(definition: string): Validator {
  return new Validator(
    // biome-ignore lint/style/useNamingConvention: $defs and $ref are JSON Schema keywords.
    { $schema: schemaFile.$schema, $defs: schemaFile.$defs, $ref: `#/$defs/${definition}` },
    "2020-12",
  );
}

const reportResponseSchema = validatorFor("reportResponse");
const stopResponseSchema = validatorFor("stopResponse");
const errorResponseSchema = validatorFor("errorResponse");

interface Body {
  readonly error?: string;
  readonly problems?: readonly { readonly path: string }[];
}

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

function uniqueProject(): string {
  return `S-${crypto.randomUUID().slice(0, 8)}`;
}

function post(path: string, body: BodyInit, contentType = "application/json"): Request {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function aReport(project: string, milestone = "M12"): Record<string, unknown> {
  return {
    agent: "codex",
    project,
    milestone,
    active_hours: 2,
    cap_hours: 8,
    lanes: { ready_for_work: 3, in_progress: 1, needs_terry: 0, ready_for_review: 1, completed: 2 },
  };
}

/** Reports a milestone and returns the reply, read as a reportResponse. */
async function report(body: Record<string, unknown>, now: number): Promise<Reply> {
  const request = post("/api/report", JSON.stringify(body));
  return reply(await handleReport(request, env, now), reportResponseSchema);
}

function stopRequest(body: unknown): Request {
  return post("/api/stop", JSON.stringify(body));
}

async function stopOk(body: unknown): Promise<Reply> {
  return reply(await handleStop(stopRequest(body), env, T0), stopResponseSchema);
}

async function stopError(request: Request): Promise<Reply> {
  return reply(await handleStop(request, env, T0), errorResponseSchema);
}

const GOOD = { status: 200, cache: "no-store", schemaErrors: [] };

/** A 16 KiB-or-so stop body: valid JSON padded with trailing spaces to exactly `size` bytes. */
function paddedStop(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(new TextEncoder().encode('{"project":"A","milestone":"B"}'));
  return bytes;
}

describe("POST /api/stop: tracked and untracked", () => {
  it("stops a tracked milestone and echoes the stored spelling", async () => {
    const project = uniqueProject();
    await report(aReport(project), T0);
    const result = await stopOk({ project: project.toLowerCase(), milestone: "m12" });
    expect(result).toMatchObject(GOOD);
    expect(result.body).toEqual({ ok: true, project, milestone: "M12" });
  });

  it("answers 404 not_tracked for an untracked milestone", async () => {
    const result = await stopError(stopRequest({ project: uniqueProject(), milestone: "M1" }));
    expect(result).toMatchObject({
      status: 404,
      cache: "no-store",
      schemaErrors: [],
      body: { ok: false, error: "not_tracked" },
    });
  });

  it("answers 404 not_tracked the second time", async () => {
    const project = uniqueProject();
    await report(aReport(project), T0);
    await stopOk({ project, milestone: "M12" });
    const again = await stopError(stopRequest({ project, milestone: "M12" }));
    expect(again).toMatchObject({ status: 404, body: { error: "not_tracked" } });
  });

  it("leaves a different milestone of the same project alone", async () => {
    const project = uniqueProject();
    await report(aReport(project, "M1"), T0);
    await report(aReport(project, "M2"), T0);
    await stopOk({ project, milestone: "M1" });
    const kept = await report(aReport(project, "M2"), T0 + 120);
    expect(kept).toMatchObject({ ...GOOD, body: { added: false } });
  });
});

describe("POST /api/stop: then report", () => {
  it("re-adds from scratch, with no history", async () => {
    const project = uniqueProject();
    const first = await report(aReport(project), T0);
    const replaced = await report(aReport(project), T0 + 120);
    await stopOk({ project, milestone: "M12" });
    // A time before the deleted row's updated_at is accepted: its history is gone.
    const readded = await report(aReport(project), T0 - 500);
    expect([first.body, replaced.body, readded.body]).toMatchObject([
      { added: true },
      { added: false },
      { added: true, sample: "stored" },
    ]);
    expect(readded).toMatchObject(GOOD);
  });
});

describe("POST /api/stop: refusals", () => {
  it("refuses an invalid body with 400 invalid_stop and problems", async () => {
    const result = await stopError(stopRequest({ project: "", extra: 1 }));
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_stop" },
    });
    expect(result.body.problems?.map((p) => p.path)).toEqual(
      expect.arrayContaining(["/project", "/extra", ""]),
    );
  });

  it("refuses a body that is not an object", async () => {
    const result = await stopError(stopRequest("FGA"));
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_stop" },
    });
  });

  it("refuses a wrong media type with 415", async () => {
    const result = await stopError(post("/api/stop", "{}", "text/plain"));
    expect(result).toMatchObject({
      status: 415,
      schemaErrors: [],
      body: { error: "unsupported_media_type" },
    });
  });

  it("refuses a body that is not JSON with 400 invalid_json", async () => {
    const result = await stopError(post("/api/stop", "{nope"));
    expect(result).toMatchObject({
      status: 400,
      schemaErrors: [],
      body: { error: "invalid_json" },
    });
  });

  it("accepts a body of exactly 16384 bytes", async () => {
    const result = await stopError(post("/api/stop", paddedStop(16_384)));
    expect(result).toMatchObject({ status: 404, schemaErrors: [], body: { error: "not_tracked" } });
  });

  it("refuses a body of 16385 bytes with 413", async () => {
    const result = await stopError(post("/api/stop", paddedStop(16_385)));
    expect(result).toMatchObject({
      status: 413,
      schemaErrors: [],
      body: { error: "body_too_large" },
    });
  });
});
