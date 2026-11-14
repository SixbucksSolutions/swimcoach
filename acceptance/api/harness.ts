// The harness MVP-09's cases run against (the frozen Harness interface in types.ts). Black box:
// it speaks HTTP to the url in the config file through transport.ts and imports nothing from the
// MVP. On a clock-free run (production) guard.ts refuses anything that could touch Terry's board.
import assert from "node:assert/strict";
import { expectClose } from "./compare.ts";
import type { Config } from "./config.ts";
import { hasPrefix, PROJECT_PREFIX } from "./guard.ts";
import { isRecord } from "./json.ts";
import { expectSchema } from "./schema.ts";
import {
  createRequest,
  describeFailure,
  errorCode,
  REPORT_PATH,
  STATE_PATH,
  STOP_PATH,
} from "./transport.ts";
import type { Fixture, Harness, Reply } from "./types.ts";

const SECONDS_PER_HOUR = 3600;
const MILLISECONDS_PER_SECOND = 1000;
const NO_STORE = /no-store/u;
const RUN_ID_RADIX = 36;
const RUN_ID_LENGTH = 6;

/** The harness plus the two run-level steps that run.ts calls and cases never do. */
interface AcceptanceHarness extends Harness {
  /** The run's opening step. On `full`: probes the test clock, then stops every listed milestone. */
  reset: () => Promise<void>;
  /** The run's closing step: stops every listed milestone whose project starts with the prefix. */
  cleanup: () => Promise<void>;
}

interface HarnessOptions {
  readonly config: Config;
  readonly suite: "clock-free" | "full";
  /** Defaults to a short random lowercase token. */
  readonly runId?: string;
  readonly timeoutMs?: number;
}

interface Listed {
  readonly project: string;
  readonly milestone: string;
}

function newRunId(): string {
  return Math.floor(Math.random() * RUN_ID_RADIX ** RUN_ID_LENGTH)
    .toString(RUN_ID_RADIX)
    .padStart(RUN_ID_LENGTH, "0");
}

/** The (project, milestone) pairs a state body lists. */
function milestonesOf(body: unknown): Listed[] {
  const found: Listed[] = [];
  if (!(isRecord(body) && Array.isArray(body.milestones))) {
    return found;
  }
  for (const entry of body.milestones as unknown[]) {
    if (
      isRecord(entry) &&
      typeof entry.project === "string" &&
      typeof entry.milestone === "string"
    ) {
      found.push({ project: entry.project, milestone: entry.milestone });
    }
  }
  return found;
}

/** Sends each sample as one report, at startAt plus its offset, in order; returns the last time. */
async function replayFixture(
  report: Harness["report"],
  fixture: Fixture,
  names: Listed,
  startAt: number,
): Promise<number> {
  let last = startAt;
  for (const sample of fixture.samples) {
    last = startAt + sample.at_hours * SECONDS_PER_HOUR;
    // Sequential on purpose: each report MUST arrive after the one before it (api.md section 9).
    // biome-ignore lint/performance/noAwaitInLoops: the replay is ordered in time
    const reply = await report(
      {
        agent: "claude",
        project: names.project,
        milestone: names.milestone,
        active_hours: sample.active_hours,
        cap_hours: fixture.cap_hours,
        lanes: sample.lanes,
      },
      last,
    );
    assert.equal(
      reply.status,
      200,
      `Replay of ${fixture.name} at hour ${sample.at_hours}: ${describeFailure(reply)}`,
    );
    expectSchema("report.schema.json#/$defs/reportResponse", reply.body);
  }
  return last;
}

/** One stop; returns a failure sentence, or undefined when the milestone is gone. */
async function tryStop(api: Pick<Harness, "stop">, entry: Listed): Promise<string | undefined> {
  try {
    const reply = await api.stop(entry.project, entry.milestone);
    if (reply.status === 200 || errorCode(reply) === "not_tracked") {
      return undefined;
    }
    return `"${entry.project}" "${entry.milestone}": ${describeFailure(reply)}`;
  } catch (error) {
    // A transport error carries no header value (transport.ts), so its message is safe to report.
    return `"${entry.project}" "${entry.milestone}": ${String((error as Error).message)}`;
  }
}

/**
 * Stops, one at a time, every milestone the board lists whose project `wanted` accepts. It
 * attempts EVERY stop even when one fails, then reports all the failures together.
 */
async function stopMatching(
  api: Pick<Harness, "state" | "stop">,
  wanted: (project: string) => boolean,
): Promise<void> {
  const listed = milestonesOf(await api.state());
  const failures: string[] = [];
  for (const entry of listed) {
    if (wanted(entry.project)) {
      // biome-ignore lint/performance/noAwaitInLoops: one stop at a time keeps the log readable
      const failure = await tryStop(api, entry);
      if (failure !== undefined) {
        failures.push(failure);
      }
    }
  }
  assert.equal(failures.length, 0, `Stopping failed for: ${failures.join("; ")}`);
}

function createHarness(options: HarnessOptions): AcceptanceHarness {
  const { suite } = options;
  const runId = options.runId ?? newRunId();
  const projectName = `${PROJECT_PREFIX} ${runId}`;
  const request = createRequest(options);

  function report(body: unknown, at?: number): Promise<Reply> {
    return request("POST", REPORT_PATH, { body, at });
  }

  function stop(project: string, milestone: string, at?: number): Promise<Reply> {
    return request("POST", STOP_PATH, { body: { project, milestone }, at });
  }

  async function state(at?: number): Promise<unknown> {
    const reply = await request("GET", STATE_PATH, { at });
    assert.equal(reply.status, 200, `GET state answered ${describeFailure(reply)}`);
    assert.match(reply.headers.get("cache-control") ?? "", NO_STORE, "GET state is not no-store");
    expectSchema("state.schema.json", reply.body);
    return reply.body;
  }

  async function reset(): Promise<void> {
    if (suite === "clock-free") {
      throw new Error(
        "The opening reset MUST NOT run in the clock-free suite: it would touch production.",
      );
    }
    // The probe fails the run at once when the deployment has no test clock (api.md section 9).
    await state(Math.floor(Date.now() / MILLISECONDS_PER_SECOND));
    await stopMatching({ state, stop }, () => true);
  }

  return {
    suite,
    runId,
    request,
    report,
    stop,
    state,
    replay: (fixture, project, milestone, startAt) =>
      replayFixture(report, fixture, { project, milestone }, startAt),
    expectSchema,
    expectClose,
    project: () => projectName,
    reset,
    cleanup: () => stopMatching({ state, stop }, hasPrefix),
  };
}

export type { AcceptanceHarness, HarnessOptions };
export { createHarness };
