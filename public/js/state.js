// @ts-check
// The state body to the frozen View (docs/planning/t4-interfaces.md, MVP-08 C). The controller calls
// toView() once per successful poll of GET /api/2026-11-14/state; both renderers read only its result.
// The server computes every metric and verdict (contract/api.md section 6). This module renames them,
// applies the documented nulls, and words `why` and `callWhy` (words.js). It recomputes no verdict.
//
// toView() MUST throw on a body missing a field it reads (or holding the wrong type there), so a
// half-deployed or foreign body counts as a failed poll rather than painting a wrong board.

import { reasonPastAsk, wordsFor } from "./words.js";

/** @import { CardView, Dir, View } from "./view.js" */

/** @typedef {Record<string, unknown>} Obj */

const FEEDS = /** @type {const} */ (["no_data", "idle", "stale", "live"]);
const LEVELS = /** @type {const} */ (["green", "yellow", "red", "gray", "done"]);
const AGENTS = /** @type {const} */ (["codex", "claude"]);
const MODES = /** @type {const} */ (["ratio", "count_and_time"]);
const CALLS = /** @type {const} */ (["on_time", "running_late", "toss_up"]);

/** metrics.trend_bin to the clock-hand direction (concept.md section 3.2). */
/** @type {Readonly<Record<string, Dir>>} */
const DIRS = Object.freeze({ sharp_up: 2, up: 1, flat: 0, down: -1, sharp_down: -2 });

/**
 * Throws a TypeError naming the field, so a failed poll says what was wrong in the console.
 * @param {string} path
 * @param {string} want
 * @returns {never}
 */
function bad(path, want) {
  throw new TypeError(`state body: ${path} is missing or not ${want}`);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Obj}
 */
function obj(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return bad(path, "an object");
  }
  return /** @type {Obj} */ (value);
}

/**
 * @param {Obj} o
 * @param {string} key
 * @param {string} path
 * @returns {number}
 */
function num(o, key, path) {
  const value = o[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return bad(`${path}.${key}`, "a number");
  }
  return value;
}

/**
 * A number or null. A missing key is an error: null must be sent, not implied.
 * @param {Obj} o
 * @param {string} key
 * @param {string} path
 * @returns {number|null}
 */
function numOrNull(o, key, path) {
  if (o[key] === null) {
    return null;
  }
  return num(o, key, path);
}

/**
 * @param {Obj} o
 * @param {string} key
 * @param {string} path
 * @returns {string}
 */
function str(o, key, path) {
  const value = o[key];
  if (typeof value !== "string") {
    return bad(`${path}.${key}`, "a string");
  }
  return value;
}

/**
 * @param {Obj} o
 * @param {string} key
 * @param {string} path
 * @returns {boolean}
 */
function bool(o, key, path) {
  const value = o[key];
  if (typeof value !== "boolean") {
    return bad(`${path}.${key}`, "a boolean");
  }
  return value;
}

/**
 * @template {string} T
 * @param {Obj} o
 * @param {string} key
 * @param {readonly T[]} allowed
 * @param {string} path
 * @returns {T}
 */
function oneOf(o, key, allowed, path) {
  const value = o[key];
  const found = allowed.find((a) => a === value);
  if (found === undefined) {
    return bad(`${path}.${key}`, `one of ${allowed.join(", ")}`);
  }
  return found;
}

/**
 * @param {Obj} o
 * @param {string} key
 * @param {string} path
 * @returns {unknown[]}
 */
function arr(o, key, path) {
  const value = o[key];
  if (!Array.isArray(value)) {
    return bad(`${path}.${key}`, "an array");
  }
  return value;
}

/**
 * Lowercases A-Z only, as the server does for identity and ordering (api.md 4.3, 6.9).
 * @param {string} name
 * @returns {string}
 */
function asciiLower(name) {
  return name.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
}

/**
 * @param {Obj} m
 * @param {string} path
 * @returns {CardView["lanes"]}
 */
function lanesOf(m, path) {
  const lp = `${path}.lanes`;
  const o = obj(m.lanes, lp);
  return {
    ready_for_work: num(o, "ready_for_work", lp),
    in_progress: num(o, "in_progress", lp),
    needs_terry: num(o, "needs_terry", lp),
    ready_for_review: num(o, "ready_for_review", lp),
    completed: num(o, "completed", lp),
  };
}

/**
 * @param {Obj} m
 * @param {string} path
 * @returns {[number, number][]}
 */
function sparkOf(m, path) {
  return arr(m, "spark", path).map((point, i) => {
    const at = `${path}.spark[${i}]`;
    if (!Array.isArray(point) || point.length !== 2) {
      return bad(at, "a [time, rtr] pair");
    }
    const [t, v] = point;
    if (typeof t !== "number" || typeof v !== "number") {
      return bad(at, "a [time, rtr] pair of numbers");
    }
    return [t, v];
  });
}

/**
 * needs_me: a string or null; never missing.
 * @param {Obj} m
 * @param {string} path
 * @returns {string|null}
 */
function needsMeOf(m, path) {
  const value = m.needs_me;
  if (value === null || typeof value === "string") {
    return value;
  }
  return bad(`${path}.needs_me`, "a string or null");
}

/**
 * The words for state.reason (words.js), or a TypeError naming the field that left none.
 * @param {string} reason
 * @param {string|null} needsMe
 * @param {{silent: number, idle: number}} ages   now - updated_at, now - last_move_at
 * @param {string} path
 * @returns {string}
 */
function whyOf(reason, needsMe, ages, path) {
  const words = wordsFor(reason, needsMe, ages);
  if (words !== null) {
    return words;
  }
  if (reason === "needs_terry") {
    return bad(`${path}.needs_me`, "a string when reason is needs_terry");
  }
  return bad(`${path}.reason`, "a known reason");
}

/**
 * The words for the call without the ask (view.js, `callWhy`): `why` itself unless the reason is
 * needs_terry. Reads `stalled` and `metrics.call` on every card, so a body missing either throws
 * whatever the card's reason.
 * @param {{reason: string, why: string, needsMe: string|null, mode: CardView["mode"], stale: boolean, tooEarly: boolean, ages: {silent: number, idle: number}}} card
 * @param {Obj} m
 * @param {Obj} metrics
 * @param {string} path
 * @returns {string}
 */
function callWhyOf(card, m, metrics, path) {
  const stalled = bool(m, "stalled", path);
  /** @type {string|null} */
  let call = null;
  if (metrics.call !== null) {
    call = oneOf(metrics, "call", CALLS, `${path}.metrics`);
  }
  if (card.reason !== "needs_terry") {
    return card.why;
  }
  const next = reasonPastAsk({
    mode: card.mode,
    stale: card.stale,
    stalled,
    call,
    tooEarly: card.tooEarly,
    activeHours: num(m, "active_hours", path),
    capHours: num(m, "cap_hours", path),
  });
  return whyOf(next, card.needsMe, card.ages, path);
}

/**
 * The call's parts: trend, dir and chance share one rule (view.js), null when trend is null, when
 * done, or in count_and_time mode. The server's metrics ignore D1 (api.md 6.3), so the page applies
 * it here. Every field is still read, so a missing one throws whatever the mode.
 * @param {Obj} metrics
 * @param {boolean} callable   ratio mode and not done
 * @param {string} mp
 * @returns {Pick<CardView, "trend"|"dir"|"chance">}
 */
function callOf(metrics, callable, mp) {
  const chance = numOrNull(metrics, "chance_on_time", mp);
  const bin = metrics.trend_bin;
  if (bin !== null && (typeof bin !== "string" || !Object.hasOwn(DIRS, bin))) {
    bad(`${mp}.trend_bin`, "a known bin or null");
  }
  if (metrics.trend === null) {
    return { trend: null, dir: null, chance: null };
  }
  const tp = `${mp}.trend`;
  const t = obj(metrics.trend, tp);
  const trend = {
    delta: num(t, "delta", tp),
    minutes: num(t, "minutes", tp),
    proj: numOrNull(t, "proj", tp),
    recentDone: num(t, "recent_done", tp),
    toGo: num(t, "to_go", tp),
  };
  const dir = DIRS[String(bin)] ?? bad(`${mp}.trend_bin`, "a bin when trend is set");
  if (!callable) {
    return { trend: null, dir: null, chance: null };
  }
  return { trend, dir, chance };
}

/**
 * The counts and the clock: what Work against time, Swimlanes and the footer draw.
 * @param {Obj} m
 * @param {Obj} metrics
 * @param {string} path
 * @returns {Pick<CardView, "work"|"clock"|"finished"|"total"|"activeHours"|"capHours"|"lanes"|"spark"|"marginSeconds">}
 */
function countsOf(m, metrics, path) {
  const mp = `${path}.metrics`;
  const capHours = num(m, "cap_hours", path);
  const projection = numOrNull(metrics, "projection_hours", mp);
  /** @type {number|null} */
  let marginSeconds = null;
  if (projection !== null) {
    marginSeconds = (capHours - projection) * 3600;
  }
  return {
    work: numOrNull(metrics, "work", mp),
    clock: num(metrics, "clock", mp),
    finished: num(m, "finished", path),
    total: num(m, "total", path),
    activeHours: num(m, "active_hours", path),
    capHours,
    lanes: lanesOf(m, path),
    spark: sparkOf(m, path),
    marginSeconds,
  };
}

/**
 * One milestone to its card.
 * @param {unknown} raw
 * @param {number} now
 * @param {string} path
 * @returns {CardView}
 */
function cardOf(raw, now, path) {
  const m = obj(raw, path);
  const project = str(m, "project", path);
  const milestone = str(m, "milestone", path);
  const level = oneOf(m, "color", LEVELS, path);
  const mode = oneOf(m, "mode", MODES, path);
  const reason = str(m, "reason", path);
  const needsMe = needsMeOf(m, path);
  const updatedAt = num(m, "updated_at", path);
  const lastMoveAt = num(m, "last_move_at", path);
  const mp = `${path}.metrics`;
  const metrics = obj(m.metrics, mp);
  const tooEarly = bool(metrics, "too_early", mp);
  const rtr = numOrNull(metrics, "rtr", mp);
  const callable = mode === "ratio" && level !== "done";
  /** @type {number|null} */
  let shownRtr = null;
  if (mode === "ratio") {
    shownRtr = rtr;
  }
  const ages = { silent: now - updatedAt, idle: now - lastMoveAt };
  const why = whyOf(reason, needsMe, ages, path);
  const stale = bool(m, "stale", path);
  const card = { reason, why, needsMe, mode, stale, tooEarly, ages };
  const call = callOf(metrics, callable, mp);
  // A silent card is gray, "not enough FRESH data to signal green/yellow" (api.md 6.6, Terry
  // 2026-11-14), so it draws no clock-hand arrow either (UX-152). The trend and chance stay for the
  // display's tiles, which say how old they are through the stale flag.
  if (reason === "silent") {
    call.dir = null;
  }
  return {
    key: JSON.stringify([asciiLower(project), asciiLower(milestone)]),
    title: `${project} ${milestone}`,
    agent: oneOf(m, "agent", AGENTS, path),
    level,
    reason,
    why,
    callWhy: callWhyOf(card, m, metrics, path),
    needsMe,
    stale,
    silentSeconds: ages.silent,
    mode,
    tooEarly: callable && tooEarly,
    rtr: shownRtr,
    ...call,
    ...countsOf(m, metrics, path),
    updatedAt,
    lastMoveAt,
  };
}

/**
 * The 200 body of GET /api/2026-11-14/state to the frozen View. Throws on any field it reads that is
 * missing or of the wrong type.
 * @param {unknown} body
 * @returns {View}
 */
export function toView(body) {
  const d = obj(body, "body");
  const now = num(d, "now", "body");
  const t = obj(d.thresholds, "body.thresholds");
  const tp = "body.thresholds";
  const cards = arr(d, "milestones", "body").map((m, i) => cardOf(m, now, `body.milestones[${i}]`));
  return {
    now,
    lastReportAt: numOrNull(d, "last_report_at", "body"),
    feed: oneOf(d, "feed", FEEDS, "body"),
    thresholds: {
      staleMinutes: num(t, "stale_minutes", tp),
      stallMinutes: num(t, "stall_minutes", tp),
      minHistoryMinutes: num(t, "min_history_minutes", tp),
      minBlockUsed: num(t, "min_block_used", tp),
    },
    cards,
    asking: cards.filter((c) => c.needsMe !== null).length,
  };
}
