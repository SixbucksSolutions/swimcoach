import { env, exports } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { JwksSource } from "../src/access.ts";
import { handle } from "../src/index.ts";

// The router checks Cloudflare Access on every request (contract/api.md section 2). These tests
// sign tokens with a key generated here, for the team domain and AUD tag in wrangler.jsonc.

const KID = "router-test-key";
const FIVE_MINUTES = 300;

let privateKey: CryptoKey;
let keys: JwksSource;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  ({ privateKey } = pair);
  const publicJwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: KID, use: "sig" };
  keys = createLocalJWKSet({ keys: [publicJwk] });
});

function signedRequest(path: string, token: string): Request {
  return new Request(`https://example.com${path}`, {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });
}

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

  it("refuses the page without a token: assets do not bypass the check", async () => {
    const response = await exports.default.fetch("https://example.com/");
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
    const response = await handle(signedRequest("/healthz", forged), env, keys);
    expect(response.status).toBe(401);
  });

  it("answers /healthz with a valid token, as contract/api.md section 7 requires", async () => {
    const response = await handle(signedRequest("/healthz", await validToken()), env, keys);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });
});
