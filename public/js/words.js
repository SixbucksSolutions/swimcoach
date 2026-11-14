// @ts-check
// The words a card shows for a reason (view.js: `why` and `callWhy`; contract/api.md 6.6). Pure: no
// DOM, no timers. state.js calls these while it builds the View, and owns the errors for a body that
// cannot be worded.

import { dur } from "./format.js";

/** @import { CardView } from "./view.js" */

/**
 * The fixed words for each state.reason that carries no number (api.md 6.6; Terry, 2026-11-13, for
 * the budget pair, UX-133). needs_terry, silent and stalled are built in wordsFor().
 * @type {Readonly<Record<string, string>>}
 */
const WORDS = Object.freeze({
  done: "Done",
  running_late: "Running late",
  toss_up: "Toss-up",
  too_early: "Too early to call",
  on_time: "On time",
  over_budget: "Over budget",
  under_budget: "Under budget",
});

/**
 * The words for a reason, aged to the body's now (frozen in view.js). null for an unknown reason, or
 * for needs_terry without an ask.
 * @param {string} reason
 * @param {string|null} needsMe
 * @param {{silent: number, idle: number}} ages   now - updated_at, now - last_move_at
 * @returns {string|null}
 */
export function wordsFor(reason, needsMe, ages) {
  if (reason === "needs_terry") {
    return needsMe;
  }
  if (reason === "silent") {
    return `Agent silent for ${dur(ages.silent)}`;
  }
  if (reason === "stalled") {
    return `No ticket moved in ${dur(ages.idle)}`;
  }
  return WORDS[reason] ?? null;
}

/**
 * The reason a needs_terry card would carry without its ask: the first api.md 6.6 row after
 * needs_terry that the state's own fields match (view.js, `callWhy`). It takes the server's
 * metrics.call as sent and recomputes nothing from chance (api.md 6).
 * @param {{mode: CardView["mode"], stale: boolean, stalled: boolean, call: string|null, tooEarly: boolean, activeHours: number, capHours: number}} f
 * @returns {string}
 */
export function reasonPastAsk(f) {
  if (f.stale) {
    return "silent";
  }
  if (f.mode === "count_and_time") {
    if (f.activeHours > f.capHours) {
      return "over_budget";
    }
    return "under_budget";
  }
  if (f.call === "running_late") {
    return "running_late";
  }
  if (f.stalled) {
    return "stalled";
  }
  if (f.call === "toss_up") {
    return "toss_up";
  }
  if (f.tooEarly) {
    return "too_early";
  }
  return "on_time";
}
