// POST /api/2026-11-14/stop (MVP-07 B). Source of truth: contract/api.md sections 5 and 8.

import type { EpochSeconds } from "../contract.ts";
import { boardStub, errorResponse, jsonResponse, readJsonBody } from "../http.ts";
import { validateStop } from "../ingest/validate.ts";

/**
 * Stops tracking one milestone. `now` is unused today (a stop has no time rule) and stays in the
 * signature so every write route has the same shape, as the T3 interface freeze requires.
 */
export async function handleStop(
  request: Request,
  env: Env,
  _now: EpochSeconds,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const validated = validateStop(body.body);
  if (!validated.ok) {
    return errorResponse(
      400,
      "invalid_stop",
      "The stop request breaks the schema; nothing was changed.",
      validated.problems,
    );
  }
  const deleted = await boardStub(env).stop(validated.request);
  if (deleted === null) {
    return errorResponse(404, "not_tracked", "That milestone is not tracked; nothing was changed.");
  }
  return jsonResponse({ ok: true, project: deleted.project, milestone: deleted.milestone });
}
