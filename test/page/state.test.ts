// biome-ignore-all lint/style/noExcessiveLinesPerFile: one file for toView (t4-interfaces.md, MVP-08 C); the expected CardView mirrors the frozen typedef one property per line, and callWhy (visual review MVP-08, item 2) took it past 300.
import { describe, expect, it } from "vitest";
import { dur } from "../../public/js/format.js";
import { toView } from "../../public/js/state.js";
import type { CardView } from "../../public/js/view.js";

// toView() (public/js/state.js): the state body to the frozen View (t4-interfaces.md, MVP-08 C).
// Every contract/schemas/examples/state.*.json goes through it, and every field it reads, removed,
// MUST make it throw, so the controller counts that poll as failed.

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

/** The call's parts as view.js states them: null when trend is null, done, or count_and_time. */
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
  return {
    trend,
    dir: DIRS[metrics.trend_bin as string] ?? null,
    chance: metrics.chance_on_time as number,
  };
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

describe("toView over every state example", () => {
  it("finds the examples", () => {
    expect(NAMES).toEqual(
      expect.arrayContaining(["afternoon", "empty", "keyboard", "small-blocks", "stale"]),
    );
    expect(NAMES).not.toContain("");
  });

  it.each(NAMES)("state.%s.json: top level, in the server's order", (name) => {
    const body = example(name);
    const view = toView(body);
    const t = body.thresholds as Json;
    expect(view.now).toBe(body.now);
    expect(view.lastReportAt).toBe(body.last_report_at);
    expect(view.feed).toBe(body.feed);
    expect(view.thresholds).toEqual({
      staleMinutes: t.stale_minutes,
      stallMinutes: t.stall_minutes,
      minHistoryMinutes: t.min_history_minutes,
      minBlockUsed: t.min_block_used,
    });
    expect(view.asking).toBe(milestones(body).filter((m) => m.needs_me !== null).length);
    expect(new Set(view.cards.map((c) => c.key)).size).toBe(view.cards.length);
  });

  it.each(NAMES)("state.%s.json: every card, field by field", (name) => {
    const body = example(name);
    // toStrictEqual also proves no field is missing or extra, and the order is the server's.
    expect(toView(body).cards).toStrictEqual(
      milestones(body).map((m) => expectedCard(m, body.now as number)),
    );
  });
});

describe("toView: the documented nulls and words", () => {
  it("drops the call on a done card even when the server sent a trend", () => {
    const done = toView(example("stale")).cards.find((c) => c.level === "done");
    expect([done?.title, done?.why, done?.dir, done?.trend, done?.chance]).toEqual([
      "localswim V2 T06",
      "Done",
      null,
      null,
      null,
    ]);
  });

  it("words a silent agent by its own age, and a red card by its ask", () => {
    const silent = toView(example("stale")).cards.filter((c) => c.reason === "silent");
    expect(new Set(silent.map((c) => c.why))).toEqual(new Set(["Agent silent for 35m"]));
    const red = toView(example("keyboard")).cards.filter((c) => c.level === "red");
    expect(red.map((c) => c.why)).toEqual([
      "1 ticket in Needs Terry",
      "Pick an index strategy: per-tenant or shared",
    ]);
  });

  it("uses Terry's budget words and no RTR in count_and_time mode (UX-131, UX-133)", () => {
    const view = toView(example("small-blocks"));
    expect(view.cards.map((c) => [c.mode, c.why, c.rtr, c.dir, c.tooEarly])).toEqual([
      ["count_and_time", "Under budget", null, null, false],
      ["count_and_time", "Over budget", null, null, false],
    ]);
  });

  it("words a stalled card by the time since the last move", () => {
    const body = example("allgreen");
    const moved = (body.now as number) - 52 * 60;
    Object.assign(first(body), { color: "yellow", reason: "stalled", last_move_at: moved });
    expect(toView(body).cards[0]?.why).toBe("No ticket moved in 52m");
  });

  it("lowercases only A-Z in the key, as the server does", () => {
    const body = example("allgreen");
    Object.assign(first(body), { project: "ÉCOLE Board", milestone: "T04" });
    const [card] = toView(body).cards;
    expect([card?.key, card?.title]).toEqual([
      JSON.stringify(["École board", "t04"]),
      "ÉCOLE Board T04",
    ]);
  });
});

describe("toView: callWhy, the call a red display's hero shows (visual review MVP-08, item 2)", () => {
  it("words the keyboard example's red cards as the mock's heroes did", () => {
    const red = toView(example("keyboard")).cards.filter((c) => c.level === "red");
    expect(red.map((c) => [c.title, c.callWhy])).toEqual([
      ["localswim V2 T06", "On time"],
      ["search-index T03", "Running late"],
    ]);
    const afternoon = toView(example("afternoon")).cards.find((c) => c.level === "red");
    expect([afternoon?.title, afternoon?.callWhy]).toEqual(["search-index T03", "Running late"]);
  });

  it("gives callWhy the same words as why on every other card", () => {
    for (const name of NAMES) {
      for (const c of toView(example(name)).cards.filter((x) => x.reason !== "needs_terry")) {
        expect(c.callWhy).toBe(c.why);
      }
    }
  });

  it("takes the server's call as sent, never recomputed from chance", () => {
    const body = changed(
      { color: "red", reason: "needs_terry", needs_me: "Pick one", stalled: true },
      { call: "toss_up", chance_on_time: 0.99 },
    );
    expect(toView(body).cards[0]?.callWhy.startsWith("No ticket moved in ")).toBe(true);
    Object.assign(first(body), { stalled: false });
    expect(toView(body).cards[0]?.callWhy).toBe("Toss-up");
  });
});

// Every field toView() reads. One it does not read (first_report_at, trend_minutes,
// min_stories_for_rtr, trend.pace, trend.finish) is not listed. "m" is the first card.
const READ = [
  "now last_report_at feed thresholds milestones",
  "thresholds.stale_minutes thresholds.stall_minutes thresholds.min_history_minutes",
  "thresholds.min_block_used m.project m.milestone m.agent m.active_hours m.cap_hours m.lanes",
  "m.needs_me m.updated_at m.last_move_at m.finished m.total m.stale m.stalled m.mode m.color",
  "m.reason m.metrics m.spark metrics.work metrics.clock metrics.rtr metrics.too_early",
  "metrics.call metrics.trend",
  "metrics.trend_bin metrics.projection_hours metrics.chance_on_time trend.delta trend.minutes",
  "trend.proj trend.recent_done trend.to_go lanes.ready_for_work lanes.in_progress",
  "lanes.needs_terry lanes.ready_for_review lanes.completed",
].flatMap((line) => line.split(" "));

/** The object a READ path's field sits in. */
function holder(body: Json, where: string): Json {
  const m = first(body);
  const metrics = m.metrics as Json;
  const holders: Record<string, Json> = {
    thresholds: body.thresholds as Json,
    m,
    metrics,
    trend: metrics.trend as Json,
    lanes: m.lanes as Json,
  };
  return holders[where] ?? body;
}

describe("toView refuses a body missing a field it reads", () => {
  it("accepts the untouched body the cases below start from (green, ratio, with a trend)", () => {
    expect(() => toView(example("allgreen"))).not.toThrow();
    expect((first(example("allgreen")).metrics as Json).trend).not.toBeNull();
  });

  it.each(READ)("%s", (path) => {
    const body = example("allgreen");
    const parts = path.split(".");
    const key = parts.pop() ?? "";
    delete holder(body, parts[0] ?? "")[key];
    expect(() => toView(body)).toThrow(TypeError);
  });
});

/** The allgreen example with its first card changed. */
function changed(patch: Json, metrics: Json = {}): Json {
  const body = example("allgreen");
  const m = first(body);
  Object.assign(m, patch);
  Object.assign(m.metrics as Json, metrics);
  return body;
}

describe("toView refuses a body with a wrong value", () => {
  it.each([
    ["a null body", null],
    ["an array", []],
    ["a string", "<html>"],
    ["an unknown feed", { ...example("allgreen"), feed: "offline" }],
    ["an unknown color", changed({ color: "blue" })],
    ["an unknown reason", changed({ reason: "blocked" })],
    ["an unknown agent", changed({ agent: "gemini" })],
    ["an unknown mode", changed({ mode: "fancy" })],
    ["a numeric string", changed({ total: "6" })],
    [
      "needs_terry without an ask",
      changed({ color: "red", reason: "needs_terry", needs_me: null }),
    ],
    ["a numeric needs_me", changed({ needs_me: 3 })],
    ["an unknown trend bin", changed({}, { trend_bin: "sideways" })],
    ["a trend without a bin", changed({}, { trend_bin: null })],
    ["a short spark point", changed({ spark: [[1, 0.5], [2]] })],
    ["a spark point of strings", changed({ spark: [["1", "0.5"]] })],
    ["a non-finite number", changed({ cap_hours: Number.POSITIVE_INFINITY })],
  ])("%s", (_label, body) => {
    expect(() => toView(body)).toThrow(TypeError);
  });
});
