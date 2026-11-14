// Turns a list of cases into node:test tests: one suite, sequential, with the run's opening reset
// (full only) before the first case and the closing cleanup after the last.
import { after, before, describe, it } from "node:test";
import type { AcceptanceHarness } from "./harness.ts";
import type { Case } from "./types.ts";

function isCase(value: unknown): value is Case {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { id, title, tier, cites, run } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    typeof title === "string" &&
    (tier === "clock-free" || tier === "timed") &&
    typeof cites === "string" &&
    typeof run === "function"
  );
}

/** Checks the shape of whatever a cases module exported; throws with the first bad entry's index. */
function checkCases(value: unknown): Case[] {
  if (!Array.isArray(value)) {
    throw new TypeError("The cases module MUST export `cases` as an array.");
  }
  const seen = new Set<string>();
  value.forEach((entry: unknown, index) => {
    if (!isCase(entry)) {
      throw new TypeError(`The cases entry at index ${index} does not match the Case format.`);
    }
    if (seen.has(entry.id)) {
      throw new TypeError(`The case id ${entry.id} appears twice.`);
    }
    seen.add(entry.id);
  });
  return value as Case[];
}

/** The cases a suite runs: `clock-free` keeps only the clock-free tier, `full` keeps every case. */
function selectCases(cases: readonly Case[], suite: "clock-free" | "full"): Case[] {
  return cases.filter((entry) => suite === "full" || entry.tier === "clock-free");
}

/** Registers the suite with node:test. Call it at the top level of a file run by node. */
function registerSuite(cases: readonly Case[], harness: AcceptanceHarness): void {
  describe(`swimcoach API acceptance (${harness.suite}, run ${harness.runId})`, () => {
    if (harness.suite === "full") {
      before(() => harness.reset());
    }
    after(() => harness.cleanup());
    for (const entry of selectCases(cases, harness.suite)) {
      it(`${entry.id} ${entry.title} [${entry.cites}]`, () => entry.run(harness));
    }
  });
}

export { checkCases, registerSuite, selectCases };
