import { env, exports } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import type { JwksSource } from "../src/access.ts";
import { handle } from "../src/index.ts";

// The page's files through the router (t4-interfaces.md, MVP-08): "/" serves public/index.html, and
// /css/<name>.css and /js/<name>.js serve public/css and public/js, behind the same Access check as
// everything else. Every other path, /index.html included, stays 404 not_found (contract/api.md 1).

const KID = "page-files-test-key";
const FIVE_MINUTES = 300;

let privateKey: CryptoKey;
let keys: JwksSource;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  ({ privateKey } = pair);
  const publicJwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: KID, use: "sig" };
  keys = createLocalJWKSet({ keys: [publicJwk] });
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

/** Sends one request through handle() with a valid Access token. */
async function call(path: string, method = "GET"): Promise<Response> {
  const headers = new Headers({ "Cf-Access-Jwt-Assertion": await validToken() });
  return handle(new Request(`https://example.com${path}`, { method, headers }), env, keys);
}

async function errorOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { readonly error?: string }).error;
}

// Path, the Content-Type it MUST carry, and a string its committed bytes hold.
const PAGE_FILES = [
  ["/css/base.css", "text/css", "--ok-fill: #1b6445;"],
  ["/js/view.js", "javascript", "@typedef {object} CardView"],
  ["/js/format.js", "javascript", "export function fmtTime(d)"],
] as const;

describe("the page's files", () => {
  it("serves the page at / with a valid token", async () => {
    const response = await call("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<title>swimcoach</title>");
    expect(html).toContain('<script type="module" src="/js/main.js"></script>');
  });

  it.each(PAGE_FILES)("serves %s with a valid token, as %s", async (path, type, held) => {
    const response = await call(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(type);
    expect(await response.text()).toContain(held);
  });

  it.each(["/", ...PAGE_FILES.map(([path]) => path)])(
    "refuses %s without a token",
    async (path) => {
      const response = await exports.default.fetch(`https://example.com${path}`);
      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe("unauthenticated");
    },
  );

  it.each([
    "/index.html",
    "/js/missing.js",
    "/css/missing.css",
    "/js/View.js",
    "/js/view.js/",
    "/js/sub/view.js",
    "/js/view.mjs",
    "/public/index.html",
    "/favicon.ico",
  ])("answers %s with 404 not_found", async (path) => {
    const response = await call(path);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await errorOf(response)).toBe("not_found");
  });

  it("answers POST on a page file with 405 and Allow: GET", async () => {
    const response = await call("/js/view.js", "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
