// stateBody against the contract's state.*.json examples (api.md section 6 and state.schema.json).
// The examples carry only a spark, not the samples behind it, so a whole state cannot be rebuilt
// from one. Each golden fixture holds the full series for one card; replaying it with the card's own
// timestamps rebuilds that card's samples, and everything the card shows is then compared.

import { describe, expect, it } from "vitest";
import afternoonFixture from "../../contract/fixtures/afternoon.json" with { type: "json" };
import alldoneFixture from "../../contract/fixtures/alldone.json" with { type: "json" };
import allgreenFixture from "../../contract/fixtures/allgreen.json" with { type: "json" };
import keyboardFixture from "../../contract/fixtures/keyboard.json" with { type: "json" };
import morningFixture from "../../contract/fixtures/morning.json" with { type: "json" };
import silentFixture from "../../contract/fixtures/silent.json" with { type: "json" };
import staleFixture from "../../contract/fixtures/stale.json" with { type: "json" };
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import alldone from "../../contract/schemas/examples/state.alldone.json" with { type: "json" };
import allgreen from "../../contract/schemas/examples/state.allgreen.json" with { type: "json" };
import empty from "../../contract/schemas/examples/state.empty.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import morning from "../../contract/schemas/examples/state.morning.json" with { type: "json" };
import silent from "../../contract/schemas/examples/state.silent.json" with { type: "json" };
import smallBlocks from "../../contract/schemas/examples/state.small-blocks.json" with {
  type: "json",
};
import stale from "../../contract/schemas/examples/state.stale.json" with { type: "json" };
import { milestoneKey } from "../../src/board/store.ts";
import type { Sample } from "../../src/contract.ts";
import { stateBody } from "../../src/routes/state.ts";
import { type Fixture, mismatches, replay } from "../metrics/replay.ts";
import {
  type Body,
  build,
  type Card,
  problemsOf,
  snapshotOf,
  sparkMismatches,
  storedFrom,
  verdictOf,
} from "./state-support.ts";

const EXAMPLES: readonly (readonly [string, unknown])[] = [
  ["afternoon", afternoon],
  ["alldone", alldone],
  ["allgreen", allgreen],
  ["empty", empty],
  ["keyboard", keyboard],
  ["morning", morning],
  ["silent", silent],
  ["small-blocks", smallBlocks],
  ["stale", stale],
];

/** [example, fixture, project, milestone]: the card of that example the fixture's series builds. */
const FIXTURE_CARDS: readonly (readonly [string, Fixture, string, string])[] = [
  ["afternoon", afternoonFixture as Fixture, "mobile-onboarding", "M12"],
  ["alldone", alldoneFixture as Fixture, "FGA", "T04"],
  ["allgreen", allgreenFixture as Fixture, "FGA", "T04"],
  ["keyboard", keyboardFixture as Fixture, "localswim V2", "T06"],
  ["morning", morningFixture as Fixture, "FGA", "T05"],
  ["silent", silentFixture as Fixture, "mobile-onboarding", "M12"],
  ["stale", staleFixture as Fixture, "docs-site", "T02"],
];

function exampleNamed(name: string): Body {
  const found = EXAMPLES.find(([n]) => n === name);
  if (found === undefined) {
    throw new Error(`No example named ${name}`);
  }
  return found[1] as Body;
}

/** Replays the fixture into the card's own timestamps and builds the state's card beside the example's. */
function reproduceCard(
  name: string,
  fixture: Fixture,
  project: string,
  milestone: string,
): { got: Card; want: Card; title: string } {
  const state = exampleNamed(name);
  const want = state.milestones.find((c) => c.project === project && c.milestone === milestone);
  if (want === undefined) {
    throw new Error(`state.${name}.json has no ${project} ${milestone}`);
  }
  const row = storedFrom(want);
  const replayed = replay(fixture, row.first_report_at);
  const snapshot = snapshotOf([row], { [milestoneKey(project, milestone)]: [...replayed.samples] });
  const [got] = build(snapshot, state.now).milestones;
  if (got === undefined) {
    throw new Error("The body has no card");
  }
  return { got, want, title: `${name} ${project} ${milestone}` };
}

describe("the contract's state examples", () => {
  for (const [name, example] of EXAMPLES) {
    it(`state.${name}.json validates against the schema`, () => {
      expect(problemsOf(example)).toEqual([]);
    });
  }

  it("rejects a body that breaks the schema, so the validator can fail", () => {
    const broken = { ...(afternoon as object), feed: "offline" };
    expect(problemsOf(broken)).not.toEqual([]);
  });
});

describe("stateBody reproduces the examples", () => {
  it("reproduces state.empty.json", () => {
    const want = exampleNamed("empty");
    expect(stateBody(snapshotOf([]), want.now)).toEqual(want);
  });

  for (const [name, fixture, project, milestone] of FIXTURE_CARDS) {
    it(`reproduces ${project} ${milestone} in state.${name}.json from its golden series`, () => {
      const { got, want, title } = reproduceCard(name, fixture, project, milestone);
      expect(mismatches(got.metrics, want.metrics, `${title}.metrics`)).toEqual([]);
      expect(sparkMismatches(got, want, title)).toEqual([]);
      expect(verdictOf(got)).toEqual(verdictOf(want));
    });
  }
});

// Every card of state.small-blocks.json is too early to call, so its samples only need to give the
// spark back: work / clock is the spark value at each stored time.
describe("stateBody reproduces state.small-blocks.json", () => {
  const want = exampleNamed("small-blocks");

  function samplesFromSpark(card: Card): Sample[] {
    return card.spark.map(
      ([at, rtr]): Sample => ({ at, work: rtr, clock: 1, finished: 0, total: 1 }),
    );
  }

  it("matches the top level and the order", () => {
    const samples: Record<string, Sample[]> = {};
    for (const card of want.milestones) {
      samples[milestoneKey(card.project, card.milestone)] = samplesFromSpark(card);
    }
    const body = build(snapshotOf(want.milestones.map(storedFrom), samples), want.now);
    expect(body).toMatchObject({ feed: want.feed, last_report_at: want.last_report_at });
    expect(body.milestones.map((c) => c.project)).toEqual(want.milestones.map((c) => c.project));
  });

  for (const expected of want.milestones) {
    it(`matches the card for ${expected.project} ${expected.milestone}`, () => {
      const samples = {
        [milestoneKey(expected.project, expected.milestone)]: samplesFromSpark(expected),
      };
      const body = build(snapshotOf([storedFrom(expected)], samples), want.now);
      const [got] = body.milestones;
      if (got === undefined) {
        throw new Error("The body has no card");
      }
      expect(verdictOf(got)).toEqual(verdictOf(expected));
      expect(mismatches(got.metrics, expected.metrics, expected.project)).toEqual([]);
      expect(sparkMismatches(got, expected, expected.project)).toEqual([]);
    });
  }
});
