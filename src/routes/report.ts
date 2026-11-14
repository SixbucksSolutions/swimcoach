// POST /api/2026-11-13/report (MVP-07 B). Source of truth: contract/api.md sections 4 and 8.

import type { EpochSeconds } from "../contract.ts";
import { boardStub, errorResponse, jsonResponse, readJsonBody } from "../http.ts";
import { validateReport } from "../ingest/validate.ts";

/**
 * Reads, validates and stores one report. The order of refusals is api.md 4.2: Content-Type, size,
 * JSON parse (all in readJsonBody), then the schema. `now` is the request time from requestTime().
 */
export async function handleReport(
  request: Request,
  env: Env,
  now: EpochSeconds,
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const validated = validateReport(body.body);
  if (!validated.ok) {
    return errorResponse(
      400,
      "invalid_report",
      "The report breaks the schema; nothing was stored.",
      validated.problems,
    );
  }
  const result = await boardStub(env).report(validated.report, now);
  if (!result.ok) {
    return errorResponse(
      409,
      "clock_went_backward",
      "The report's time is earlier than the milestone's last update; nothing was stored.",
    );
  }
  const { plan } = result;
  return jsonResponse({
    ok: true,
    project: plan.milestone.project,
    milestone: plan.milestone.milestone,
    received_at: plan.receivedAt,
    added: plan.added,
    sample: plan.sampleOutcome,
  });
}
