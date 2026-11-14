// Shared set-up for the harness selftests: one stub, one harness wired to it, and sample bodies.
import { createHarness } from "../harness.ts";
import type { Stub } from "./stub.ts";
import { startStub } from "./stub.ts";

const ID = "selftest-id.access";
const SECRET = "selftest-secret-value-0123456789";
const LANES = {
  ready_for_work: 1,
  in_progress: 0,
  needs_terry: 0,
  ready_for_review: 0,
  completed: 0,
};
const SECONDS_PER_DAY = 86_400;
const MILLISECONDS_PER_SECOND = 1000;
const REPORT = "/api/2026-11-13/report";

/** Test times are built from the real clock: the harness refuses a time outside the last 7 days. */
const NOW = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
const RECENT = NOW - 3600;
const THREE_DAYS_AGO = NOW - 3 * SECONDS_PER_DAY;

function reportBody(project: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agent: "claude",
    project,
    milestone: "M1",
    active_hours: 1,
    cap_hours: 2,
    lanes: LANES,
    ...extra,
  };
}

interface Extras {
  /** Milestones already on the board, as [project, milestone] pairs. */
  readonly seeded?: readonly (readonly [string, string])[];
  /** A project whose stop requests answer 500. */
  readonly failStopFor?: string;
}

async function withStub(
  testClock: boolean,
  suite: "clock-free" | "full",
  body: (stub: Stub, h: ReturnType<typeof createHarness>) => Promise<void>,
  extras: Extras = {},
): Promise<void> {
  const stub = await startStub({ id: ID, secret: SECRET, testClock, ...extras });
  try {
    const h = createHarness({
      config: { url: stub.url, accessClientId: ID, accessClientSecret: SECRET },
      suite,
      runId: "abc123",
    });
    await body(stub, h);
  } finally {
    await stub.close();
  }
}

export {
  ID,
  LANES,
  NOW,
  RECENT,
  REPORT,
  reportBody,
  SECONDS_PER_DAY,
  SECRET,
  THREE_DAYS_AGO,
  withStub,
};
