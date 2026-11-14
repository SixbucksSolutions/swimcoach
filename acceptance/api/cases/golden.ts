// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// Timed cases: every golden fixture in contract/fixtures/ replayed through Swimcoach-Test-Now and
// compared, key for key, with its expected metrics (contract/fixtures/README.md).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { Case, Fixture, Harness } from "../types.ts";
import {
  baseTime,
  expectConsistent,
  expectedSparkLength,
  expectSparkPoint,
  type MilestoneState,
  mustFind,
  needsMeSentence,
  sparkIndexes,
  stateOf,
} from "./helpers.ts";

const FIXTURE_DIR = new URL("../../../contract/fixtures/", import.meta.url);

/**
 * Case IDs are never renumbered, so each fixture's ID is written down here. A fixture added to
 * contract/fixtures/ without a line here stops the suite from loading: a golden fixture MUST NOT
 * go unreplayed.
 */
const FIXTURE_IDS: Record<string, string> = {
  afternoon: "API-100",
  allgreen: "API-101",
  keyboard: "API-102",
  silent: "API-103",
  morning: "API-104",
  stale: "API-105",
  offline: "API-106",
  alldone: "API-107",
  "one-story": "API-108",
  "zero-progress": "API-109",
  "over-cap": "API-110",
  "midnight-rollover": "API-111",
};
const MIDNIGHT_LOCAL_ID = "API-112";
const MIDNIGHT = "midnight-rollover";

const METRIC_KEYS = [
  "rtr",
  "trend_bin",
  "projection_hours",
  "chance_on_time",
  "call",
  "too_early",
  "work",
  "clock",
];
const MILESTONE_KEYS = ["finished", "total", "stalled", "mode", "color", "reason"];

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURE_DIR), "utf8")) as Fixture;
}

function fixtureNames(): string[] {
  const names = readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
  const unmapped = names.filter((name) => !(name in FIXTURE_IDS));
  const missing = Object.keys(FIXTURE_IDS).filter((name) => !names.includes(name));
  if (unmapped.length > 0 || missing.length > 0) {
    throw new Error(
      `acceptance/api/cases/golden.ts and contract/fixtures/ disagree: no case ID for [${unmapped.join(", ")}], no file for [${missing.join(", ")}]`,
    );
  }
  return names;
}

/** 22:40:00 UTC, two days back: the replay then crosses 00:00 UTC (fixtures/README.md). */
function midnightUtcStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 22, 40, 0) / 1000;
}

/** 22:40 in the suite machine's time zone, two days back: the replay then crosses local midnight. */
function midnightLocalStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 22, 40, 0).getTime() / 1000;
}

type Zone = "utc" | "local";

function dayOf(moment: Date, zone: Zone): number {
  if (zone === "utc") {
    return moment.getUTCDate();
  }
  return moment.getDate();
}

/** The replay MUST cross midnight in the named zone, or the case proves nothing about the cut. */
function expectCrossing(fixture: Fixture, startAt: number, zone: Zone): void {
  const span = (fixture.samples.at(-1)?.at_hours ?? 0) * 3600;
  const start = new Date(startAt * 1000);
  const end = new Date((startAt + span) * 1000);
  assert.notEqual(
    dayOf(start, zone),
    dayOf(end, zone),
    `the replay MUST cross midnight in the ${zone} zone`,
  );
}

/** The spark api.md 6.9 gives for the fixture's samples, sent at startAt + at_hours. */
function expectSpark(entry: MilestoneState, fixture: Fixture, startAt: number): void {
  const stored = fixture.samples
    .map((sample) => {
      const lanes = Object.values(sample.lanes);
      const total = lanes.reduce((sum, count) => sum + count, 0);
      const finished =
        laneCount(sample.lanes, "ready_for_review") + laneCount(sample.lanes, "completed");
      return {
        defined: total > 0 && sample.active_hours > 0,
        time: startAt + sample.at_hours * 3600,
        value: finished / total / (sample.active_hours / fixture.cap_hours),
      };
    })
    .filter((sample) => sample.defined);
  assert.equal(entry.spark.length, expectedSparkLength(stored.length), "spark length (api.md 6.9)");
  sparkIndexes(stored.length).forEach((index, position) => {
    const sample = stored[index];
    assert.ok(sample, "spark index is out of range");
    expectSparkPoint(entry.spark[position], sample.time, sample.value, `spark[${position}]`);
  });
}

function laneCount(lanes: Record<string, number>, key: string): number {
  const count = lanes[key];
  assert.ok(count !== undefined, `fixture lane ${key} is missing`);
  return count;
}

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

function expectTrend(
  h: Harness,
  actual: Record<string, number | null> | null,
  expected: Record<string, unknown> | null,
  label: string,
): void {
  assert.equal(actual === null, expected === null, `${label}: null or a trend`);
  if (actual === null || expected === null) {
    return;
  }
  assert.deepEqual(
    Object.keys(actual).toSorted(byName),
    Object.keys(expected).toSorted(byName),
    `${label}: keys`,
  );
  for (const key of Object.keys(expected)) {
    h.expectClose(actual[key], expected[key], `${label}.${key}`);
  }
}

/** Compares the state with the fixture's `expected`, key for key (contract/fixtures/README.md). */
function expectGolden(h: Harness, entry: MilestoneState, fixture: Fixture, label: string): void {
  const { expected } = fixture;
  const metrics = entry.metrics as unknown as Record<string, unknown>;
  for (const key of METRIC_KEYS) {
    h.expectClose(metrics[key], expected[key], `${label}.metrics.${key}`);
  }
  expectTrend(
    h,
    entry.metrics.trend,
    expected.trend as Record<string, unknown> | null,
    `${label}.metrics.trend`,
  );
  const top = entry as unknown as Record<string, unknown>;
  for (const key of MILESTONE_KEYS) {
    h.expectClose(top[key], expected[key], `${label}.${key}`);
  }
}

interface Replay {
  name: string;
  tag: string;
  startAt: number;
  zone?: Zone;
}

async function replayAndCheck(h: Harness, replay: Replay): Promise<void> {
  const { name, startAt } = replay;
  const fixture = loadFixture(name);
  const project = h.project();
  const milestone = `fx ${replay.tag}`;
  if (replay.zone) {
    expectCrossing(fixture, startAt, replay.zone);
  }
  assert.ok(
    startAt > baseTime(7),
    "the replay starts more than 7 days back: the prune could reach it",
  );
  try {
    const last = await h.replay(fixture, project, milestone, startAt);
    assert.ok(last <= Date.now() / 1000, "the replay ends in the future");
    const state = await stateOf(h, last);
    h.expectClose(state.now, last, "state.now (the test clock)");
    h.expectClose(state.last_report_at, last, "state.last_report_at");
    const entry = mustFind(state, project, milestone, name);
    assert.equal(entry.project, project, "project");
    assert.equal(entry.cap_hours, fixture.cap_hours, "cap_hours");
    h.expectClose(entry.first_report_at, startAt, `${name}: first_report_at`);
    h.expectClose(entry.updated_at, last, `${name}: updated_at`);
    expectGolden(h, entry, fixture, name);
    expectConsistent(entry, name);
    expectSpark(entry, fixture, startAt);
    assert.equal(
      entry.needs_me,
      needsMeSentence(entry.lanes.needs_terry),
      `${name}: needs_me (api.md 6.4)`,
    );
  } finally {
    await h.stop(project, milestone);
  }
}

function startFor(name: string): number {
  if (name === MIDNIGHT) {
    return midnightUtcStart();
  }
  return baseTime(2);
}

function zoneFor(name: string): Replay["zone"] {
  if (name === MIDNIGHT) {
    return "utc";
  }
  return undefined;
}

export function goldenCases(): Case[] {
  const cases: Case[] = fixtureNames().map((name) => ({
    id: FIXTURE_IDS[name] as string,
    title: `Golden fixture "${name}": the replay's state matches the fixture's expected metrics, mode, color and reason`,
    tier: "timed" as const,
    cites: `contract/fixtures/${name}.json; api.md 6.3, 6.5, 6.6, 6.9`,
    async run(h: Harness): Promise<void> {
      await replayAndCheck(h, { name, tag: name, startAt: startFor(name), zone: zoneFor(name) });
    },
  }));
  cases.push({
    id: MIDNIGHT_LOCAL_ID,
    title:
      'Golden fixture "midnight-rollover" again, starting 22:40 in the suite machine\'s time zone',
    tier: "timed",
    cites:
      "contract/fixtures/README.md: replay it a second time at 22:40 in the phone's time zone; api.md 6.9, no day boundary",
    async run(h) {
      await replayAndCheck(h, {
        name: MIDNIGHT,
        tag: "midnight local",
        startAt: midnightLocalStart(),
        zone: "local",
      });
    },
  });
  return cases;
}
