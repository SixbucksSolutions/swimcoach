// @ts-check
// Shared helpers for both displays and the controller, lifted from the approved mock
// (mocks/index.html, lines 256-273). Pure: no DOM access, no timers.

/** @import { CardView, Dir, Level } from "./view.js" */

/** @type {Readonly<Record<string, string>>} */
const ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

const ARROW_PATH = '<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor"';

/** The overview's page key. A card key is a JSON array string, so it can never equal this. */
export const ALL = "*all*";

/** The poll interval (concept.md section 3.1). */
export const POLL_MS = 10_000;

/**
 * The palette token each card level paints with (docs/brand.md section 5).
 * @type {Readonly<Record<Level, string>>}
 */
export const TONE = Object.freeze({
  green: "--ok",
  yellow: "--risk",
  red: "--bad",
  gray: "--dim",
  done: "--done",
});

/**
 * Each trend bin's spoken name and clock-hand angle in degrees (concept.md section 3.2): 12 o'clock
 * strong up, 1:30 up, 3 flat, 4:30 down, 6 hard down.
 * @type {Readonly<Record<Dir, readonly [string, number]>>}
 */
export const TREND = Object.freeze({
  2: ["Sharp up", -90],
  1: ["Up", -45],
  0: ["Flat", 0],
  [-1]: ["Down", 45],
  [-2]: ["Sharp down", 90],
});

/**
 * The lane labels, from the localswim board (contract/api.md section 6.10). Key order is the board's
 * order, so Object.entries() walks the lanes left to right.
 * @type {Readonly<Record<keyof CardView["lanes"], string>>}
 */
export const LANE_LABELS = Object.freeze({
  ready_for_work: "Ready For Work",
  in_progress: "In progress",
  needs_terry: "Needs Terry",
  ready_for_review: "Ready for review",
  completed: "Completed",
});

/**
 * The alerts bell's SVG, struck through while alerts are off. Constant-cased, as in the mock,
 * because the frozen interface names it BELL.
 * @type {(on: boolean) => string}
 */
export const BELL = (on) => {
  let strike = "";
  if (!on) {
    strike = '<path d="M3 3l18 18"/>';
  }
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>${strike}</svg>`
  );
};

/**
 * Escapes text for HTML content and quoted attribute values. null and undefined become "".
 * @param {unknown} s
 * @returns {string}
 */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/gu, (c) => ENTITIES[c] ?? c);
}

/**
 * Every time on the page reads like "1:32am" or "12:47pm": 12-hour, lowercase am/pm, no space
 * (Terry, 2026-11-13). One formatter, so the status line clock and the footers can never disagree.
 * Local time.
 * @param {Date} d
 * @returns {string}
 */
export function fmtTime(d) {
  const h = d.getHours();
  let half = "pm";
  if (h < 12) {
    half = "am";
  }
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${half}`;
}

/**
 * fmtTime() for an epoch time in seconds.
 * @param {number} t
 * @returns {string}
 */
export function hm(t) {
  return fmtTime(new Date(t * 1000));
}

/**
 * A fraction as a whole percent, clamped to 0..100.
 * @param {number} x
 * @returns {number}
 */
export function pct(x) {
  return Math.round(Math.max(0, Math.min(1, x)) * 100);
}

/**
 * A duration in seconds as "7m" or "1h 05m", to the nearest minute; never below "1m". The sign is
 * ignored. Rounds the whole duration once, so 59m 40s is "1h 00m": the mock rounded only the
 * minutes and wrote "60m" and "2h 60m" there.
 * @param {number} sec
 * @returns {string}
 */
export function dur(sec) {
  const minutes = Math.round(Math.abs(sec) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h) {
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  return `${Math.max(m, 1)}m`;
}

/**
 * Hours used of the cap, as "0.75 of 2.0": the used hours to two decimals with trailing zeros dropped,
 * the cap to one decimal, as the mock's project display wrote them (mocks/index.html 395). The one
 * spelling for both the small-block card and the display, so a swipe never changes how a number reads
 * (visual review MVP-08, item 12). The caller adds the unit.
 * @param {number} used
 * @param {number} cap
 * @returns {string}
 */
export function hoursOfCap(used, cap) {
  return `${Number(used.toFixed(2))} of ${cap.toFixed(1)}`;
}

/**
 * The RTR with its trend as a clock hand around the final digit (concept.md section 3.2). Used by the
 * overview card and the project display's hero.
 * @param {number} ratio
 * @param {Dir|null} dir
 * @returns {string}
 */
export function clockRtr(ratio, dir) {
  const s = ratio.toFixed(2);
  let hand = "";
  if (dir !== null) {
    const [name, angle] = TREND[dir];
    hand =
      `<svg class="hand" viewBox="0 0 24 24" style="--a:${angle}deg" role="img" aria-label="${name}">` +
      `${ARROW_PATH} stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `${s.slice(0, -1)}<span class="pivot">${s.slice(-1)}${hand}</span>`;
}

/**
 * A standalone trend arrow, rotated to the bin's clock angle.
 * @param {Dir|null} dir
 * @returns {string}
 */
export function arrow(dir) {
  if (dir === null) {
    return "";
  }
  const [name, angle] = TREND[dir];
  return (
    `<svg class="arr" viewBox="0 0 24 24" style="transform:rotate(${angle}deg)" role="img" aria-label="${name}">` +
    `${ARROW_PATH} stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}
