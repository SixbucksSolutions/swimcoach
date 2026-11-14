import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /healthz", () => {
  it("answers ok, as contract/api.md section 7 requires", async () => {
    const response = await exports.default.fetch("http://example.com/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("no longer answers the scaffold's placeholder path", async () => {
    const response = await exports.default.fetch("http://example.com/api/health");
    expect(response.status).toBe(404);
  });
});
