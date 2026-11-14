// The swimcoach Worker's router. The Lead owns it (mvp-staffing-plan.md, "Integration ownership").
// MVP-07 adds the report, stop and state routes.

import { type JwksSource, verifyAccess } from "./access.ts";

// contract/api.md section 1: every API answer carries Cache-Control: no-store.
const NO_STORE = { "Cache-Control": "no-store" };

function unauthenticated(): Response {
  return Response.json(
    {
      ok: false,
      error: "unauthenticated",
      message: "A valid Cloudflare Access token is required.",
    },
    { status: 401, headers: NO_STORE },
  );
}

/**
 * Answers one request. Every request, the page included, is checked against Cloudflare Access
 * first (contract/api.md section 2), and anything that fails gets 401 unauthenticated. `keys`
 * replaces the team's published signing keys, for tests.
 */
export async function handle(request: Request, env: Env, keys?: JwksSource): Promise<Response> {
  const access = await verifyAccess(request, env, keys);
  if (!access.ok) {
    return unauthenticated();
  }
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname === "/healthz") {
    return Response.json({ ok: true }, { headers: NO_STORE });
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
} satisfies ExportedHandler<Env>;

// biome-ignore lint/performance/noBarrelFile: workerd finds a Durable Object class only as an export of the main module.
export { Board } from "./board/board.ts";
