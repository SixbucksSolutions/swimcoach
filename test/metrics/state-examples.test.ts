// MVP-04 A against every card in the state examples of contract/schemas/examples/. They carry a
// "now" after the newest report, which the golden fixtures do not, so they prove `stale` and the
// "silent" row of api.md 6.6. They carry no samples, so the trend is not checked here.

import { describe, expect, it } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import alldone from "../../contract/schemas/examples/state.alldone.json" with { type: "json" };
import allgreen from "../../contract/schemas/examples/state.allgreen.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import morning from "../../contract/schemas/examples/state.morning.json" with { type: "json" };
import silent from "../../contract/schemas/examples/state.silent.json" with { type: "json" };
import smallBlocks from "../../contract/schemas/examples/state.small-blocks.json" with {
  type: "json",
};
import stale from "../../contract/schemas/examples/state.stale.json" with { type: "json" };
import type { Agent, Lanes, Metrics, StoredMilestone, Thresholds } from "../../src/contract.ts";
import { computeMetrics } from "../../src/metrics/core.ts";
import { cardVerdict } from "../../src/metrics/verdict.ts";
import { mismatches } from "./replay.ts";

interface Card {
  readonly project: string;
  readonly milestone: string;
  readonly agent: Agent;
  readonly active_hours: number;
  readonly cap_hours: number;
  readonly lanes: Lanes;
  readonly needs_me: string | null;
  readonly first_report_at: number;
  readonly updated_at: number;
  readonly last_move_at: number;
  readonly stale: boolean;
  readonly stalled: boolean;
  readonly mode: string;
  readonly color: string;
  readonly reason: string;
  readonly metrics: Metrics;
}

interface State {
  readonly now: number;
  readonly thresholds: Thresholds;
  readonly milestones: readonly Card[];
}

const STATES: readonly (readonly [string, State])[] = [
  ["afternoon", afternoon as State],
  ["alldone", alldone as State],
  ["allgreen", allgreen as State],
  ["keyboard", keyboard as State],
  ["morning", morning as State],
  ["silent", silent as State],
  ["small-blocks", smallBlocks as State],
  ["stale", stale as State],
];

const SERVER_SENTENCE = /^\d+ tickets? in Needs Terry$/u;

/** The report's own needs_me: null when the example's text is the server's sentence (api.md 6.4). */
function reportedNeedsMeOf(card: Card): string | null {
  if (card.needs_me !== null && card.lanes.needs_terry > 0 && SERVER_SENTENCE.test(card.needs_me)) {
    return null;
  }
  return card.needs_me;
}

function storedOf(card: Card): StoredMilestone {
  return {
    project: card.project,
    milestone: card.milestone,
    agent: card.agent,
    active_hours: card.active_hours,
    cap_hours: card.cap_hours,
    lanes: card.lanes,
    reported_needs_me: reportedNeedsMeOf(card),
    first_report_at: card.first_report_at,
    updated_at: card.updated_at,
    last_move_at: card.last_move_at,
  };
}

describe("state examples, contract/schemas/examples/", () => {
  it("hold at least one silent card, so the silent row is proven", () => {
    const reasons = STATES.flatMap(([, state]) => state.milestones.map((c) => c.reason));
    expect(reasons).toContain("silent");
  });

  for (const [name, state] of STATES) {
    for (const card of state.milestones) {
      const title = `${name}: ${card.project} ${card.milestone}`;

      it(`${title} gets the example's verdict`, () => {
        const m = storedOf(card);
        expect(cardVerdict(m, card.metrics, state.now, state.thresholds)).toEqual({
          needs_me: card.needs_me,
          stale: card.stale,
          stalled: card.stalled,
          mode: card.mode,
          color: card.color,
          reason: card.reason,
        });
      });

      it(`${title} gets the example's work, clock and RTR`, () => {
        const own = computeMetrics(storedOf(card), [], state.now, state.thresholds);
        const want = { work: card.metrics.work, clock: card.metrics.clock, rtr: card.metrics.rtr };
        expect(mismatches({ work: own.work, clock: own.clock, rtr: own.rtr }, want, title)).toEqual(
          [],
        );
      });
    }
  }
});
