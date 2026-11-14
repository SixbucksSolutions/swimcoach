// Cloudflare Access verification (MVP-05 A; contract/api.md section 2).
//
// Access, in front of the Worker, turns a login session or a service token into a signed
// Cf-Access-Jwt-Assertion header. verifyAccess() checks that header the way Cloudflare's own
// Worker example does ("Validate JWTs", developers.cloudflare.com/cloudflare-one/access-controls/
// applications/http-apps/authorization-cookie/validating-json/): jose's jwtVerify against the
// team's JWKS, with the issuer, the audience and the algorithm pinned.
//
// Every path that is not a fully verified token returns { ok: false }. Nothing here throws to the
// caller, so a misconfigured Worker, an unreachable JWKS or a library error all fail closed.

import {
  createRemoteJWKSet,
  customFetch,
  errors,
  type FetchImplementation,
  type FlattenedJWSInput,
  type JWSHeaderParameters,
  type JWTPayload,
  jwtVerify,
} from "jose";
import type { AccessConfig, AccessResult } from "./contract.ts";

/**
 * Access signs application tokens with RS256 (its published keys carry "alg": "RS256"). Pinning
 * the list refuses "none", HMAC tokens keyed with the public key, and any other algorithm.
 */
const ACCESS_ALGORITHMS = ["RS256"];

// A bare DNS host name in lowercase, such as "sixbuckssolutions.cloudflareaccess.com": at least two
// labels, no scheme, port, path or trailing dot. Anything else is a configuration error.
const HOST_NAME =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const MAX_HOST_NAME_LENGTH = 253;

/** The claims that can name the caller, in order of preference (see subjectOf). */
const SUBJECT_CLAIMS = ["email", "common_name", "sub"];

// One remote source per team domain for the life of the isolate, so jose's key cache survives
// across requests. It holds only public keys, never request data. jose itself avoids sharing an
// in-flight fetch between requests on Workers, which the runtime forbids.
const sharedSources = new Map<string, JwksSource>();

function sharedRemoteJwks(teamDomain: string): JwksSource {
  let source = sharedSources.get(teamDomain);
  if (source === undefined) {
    source = remoteJwks(teamDomain);
    sharedSources.set(teamDomain, source);
  }
  return source;
}

function deny(why: string): AccessResult {
  return { ok: false, why };
}

/** Why the configuration cannot be used, or null when it can. */
function configProblem(cfg: AccessConfig): string | null {
  // Typed as unknown: a Worker variable that was never set arrives as undefined at runtime.
  const team: unknown = cfg.ACCESS_TEAM_DOMAIN;
  const aud: unknown = cfg.ACCESS_AUD;
  if (typeof team !== "string" || team.trim() === "") {
    return "ACCESS_TEAM_DOMAIN is missing or empty";
  }
  if (team.length > MAX_HOST_NAME_LENGTH || !HOST_NAME.test(team)) {
    return "ACCESS_TEAM_DOMAIN is not a bare lowercase host name";
  }
  if (typeof aud !== "string" || aud.trim() === "") {
    return "ACCESS_AUD is missing or empty";
  }
  return null;
}

/**
 * Who the token speaks for: the user's email for a login session, or the service token's client
 * ID (common_name) for a service token, whose sub is an empty string.
 */
function subjectOf(payload: JWTPayload): string | null {
  for (const claim of SUBJECT_CLAIMS) {
    const value = payload[claim];
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return null;
}

/**
 * The log text for a thrown error. It MUST NOT throw itself: an exception here would escape
 * verifyAccess and fail open into the caller's error handling. (An early draft imported a name
 * jose does not export, and the instanceof check in the catch block threw.)
 */
function describeFailure(error: unknown): string {
  try {
    if (error instanceof errors.JOSEError) {
      return `token rejected: ${error.code}: ${error.message}`;
    }
    if (error instanceof Error) {
      return `verification failed: ${error.message}`;
    }
    return "verification failed: a non-Error value was thrown";
  } catch {
    return "verification failed: the error could not be described";
  }
}

/**
 * Resolves the public key that verifies one token, from its protected header. jose's
 * createRemoteJWKSet and createLocalJWKSet both satisfy it, so tests inject generated keys.
 */
export type JwksSource = (
  protectedHeader: JWSHeaderParameters,
  token: FlattenedJWSInput,
) => Promise<CryptoKey>;

/** The header Access adds to every request it admits. */
export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

/** The team's signing keys: https://<team domain>/cdn-cgi/access/certs. */
export function accessCertsUrl(teamDomain: string): URL {
  return new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
}

/**
 * A JWKS source that fetches the team's keys. jose caches the key set in memory for 10 minutes
 * (cacheMaxAge) and refetches early, at most every 30 seconds (cooldownDuration), when a token
 * names a key id it has not seen, which covers Access's key rotation (every 6 weeks by default,
 * with the previous key valid for 7 more days). A fetch times out after 5 seconds, and anything
 * but HTTP 200 with a JSON key set is an error. `fetcher` replaces global fetch, for tests.
 */
export function remoteJwks(teamDomain: string, fetcher?: FetchImplementation): JwksSource {
  const url = accessCertsUrl(teamDomain);
  if (fetcher === undefined) {
    return createRemoteJWKSet(url);
  }
  return createRemoteJWKSet(url, { [customFetch]: fetcher });
}

/**
 * Verifies the request's Cf-Access-Jwt-Assertion header: the signature against the team's JWKS,
 * the algorithm (RS256 only), `aud` containing ACCESS_AUD, `iss` equal to
 * https://<ACCESS_TEAM_DOMAIN>, `exp` present and in the future, and `nbf` when present.
 * `keys` replaces the team's published JWKS, for tests.
 *
 * `why` is for logs. It names the failed check and never carries the token; the response to the
 * caller is the contract's plain 401 unauthenticated.
 */
export async function verifyAccess(
  request: Request,
  cfg: AccessConfig,
  keys?: JwksSource,
): Promise<AccessResult> {
  try {
    const problem = configProblem(cfg);
    if (problem !== null) {
      return deny(problem);
    }
    const token = request.headers.get(ACCESS_JWT_HEADER)?.trim() ?? "";
    if (token === "") {
      return deny(`${ACCESS_JWT_HEADER} header is missing or empty`);
    }
    const { payload } = await jwtVerify(token, keys ?? sharedRemoteJwks(cfg.ACCESS_TEAM_DOMAIN), {
      algorithms: ACCESS_ALGORITHMS,
      audience: cfg.ACCESS_AUD,
      issuer: `https://${cfg.ACCESS_TEAM_DOMAIN}`,
      requiredClaims: ["exp"],
    });
    const subject = subjectOf(payload);
    if (subject === null) {
      return deny("token names no email, common_name or sub");
    }
    return { ok: true, subject };
  } catch (error) {
    return deny(describeFailure(error));
  }
}
