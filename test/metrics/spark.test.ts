// biome-ignore-all lint/correctness/useImportExtensions: Biome asks for ".ts" on every relative import, and tsc refuses ".ts" on a value import (TS5097) because tsconfig.json does not set allowImportingTsExtensions. Extensionless is what moduleResolution "Bundler" expects. Reported to the Lead (MVP-04 A hand-off).

// MVP-04 A: the spark, contract/api.md 6.9.

import { describe, expect, it } from "vitest";
import type { Sample } from "../../src/contract";
import { sparkOf } from "../../src/metrics/verdict";

const START = 1_800_000_000;
const STEP_SECONDS = 600;
const MAX_POINTS = 159;

function samplesOf(n: number): Sample[] {
  return Array.from({ length: n }, (_, i) => ({
    at: START + i * STEP_SECONDS,
    work: 1 / 3,
    clock: 0.5,
    finished: 1,
    total: 3,
  }));
}

/** Every n from 1 to 1000 that breaks a spark rule; empty when none does. */
function brokenCounts(): number[] {
  return Array.from({ length: 1000 }, (_, i) => i + 1).filter((n) => {
    const spark = sparkOf(samplesOf(n));
    return (
      spark.length > MAX_POINTS ||
      spark[0]?.[0] !== START ||
      spark.at(-1)?.[0] !== START + (n - 1) * STEP_SECONDS
    );
  });
}

describe("spark, api.md 6.9", () => {
  it("is empty with no samples", () => {
    expect(sparkOf([])).toEqual([]);
  });

  it("holds the one sample there is", () => {
    expect(sparkOf(samplesOf(1))).toEqual([[START, 0.6667]]);
  });

  it("rounds the time to a second and the RTR to 4 places", () => {
    const s: Sample = { at: START + 0.4, work: 1 / 3, clock: 1, finished: 1, total: 3 };
    expect(sparkOf([s])).toEqual([[START, 0.3333]]);
  });

  it("keeps every sample up to 159", () => {
    expect(sparkOf(samplesOf(MAX_POINTS))).toHaveLength(MAX_POINTS);
  });

  it("thins 160 samples to every second one of the first 159, then the newest", () => {
    const times = sparkOf(samplesOf(160)).map(([at]) => at);
    const everySecond = Array.from({ length: 80 }, (_, i) => START + 2 * i * STEP_SECONDS);
    expect(times).toEqual([...everySecond, START + 159 * STEP_SECONDS]);
  });

  it("thins 240 samples to every third one of the first 239, then the newest", () => {
    expect(sparkOf(samplesOf(240))).toHaveLength(81);
  });

  it("never exceeds 159 points, and starts with the first sample and ends with the newest", () => {
    expect(brokenCounts()).toEqual([]);
  });
});
