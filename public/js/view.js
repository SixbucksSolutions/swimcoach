// @ts-check
// The frozen projection (docs/planning/t4-interfaces.md, MVP-08). The controller (state.js) turns
// GET /api/2026-11-13/state into one View per successful poll. Both renderers read only this; neither
// reads the API body or recomputes a verdict (contract/api.md section 6).
//
// JSDoc types only: nothing here runs. Import them with
//   /** @import { View, CardView } from "./view.js" */

/** @typedef {'green'|'yellow'|'red'|'gray'|'done'} Level   state.color */
/** @typedef {-2|-1|0|1|2} Dir   from metrics.trend_bin: sharp_down -2 ... sharp_up 2 */
/**
 * @typedef {object} View
 * @property {number} now             state.now (epoch s); all ages are measured against it
 * @property {number|null} lastReportAt
 * @property {'no_data'|'idle'|'stale'|'live'} feed
 * @property {{staleMinutes:number, stallMinutes:number, minHistoryMinutes:number, minBlockUsed:number}} thresholds
 * @property {CardView[]} cards       state.milestones, in the server's order
 * @property {number} asking          cards with needsMe !== null
 */
/**
 * @typedef {object} CardView
 * @property {string} key             JSON.stringify([asciiLower(project), asciiLower(milestone)]); never ALL
 * @property {string} title           project + " " + milestone (api.md 6.2)
 * @property {'codex'|'claude'} agent
 * @property {Level} level
 * @property {string} reason          state.reason, unchanged
 * @property {string} why             the words for reason (api.md 6.6), aged to view.now; see below
 * @property {string} callWhy         the words for the call without the ask; see below
 * @property {string|null} needsMe
 * @property {boolean} stale          state.stale; silentSeconds = now - updatedAt
 * @property {number} silentSeconds
 * @property {'ratio'|'count_and_time'} mode
 * @property {boolean} tooEarly       metrics.too_early, ratio mode, not done
 * @property {number|null} rtr        metrics.rtr; null in count_and_time mode
 * @property {Dir|null} dir           null when trend is null, when done, or in count_and_time mode
 * @property {{delta:number, minutes:number, proj:number|null, recentDone:number, toGo:number}|null} trend   same nulls as dir
 * @property {number|null} chance     metrics.chance_on_time, same nulls as dir
 * @property {number|null} marginSeconds   (cap_hours - projection_hours) * 3600; null when projection_hours is
 * @property {number|null} work
 * @property {number} clock
 * @property {number} finished
 * @property {number} total
 * @property {number} activeHours
 * @property {number} capHours
 * @property {{ready_for_work:number, in_progress:number, needs_terry:number, ready_for_review:number, completed:number}} lanes
 * @property {[number, number][]} spark   state.spark, unchanged
 * @property {number} updatedAt
 * @property {number} lastMoveAt
 */

// The `why` words, one per state.reason (frozen; t4-interfaces.md, and Terry 2026-11-13 for the budget
// pair, UX-133). words.js words them and state.js calls it; dur() is format.js's.
//   done           "Done"
//   needs_terry    the needs_me text
//   silent         "Agent silent for " + dur(silentSeconds)
//   running_late   "Running late"
//   stalled        "No ticket moved in " + dur(now - lastMoveAt)
//   toss_up        "Toss-up"
//   too_early      "Too early to call"
//   on_time        "On time"
//   over_budget    "Over budget"
//   under_budget   "Under budget"
//
// `callWhy` is `why` for every reason but needs_terry. On a needs_terry card it is the words for the
// first api.md 6.6 row AFTER needs_terry that the state's fields match, so a red display's hero keeps
// the call while the flag and the overview blurb carry the ask (visual review MVP-08, item 2; the
// mock's facts() never put the ask in the hero). words.js reasonPastAsk() walks those rows' own
// fields, which state.js reads, in order:
//   ratio            stale -> silent; metrics.call running_late; stalled; metrics.call toss_up;
//                    metrics.too_early; else on_time
//   count_and_time   stale -> silent; active_hours > cap_hours -> over_budget; else under_budget
// It takes the server's metrics.call as sent and never recomputes it from chance (api.md 6).

export {};
