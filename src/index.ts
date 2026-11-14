// The swimcoach Worker's router. The Lead owns it (mvp-staffing-plan.md, "Integration ownership").
// Source of truth: contract/api.md sections 1 to 3, 8 and 9.

import { type JwksSource, verifyAccess } from "./access.ts";
import { API_VERSION, type EpochSeconds } from "./contract.ts";
import { errorResponse, jsonResponse, requestTime } from "./http.ts";
import { handleReport } from "./routes/report.ts";
import { handleState } from "./routes/state.ts";
import { handleStop } from "./routes/stop.ts";

const API_PREFIX = `/api/${API_VERSION}`;

type Handler = (request: Request, env: Env, now: EpochSeconds) => Promise<Response>;

interface Route {
  readonly method: "GET" | "POST";
  readonly run: Handler;
}

// Exact paths only (api.md section 1): no trailing-slash variants, no /index.html alias, and the
// unversioned /api/... paths are not aliases of the dated ones. Each path has exactly one method.
const ROUTES: ReadonlyMap<string, Route> = new Map<string, Route>([
  ["/healthz", { method: "GET", run: () => Promise.resolve(jsonResponse({ ok: true })) }],
  [`${API_PREFIX}/report`, { method: "POST", run: handleReport }],
  [`${API_PREFIX}/stop`, { method: "POST", run: handleStop }],
  [`${API_PREFIX}/state`, { method: "GET", run: (_request, env, now) => handleState(env, now) }],
  ["/", { method: "GET", run: (request, env) => env.ASSETS.fetch(request) }],
]);

async function route(request: Request, env: Env, keys?: JwksSource): Promise<Response> {
  const access = await verifyAccess(request, env, keys);
  if (!access.ok) {
    // biome-ignore lint/suspicious/noConsole: Workers Logs is the only record of which Access check failed; the 401 body deliberately does not say.
    console.warn(`swimcoach: 401 unauthenticated: ${access.why}`);
    return errorResponse(401, "unauthenticated", "A valid Cloudflare Access token is required.");
  }
  // Query strings are ignored (api.md section 1): only the path picks the route.
  const { pathname } = new URL(request.url);
  const found = ROUTES.get(pathname);
  if (found === undefined) {
    return errorResponse(404, "not_found", "There is no such path.");
  }
  if (request.method !== found.method) {
    return jsonResponse(
      {
        ok: false,
        error: "method_not_allowed",
        message: `This path accepts only ${found.method}.`,
      },
      405,
      [["Allow", found.method]],
    );
  }
  const time = requestTime(request, env);
  if (!time.ok) {
    return time.response;
  }
  return found.run(request, env, time.now);
}

/**
 * Answers one request. Every request, the page included, is checked against Cloudflare Access
 * first (contract/api.md section 2), and anything that fails gets 401 unauthenticated. Then the
 * exact path picks a route (404 not_found, 405 method_not_allowed), then the request time is read
 * (section 9), then the route runs. Anything thrown gets 500 internal. `keys` replaces the team's
 * published signing keys, for tests.
 */
export async function handle(request: Request, env: Env, keys?: JwksSource): Promise<Response> {
  try {
    return await route(request, env, keys);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: an unexpected failure MUST reach Workers Logs; the 500 body carries no detail.
    console.error("swimcoach: 500 internal:", error);
    return errorResponse(500, "internal", "The Worker failed unexpectedly.");
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;

// biome-ignore lint/performance/noBarrelFile: workerd finds a Durable Object class only as an export of the main module.
export { Board } from "./board/board.ts";
