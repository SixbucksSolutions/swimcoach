// @ts-check
// Polling and the health box (concept.md 3.1; contract/api.md 6 and 6.7; mock lines 517-546). Polls
// GET /api/2026-11-14/state every 30 s and when the page comes back into view, and keeps the status
// line's clock, health box and warning line current every second.
//
// Sign-in (contract/api.md section 2). Once the Access session cookie expires, a poll comes back as a
// redirect (an "opaqueredirect" under redirect: "manual"), a 401 or a 403. That is not the board being
// unreachable, so it never counts toward OFFLINE. The page reloads once, so the browser navigates to
// "/" and Access shows its login. One reload per AUTH_RELOAD_GAP_MS per tab (sessionStorage), so a
// board that refuses the poll while serving the page cannot loop. Past that, the health box reads SIGN
// IN in OFFLINE's red, the displays gray out, and the warning line says to tap it; a tap reloads (the
// home-screen web app has no reload button). The next good poll clears it.

import { restartBreath, setText, syncBreath, ui } from "./dom.js";
import { dur, fmtTime, POLL_MS } from "./format.js";
import { toView } from "./state.js";

/** @import { View } from "./view.js" */
/** @typedef {{st: string, label: string, age: number|null, msg: string}} Health */
/** @typedef {'ok'|'auth'|'fail'} Outcome */

const STATE_PATH = "/api/2026-11-14/state";
const POLL_TIMEOUT_MS = 8000;
const OFFLINE_AFTER_MS = POLL_MS * 3; // three failed polls in a row, 90 s (concept.md 3.1, UX-158, UX-159)
const AUTH_RELOAD_GAP_MS = 5 * 60_000;
const AUTH_RELOAD_KEY = "swimcoach.authReloadAt";
// U+2026, the ellipsis glyph, drawn in Inter (docs/brand.md section 7), until the first poll lands.
const ELLIPSIS = String.fromCharCode(8230);

/** @type {Readonly<Health>} */
const AUTH_HEALTH = Object.freeze({
  st: "off",
  label: "SIGN IN",
  age: null,
  msg: "Signed out of the board. Tap here to sign in again.",
});

/** @type {View|null} */
let lastView = null;
let lastOk = Date.now(); // before the first success: when the page started waiting (healthOf)
let authFailed = false;
let inFlight = false;
/** @type {((view: View) => void) | null} */
let onView = null;

/**
 * One poll: the View, or why there is none. A network error and the 8 s timeout are quiet failures;
 * a body that is not JSON, or one toView() refuses, is a failure that also reaches the console.
 * @returns {Promise<View|"auth"|"fail">}
 */
async function fetchView() {
  /** @type {Response} */
  let res;
  try {
    res = await fetch(STATE_PATH, {
      cache: "no-store",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
  } catch {
    return "fail";
  }
  const kind = outcomeOf(res);
  if (kind !== "ok") {
    return kind;
  }
  try {
    return toView(await res.json());
  } catch (error) {
    reportError(error);
    return "fail";
  }
}

/** The page reloads once so Access can show its login; see the top of this file. */
function onAuthFailure() {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(AUTH_RELOAD_KEY);
    let last = null;
    if (raw !== null) {
      last = Number(raw);
    }
    if (mayReload(last, now)) {
      sessionStorage.setItem(AUTH_RELOAD_KEY, String(now));
      location.reload();
      return;
    }
  } catch {
    // No storage, so no record to stop a loop: show SIGN IN instead of reloading.
  }
  authFailed = true;
}

/** Writes the clock, the health box and the warning line, each only when it changed. */
function tick() {
  setText(ui("#clock"), fmtTime(new Date()));
  let h = AUTH_HEALTH;
  if (!authFailed) {
    h = healthOf(lastView, lastOk, Date.now());
  }
  const health = ui("#health");
  if (health.className !== h.st) {
    health.className = h.st;
  }
  setText(ui("#health b"), h.label);
  // Age shows only when LIVE, from 1 minute (concept.md 3.1).
  let age = "";
  if (h.st === "live" && h.age !== null && h.age >= 60) {
    age = dur(h.age);
  }
  setText(ui("#health span"), age);
  const phone = ui("#phone");
  if (phone.dataset.health !== h.st) {
    phone.dataset.health = h.st;
    syncBreath();
  }
  setText(ui("#warn"), h.msg);
}

async function poll() {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    const got = await fetchView();
    if (got === "auth") {
      onAuthFailure();
    } else if (got !== "fail") {
      lastView = got;
      lastOk = Date.now();
      authFailed = false;
      restartBreath(); // the dot breathes 16 s from each good poll
      onView?.(got);
    }
  } finally {
    inFlight = false;
    tick();
  }
}

function kick() {
  poll().catch(reportError);
}

/**
 * Starts the clock and the polls. Each successful poll's View goes to draw.
 * @param {(view: View) => void} draw
 * @returns {Promise<void>}   the first poll, settled
 */
export function startPolling(draw) {
  onView = draw;
  tick();
  const first = poll();
  setInterval(kick, POLL_MS);
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      kick();
    }
  });
  return first;
}

/** @returns {boolean}   whether the health box reads SIGN IN */
export function signedOut() {
  return authFailed;
}

/**
 * The health box (concept.md 3.1; api.md 6.7), the pure core of the mock's tick(). lastOkMs is the
 * last successful poll; before the first, the time the page started waiting, so a board that never
 * answers still turns OFFLINE. OFFLINE comes only from the page's own failed polls.
 *
 * An empty or all-done board with working polls is LIVE (Terry, 2026-11-14: "I want to know the empty
 * list IS the live data"). The neutral IDLE and NO DATA boxes are retired: feed `no_data` is LIVE with
 * no age (UX-137), and feed `idle` is LIVE with its age (UX-136), because STALE applies only while a
 * project is unfinished (UX-138).
 * @param {View|null} view   the last successful poll's View, or null before the first
 * @param {number} lastOkMs
 * @param {number} nowMs
 * @returns {Health}
 */
export function healthOf(view, lastOkMs, nowMs) {
  const sinceOk = nowMs - lastOkMs;
  if (sinceOk > OFFLINE_AFTER_MS) {
    const age = sinceOk / 1000;
    let msg = `Can't reach the board for ${dur(age)}.`;
    if (view !== null) {
      msg += " Everything below is old.";
    }
    return { st: "off", label: "OFFLINE", age, msg };
  }
  if (view === null) {
    return { st: "wait", label: ELLIPSIS, age: null, msg: "" };
  }
  if (view.feed === "no_data" || view.lastReportAt === null) {
    return { st: "live", label: "LIVE", age: null, msg: "" };
  }
  // The server's feed is right at view.now; between polls the page ages it by the same rule.
  const age = view.now - view.lastReportAt + sinceOk / 1000;
  if (view.feed !== "idle" && age > view.thresholds.staleMinutes * 60) {
    const msg = `No agent has reported for ${dur(age)}. Everything below is old.`;
    return { st: "stale", label: "STALE", age, msg };
  }
  return { st: "live", label: "LIVE", age, msg: "" };
}

/**
 * What a poll's response means: a redirect, a 401 or a 403 is a sign-in failure (api.md section 2);
 * any other non-2xx is a failed poll.
 * @param {{type: string, status: number, ok: boolean}} res
 * @returns {Outcome}
 */
export function outcomeOf(res) {
  if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
    return "auth";
  }
  if (res.ok) {
    return "ok";
  }
  return "fail";
}

/**
 * Whether a sign-in failure may reload the page now: no reload recorded in this tab, or the last one
 * at least AUTH_RELOAD_GAP_MS ago (or in the future, after a clock change).
 * @param {number|null} lastReloadMs
 * @param {number} nowMs
 * @returns {boolean}
 */
export function mayReload(lastReloadMs, nowMs) {
  if (lastReloadMs === null || Number.isNaN(lastReloadMs)) {
    return true;
  }
  return nowMs - lastReloadMs >= AUTH_RELOAD_GAP_MS || nowMs < lastReloadMs;
}
