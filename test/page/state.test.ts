import { describe, expect, it } from "vitest";
import { toView } from "../../public/js/state.js";
import {
  changed,
  example,
  expectedCard,
  first,
  type Json,
  milestones,
  NAMES,
} from "./state-stand-ins.ts";

// toView() (public/js/state.js): the state body to the frozen View (t4-interfaces.md, MVP-08 C).
// Every contract/schemas/examples/state.*.json goes through it, and every field it reads, removed,
// MUST make it throw, so the controller counts that poll as failed. The fixtures and the expected
// CardView builder are in state-stand-ins.ts.

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

  it("draws no arrow on a gray silent card, though its trend stays for the display (UX-152)", () => {
    const silent = toView(example("stale")).cards.filter((c) => c.reason === "silent");
    expect(silent.length).toBeGreaterThan(0);
    for (const c of silent) {
      expect([c.level, c.dir]).toEqual(["gray", null]);
    }
    expect(silent.some((c) => c.trend !== null)).toBe(true);
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
