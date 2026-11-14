import {
  base64url,
  createLocalJWKSet,
  exportJWK,
  type FetchImplementation,
  type FlattenedJWSInput,
  generateKeyPair,
  type JWK,
  type JWSHeaderParameters,
  type JWTPayload,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
// biome-ignore lint/correctness/useImportExtensions: tsconfig lacks allowImportingTsExtensions, so tsc refuses ".ts" on a value import (TS5097); the Lead owns tsconfig.
import { ACCESS_JWT_HEADER, accessCertsUrl, remoteJwks, verifyAccess } from "../src/access";
import type { JwksSource } from "../src/access.ts";
import type { AccessConfig } from "../src/contract.ts";

// Every key below is generated in the test run. Nothing here talks to Cloudflare.

const TEAM = "example-team.cloudflareaccess.com";
const ISSUER = `https://${TEAM}`;
const AUD = "test-application-aud-tag";
const KID = "access-test-key";
const EC_KID = "access-test-ec-key";
const USER_EMAIL = "terry@example.com";
const SERVICE_CLIENT_ID = "test-client-id.access";
const FIVE_MINUTES = 300;
const ALG = "ERR_JOSE_ALG_NOT_ALLOWED";
const SIGNATURE = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
const NO_HEADER = "header is missing or empty";

/** An AccessConfig; undefined stands for a Worker variable that was never set. */
function config(team: string | undefined, aud: string | undefined): AccessConfig {
  // biome-ignore lint/style/useNamingConvention: the frozen contract names Worker variables in CONSTANT_CASE.
  const cfg = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud };
  return cfg as AccessConfig;
}

const CFG = config(TEAM, AUD);

interface Signer {
  readonly privateKey: CryptoKey;
  readonly publicJwk: JWK;
}

let access: Signer;
let attacker: Signer;
let ecKey: Signer;
let jwks: { keys: JWK[] };
let keys: JwksSource;
let keyLookups = 0;

async function makeSigner(alg: "ES256" | "RS256", kid: string): Promise<Signer> {
  const pair = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(pair.publicKey)), alg, kid, use: "sig" };
  return { privateKey: pair.privateKey, publicJwk };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** The claims Access puts in a login session's application token, with any overrides. */
function userClaims(overrides: JWTPayload = {}): JWTPayload {
  const now = nowSeconds();
  return {
    aud: [AUD],
    email: USER_EMAIL,
    exp: now + FIVE_MINUTES,
    iat: now,
    nbf: now,
    iss: ISSUER,
    type: "app",
    sub: "test-user-id",
    country: "US",
    ...overrides,
  };
}

/** The claims Access puts in a service token's application token: no email and no nbf. */
function serviceClaims(): JWTPayload {
  const now = nowSeconds();
  const exp = now + FIVE_MINUTES;
  return {
    type: "app",
    aud: [AUD],
    exp,
    iss: ISSUER,
    common_name: SERVICE_CLIENT_ID,
    iat: now,
    sub: "",
  };
}

function without(claim: string): JWTPayload {
  const claims = userClaims();
  delete claims[claim];
  return claims;
}

function mint(claims: JWTPayload, signer = access, alg = "RS256", kid = KID): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg, kid, typ: "JWT" }).sign(signer.privateKey);
}

/** A login session token with these claims changed, signed by Access's key. */
function minted(overrides: JWTPayload): Promise<string> {
  return mint(userClaims(overrides));
}

function part(value: object): string {
  return base64url.encode(JSON.stringify(value));
}

/** A genuine Access signature under a substituted header and/or payload. */
async function spliced(header?: object, payload?: string): Promise<string> {
  const [genuineHeader = "", genuinePayload = "", signature = ""] = (await minted({})).split(".");
  let headerPart = genuineHeader;
  if (header !== undefined) {
    headerPart = part(header);
  }
  return `${headerPart}.${payload ?? genuinePayload}.${signature}`;
}

function requestWith(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set(ACCESS_JWT_HEADER, token);
  }
  return new Request("https://swimcoach.example/api/state", { headers });
}

/** The local test JWKS, counting how often verification asks it for a key. */
function countingKeys(header: JWSHeaderParameters, token: FlattenedJWSInput): Promise<CryptoKey> {
  keyLookups += 1;
  return keys(header, token);
}

function rejectingKeys(): Promise<CryptoKey> {
  return Promise.reject(new Error("JWKS unreachable"));
}

function throwingKeys(): Promise<CryptoKey> {
  throw new TypeError("broken source");
}

beforeAll(async () => {
  access = await makeSigner("RS256", KID);
  attacker = await makeSigner("RS256", KID);
  ecKey = await makeSigner("ES256", EC_KID);
  jwks = { keys: [access.publicJwk, ecKey.publicJwk] };
  keys = createLocalJWKSet(jwks);
});

describe("verifyAccess admits a genuine Access token", () => {
  it.each<[string, () => JWTPayload, string]>([
    ["a login session token, naming the email", userClaims, USER_EMAIL],
    ["a service token, naming its client ID", serviceClaims, SERVICE_CLIENT_ID],
    ["an aud listing ACCESS_AUD among others", () => userClaims({ aud: ["x", AUD] }), USER_EMAIL],
  ])("admits %s", async (_name, claims, subject) => {
    const result = await verifyAccess(requestWith(await mint(claims())), CFG, keys);
    expect(result).toEqual({ ok: true, subject });
  });
});

// Each row: what is wrong, the token (undefined: no header at all), and a fragment of `why` that
// proves the intended check refused it rather than some other one.
const REFUSALS: [string, () => Promise<string | undefined>, string][] = [
  // The header.
  ["a missing header", () => Promise.resolve(undefined), NO_HEADER],
  ["an empty header", () => Promise.resolve(""), NO_HEADER],
  ["a header of spaces", () => Promise.resolve("   "), NO_HEADER],
  // Malformed tokens.
  ["a value that is not a JWT", () => Promise.resolve("not-a-jwt"), "ERR_JWS_INVALID"],
  ["three parts of garbage", () => Promise.resolve("a.b.c"), "ERR_JWS_INVALID"],
  ["a payload that is not JSON", () => spliced(undefined, base64url.encode("{")), SIGNATURE],
  // The signature.
  [
    "a forged signature: another key, Access's key id",
    () => mint(userClaims(), attacker),
    SIGNATURE,
  ],
  [
    "an altered payload",
    () => spliced(undefined, part(userClaims({ email: "m@x.com" }))),
    SIGNATURE,
  ],
  [
    "a key id the JWKS does not hold",
    () => mint(userClaims(), attacker, "RS256", "unknown-key"),
    "ERR_JWKS_NO_MATCHING_KEY",
  ],
  // The algorithm.
  [
    'alg "none", unsigned',
    () => Promise.resolve(`${part({ alg: "none" })}.${part(userClaims())}.`),
    ALG,
  ],
  ['alg "none" over a genuine signature', () => spliced({ alg: "none", kid: KID }), ALG],
  ["RS512 over a genuine RS256 signature", () => spliced({ alg: "RS512", kid: KID }), ALG],
  ["ES256, though the JWKS holds its key", () => mint(userClaims(), ecKey, "ES256", EC_KID), ALG],
  [
    "HS256 keyed with the public key (algorithm confusion)",
    () =>
      new SignJWT(userClaims())
        .setProtectedHeader({ alg: "HS256", kid: KID })
        .sign(new TextEncoder().encode(JSON.stringify(access.publicJwk))),
    ALG,
  ],
  // The claims.
  ["the wrong aud", () => minted({ aud: ["another-app"] }), '"aud"'],
  ["no aud", () => mint(without("aud")), '"aud"'],
  ["an expired token", () => minted({ iat: 1, nbf: 1, exp: nowSeconds() - 1 }), "ERR_JWT_EXPIRED"],
  ["no exp", () => mint(without("exp")), '"exp"'],
  ["an nbf in the future", () => minted({ nbf: nowSeconds() + FIVE_MINUTES }), '"nbf"'],
  ["another team's iss", () => minted({ iss: "https://other.cloudflareaccess.com" }), '"iss"'],
  ["an iss with a trailing slash", () => minted({ iss: `${ISSUER}/` }), '"iss"'],
  ["an iss over plain http", () => minted({ iss: `http://${TEAM}` }), '"iss"'],
  ["no iss", () => mint(without("iss")), '"iss"'],
  ["a token that names nobody", () => mint({ ...without("email"), sub: "" }), "names no email"],
];

describe("verifyAccess refuses", () => {
  it.each(REFUSALS)("refuses %s", async (_name, token, why) => {
    const result = await verifyAccess(requestWith(await token()), CFG, keys);
    expect(result).toEqual({ ok: false, why: expect.stringContaining(why) });
  });
});

describe("verifyAccess fails closed on bad configuration, before looking up a key", () => {
  it.each<[string, AccessConfig, string]>([
    ["an empty team domain", config("", AUD), "ACCESS_TEAM_DOMAIN is missing"],
    ["a blank team domain", config("  ", AUD), "ACCESS_TEAM_DOMAIN is missing"],
    ["an unset team domain", config(undefined, AUD), "ACCESS_TEAM_DOMAIN is missing"],
    ["a team domain with a scheme", config(ISSUER, AUD), "not a bare"],
    ["a team domain with a path", config(`${TEAM}/x`, AUD), "not a bare"],
    ["a team domain in capitals", config(TEAM.toUpperCase(), AUD), "not a bare"],
    ["a single-label team domain", config("localhost", AUD), "not a bare"],
    ["an empty AUD", config(TEAM, ""), "ACCESS_AUD is missing"],
    ["a blank AUD", config(TEAM, " "), "ACCESS_AUD is missing"],
    ["an unset AUD", config(TEAM, undefined), "ACCESS_AUD is missing"],
  ])("refuses a genuine token under %s", async (_name, cfg, why) => {
    keyLookups = 0;
    const result = await verifyAccess(requestWith(await minted({})), cfg, countingKeys);
    expect(result).toEqual({ ok: false, why: expect.stringContaining(why) });
    expect(keyLookups).toBe(0);
  });
});

describe("verifyAccess fails closed when the keys cannot be had", () => {
  it.each<[string, JwksSource, string]>([
    ["the injected JWKS source rejects", rejectingKeys, "JWKS unreachable"],
    ["the injected JWKS source throws", throwingKeys, "broken source"],
  ])("refuses when %s", async (_name, source, why) => {
    const result = await verifyAccess(requestWith(await minted({})), CFG, source);
    expect(result).toEqual({ ok: false, why: expect.stringContaining(why) });
  });

  it.each<[string, FetchImplementation]>([
    ["the fetch throws", () => Promise.reject(new TypeError("network down"))],
    ["the certs URL answers 500", () => Promise.resolve(new Response("oops", { status: 500 }))],
    ["the certs URL redirects", () => Promise.resolve(Response.redirect(`${ISSUER}/login`, 302))],
    ["the body is not JSON", () => Promise.resolve(new Response("<html>"))],
    ["the body is not a key set", () => Promise.resolve(Response.json({ keys: "none" }))],
  ])("refuses when %s", async (_name, fetcher) => {
    const source = remoteJwks(TEAM, fetcher);
    const result = await verifyAccess(requestWith(await minted({})), CFG, source);
    expect(result).toEqual({ ok: false, why: expect.any(String) });
  });
});

describe("remoteJwks", () => {
  it("fetches the team's certs URL once and serves the next token from its cache", async () => {
    const requested: string[] = [];
    const source = remoteJwks(TEAM, (url) => {
      requested.push(url);
      return Promise.resolve(Response.json(jwks));
    });
    const first = await verifyAccess(requestWith(await minted({})), CFG, source);
    const second = await verifyAccess(requestWith(await mint(serviceClaims())), CFG, source);
    expect([first, second]).toEqual([
      { ok: true, subject: USER_EMAIL },
      { ok: true, subject: SERVICE_CLIENT_ID },
    ]);
    expect(requested).toEqual([`https://${TEAM}/cdn-cgi/access/certs`]);
    expect(accessCertsUrl(TEAM).href).toBe(requested[0]);
  });
});
