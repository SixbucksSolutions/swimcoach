import { dur } from "../../public/js/format.js";
import type { CardView } from "../../public/js/view.js";

// The fixtures and expected-value builders for state.test.ts (toView in public/js/state.js): every
// contract/schemas/examples/state.*.json, and the CardView each raw milestone MUST become, worked out
// here from the frozen typedef in view.js rather than by calling state.js. No tests live here.

declare global {
  interface ImportMeta {
    glob: <T>(pattern: string, options: { eager: true; import: "default" }) => Record<string, T>;
  }
}

type Json = Record<string, unknown>;

const EXAMPLE_NAME = /state\.(?<name>[a-z-]+)\.json$/u;
const EXAMPLES = import.meta.glob<Json>("../../contract/schemas/examples/state.*.json", {
  eager: true,
  import: "default",
});

/** Every state example's name, such as "keyboard". */
const NAMES = Object.keys(EXAMPLES).map((path) => EXAMPLE_NAME.exec(path)?.groups?.name ?? "");

const DIRS: Record<string, CardView["dir"]> = {
  sharp_up: 2,
  up: 1,
  flat: 0,
  down: -1,
  sharp_down: -2,
};
const WORDS: Record<string, string> = {
  done: "Done",
  running_late: "Running late",
  toss_up: "Toss-up",
  too_early: "Too early to call",
  on_time: "On time",
  over_budget: "Over budget",
  under_budget: "Under budget",
};

/** A deep copy of one example, so a test can change it freely. */
function example(name: string): Json {
  const body = EXAMPLES[`../../contract/schemas/examples/state.${name}.json`];
  if (body === undefined) {
    throw new Error(`no example ${name}`);
  }
  return structuredClone(body);
}

function milestones(body: Json): Json[] {
  return body.milestones as Json[];
}

function first(body: Json): Json {
  const [m] = milestones(body);
  if (m === undefined) {
    throw new Error("the example has no milestone");
  }
  return m;
}

/** The allgreen example with its first card changed. */
function changed(patch: Json, metrics: Json = {}): Json {
  const body = example("allgreen");
  const m = first(body);
  Object.assign(m, patch);
  Object.assign(m.metrics as Json, metrics);
  return body;
}

/** The words for a reason, worked out from the raw milestone the way view.js states them. */
function expectedWhy(m: Json, now: number): string {
  if (m.reason === "needs_terry") {
    return m.needs_me as string;
  }
  if (m.reason === "silent") {
    return `Agent silent for ${dur(now - (m.updated_at as number))}`;
  }
  if (m.reason === "stalled") {
    return `No ticket moved in ${dur(now - (m.last_move_at as number))}`;
  }
  return WORDS[m.reason as string] ?? "?";
}

/**
 * callWhy as view.js states it: why, except on a needs_terry card, where it is the words for the
 * first api.md 6.6 row after needs_terry that the raw fields match.
 */
function expectedCallWhy(m: Json, now: number): string {
  if (m.reason !== "needs_terry") {
    return expectedWhy(m, now);
  }
  const metrics = m.metrics as Json;
  const rows: [boolean, string][] = [
    [m.stale === true, "silent"],
    [
      m.mode === "count_and_time" && (m.active_hours as number) > (m.cap_hours as number),
      "over_budget",
    ],
    [m.mode === "count_and_time", "under_budget"],
    [metrics.call === "running_late", "running_late"],
    [m.stalled === true, "stalled"],
    [metrics.call === "toss_up", "toss_up"],
    [metrics.too_early === true, "too_early"],
  ];
  const reason = rows.find(([match]) => match)?.[1] ?? "on_time";
  return expectedWhy({ ...m, reason }, now);
}

/**
 * The call's parts as view.js states them: null when trend is null, done, or count_and_time; and no
 * dir on a silent card (UX-152), whose trend and chance stay.
 */
function expectedCall(m: Json): Pick<CardView, "trend" | "dir" | "chance"> {
  const metrics = m.metrics as Json;
  const t = metrics.trend as Json | null;
  if (m.mode !== "ratio" || m.color === "done" || t === null) {
    return { trend: null, dir: null, chance: null };
  }
  const trend = {
    delta: t.delta as number,
    minutes: t.minutes as number,
    proj: t.proj as number | null,
    recentDone: t.recent_done as number,
    toGo: t.to_go as number,
  };
  let dir = DIRS[metrics.trend_bin as string] ?? null;
  if (m.reason === "silent") {
    dir = null;
  }
  return { trend, dir, chance: metrics.chance_on_time as number };
}

/** The CardView for one raw milestone, field by field from the frozen typedef. */
function expectedCard(m: Json, now: number): CardView {
  const metrics = m.metrics as Json;
  const ratio = m.mode === "ratio";
  const projection = metrics.projection_hours as number | null;
  let marginSeconds: number | null = null;
  if (projection !== null) {
    marginSeconds = ((m.cap_hours as number) - projection) * 3600;
  }
  let rtr: number | null = null;
  if (ratio) {
    rtr = metrics.rtr as number | null;
  }
  return {
    key: JSON.stringify([
      (m.project as string).toLowerCase(),
      (m.milestone as string).toLowerCase(),
    ]),
    title: `${m.project} ${m.milestone}`,
    agent: m.agent as CardView["agent"],
    level: m.color as CardView["level"],
    reason: m.reason as string,
    why: expectedWhy(m, now),
    callWhy: expectedCallWhy(m, now),
    needsMe: m.needs_me as string | null,
    stale: m.stale as boolean,
    silentSeconds: now - (m.updated_at as number),
    mode: m.mode as CardView["mode"],
    tooEarly: ratio && m.color !== "done" && metrics.too_early === true,
    rtr,
    ...expectedCall(m),
    marginSeconds,
    work: metrics.work as number | null,
    clock: metrics.clock as number,
    finished: m.finished as number,
    total: m.total as number,
    activeHours: m.active_hours as number,
    capHours: m.cap_hours as number,
    lanes: m.lanes as CardView["lanes"],
    spark: m.spark as CardView["spark"],
    updatedAt: m.updated_at as number,
    lastMoveAt: m.last_move_at as number,
  };
}

export type { Json };
export { changed, example, expectedCard, first, milestones, NAMES };
