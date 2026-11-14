// @ts-check
// biome-ignore-all lint/style/noExcessiveLinesPerFile: the controller is one state machine over one shell (poll, health, paging, alerts, reveal); preset all's noTernary and useBlockStatements and the formatter make it 524 counted lines (measured 2026-11-13), and splitting it would scatter its shared state across modules nobody else imports. Every function stays within the 50-line and complexity limits.
// The page controller (docs/planning/t4-interfaces.md, MVP-08 C): polls the board, keeps the health
// box honest, draws both displays through morph(), and handles navigation, alerts and the reveal.
// Ported from the approved mock (mocks/index.html, 430-441, 465-469, 471-588) with the scenario code
// swapped for GET /api/2026-11-13/state. The pure parts are exported, at the end, for the tests; the
// DOM wiring runs only when this module loads into public/index.html, which carries no test hook.
//
// Sign-in (contract/api.md section 2). Once the Access session cookie expires, a poll comes back as a
// redirect (an "opaqueredirect" under redirect: "manual"), a 401 or a 403. That is not the board being
// unreachable, so it never counts toward OFFLINE. The page reloads once, so the browser navigates to
// "/" and Access shows its login. One reload per AUTH_RELOAD_GAP_MS per tab (sessionStorage), so a
// board that refuses the poll while serving the page cannot loop. Past that, the health box reads SIGN
// IN in OFFLINE's red, the displays gray out, and the warning line says to tap it; a tap reloads (the
// home-screen web app has no reload button). The next good poll clears it.

import { ALL, BELL, dur, esc, fmtTime, POLL_MS } from "./format.js";
import { morph } from "./morph.js";
import { fitCards, renderOverview } from "./overview.js";
import { renderProject } from "./project.js";
import { toView } from "./state.js";

/** @import { View } from "./view.js" */
/** @typedef {{st: string, label: string, age: number|null, msg: string}} Health */
/** @typedef {'ok'|'auth'|'fail'} Outcome */

const STATE_PATH = "/api/2026-11-13/state";
const POLL_TIMEOUT_MS = 8000;
const REVEAL_CAP_MS = 3000;
const OFFLINE_AFTER_MS = POLL_MS * 3; // three failed polls in a row (concept.md 3.1)
const TOUCH_RETRY_MS = 300; // a paint waits while a finger is on the displays
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
let touching = false;
let paintQueued = false;
let soundOn = false;
/** @type {AudioContext|null} */
let audio = null;
/** @type {Set<string>|null} */
let knownNeeds = null;

/**
 * @param {string} selector
 * @returns {HTMLElement}
 */
function ui(selector) {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`${selector} is missing from the page`);
  }
  return el;
}

/**
 * Sets an element's text only when it differs, so a quiet second mutates nothing.
 * @param {HTMLElement} el
 * @param {string} text
 */
function setText(el, text) {
  if (el.textContent !== text) {
    el.textContent = text;
  }
}

// ---------- paging ----------
function sections() {
  return [...ui("#pages").children].filter((el) => el instanceof HTMLElement);
}
function keys() {
  return sections().map((el) => el.dataset.key ?? "");
}
function current() {
  const pages = ui("#pages");
  return Math.round(pages.scrollLeft / Math.max(pages.clientWidth, 1));
}

/**
 * @param {string|undefined} key
 * @param {ScrollBehavior} [behavior]
 */
function go(key, behavior = "smooth") {
  const i = keys().indexOf(key ?? "");
  if (key !== undefined && i >= 0) {
    const pages = ui("#pages");
    pages.scrollTo({ left: i * pages.clientWidth, behavior });
  }
}

function syncDots() {
  const i = current();
  for (const [j, el] of [...ui("#dots").children].entries()) {
    // Only on a change: some DOMs write class="" for a no-op toggle, which a poll MUST NOT do.
    if (el.classList.contains("on") !== (j === i)) {
      el.classList.toggle("on", j === i);
    }
  }
  const pages = ui("#pages");
  const cur = keys()[i] ?? ALL;
  if (pages.dataset.cur !== cur) {
    pages.dataset.cur = cur;
  }
}

function fitOverview() {
  const [overview] = sections();
  if (overview !== undefined) {
    fitCards(overview);
  }
}

/** @param {Event} e   a tap on a card, the back link or a dot */
function onTap(e) {
  const { target } = e;
  if (!(target instanceof Element)) {
    return;
  }
  const hit = target.closest("[data-go], #dots button");
  if (hit instanceof HTMLElement) {
    go(hit.dataset.go ?? keys()[[...ui("#dots").children].indexOf(hit)]);
  }
}

/** @param {KeyboardEvent} e */
function onKey(e) {
  if (e.key === "ArrowLeft") {
    go(keys()[current() - 1]);
  } else if (e.key === "ArrowRight") {
    go(keys()[current() + 1]);
  }
}

// ---------- breathing ----------
/** @param {HTMLElement} el   restarts its CSS animation from the first frame */
function restartAnimation(el) {
  el.style.animation = "none";
  el.getBoundingClientRect();
  el.style.animation = "";
}

// Lock every GO TO KEYBOARD slot to the LIVE dot's breath: same animation clock, same phase.
function syncBreath() {
  const [dot] = ui("#health i").getAnimations();
  if (dot === undefined) {
    return; // not LIVE: the CSS rule has already stopped the slot
  }
  for (const slot of document.querySelectorAll(".pc.kbd")) {
    if (slot instanceof HTMLElement && slot.getAnimations().length === 0) {
      restartAnimation(slot);
    }
    for (const a of slot.getAnimations().slice(0, 1)) {
      a.currentTime = dot.currentTime;
    }
  }
}

// ---------- alerts ----------
/**
 * One note of the two-tone chime.
 * @param {AudioContext} ctx
 * @param {number} delay   seconds from now
 * @param {number} hz
 */
function note(ctx, delay, hz) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const at = ctx.currentTime + delay;
  osc.frequency.value = hz;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  osc.start(at);
  osc.stop(at + 0.22);
}

function chime() {
  if (!soundOn || audio === null) {
    return;
  }
  note(audio, 0, 740);
  note(audio, 0.22, 990);
  // WebKit has no vibration API (UX-128); elsewhere it is a bonus.
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate([200, 100, 200]);
  }
}

function paintBell() {
  const snd = ui("#snd");
  snd.innerHTML = BELL(soundOn);
  snd.classList.toggle("on", soundOn);
  let label = "Alerts off";
  if (soundOn) {
    label = "Alerts on";
  }
  snd.setAttribute("aria-label", label);
}

function onBell() {
  soundOn = !soundOn;
  if (soundOn) {
    // Sound needs this tap first (UX-129). Older Safari only has the prefixed constructor.
    const Ctor = globalThis.AudioContext ?? Reflect.get(globalThis, "webkitAudioContext");
    audio ??= new Ctor();
    audio.resume().catch(reportError);
  }
  paintBell();
  chime();
}

// ---------- drawing ----------
/**
 * Creates, reorders and removes one <section class="page" data-key> per key (mock 474-485).
 * @param {string[]} want
 * @returns {HTMLElement[]}   the sections, in want's order
 */
function placeSections(want) {
  const pages = ui("#pages");
  const have = new Map(sections().map((el) => [el.dataset.key, el]));
  const placed = want.map((key, i) => {
    let el = have.get(key);
    have.delete(key);
    if (el === undefined) {
      el = document.createElement("section");
      el.className = "page";
      el.dataset.key = key;
    }
    if (pages.children[i] !== el) {
      pages.insertBefore(el, pages.children[i] ?? null);
    }
    return el;
  });
  for (const el of have.values()) {
    el.remove();
  }
  return placed;
}

/**
 * Chimes and jumps to the overview when a new ask arrives, with alerts on (UX-126, UX-127, UX-130).
 * @param {View} view
 */
function alertOnNewAsk(view) {
  const needs = needKeys(view);
  const known = knownNeeds;
  knownNeeds = needs;
  if (known !== null && soundOn && [...needs].some((k) => !known.has(k))) {
    chime();
    go(ALL);
  }
}

/** @param {View} view */
function render(view) {
  const want = [ALL, ...view.cards.map((c) => c.key)];
  let target = keys()[current()] ?? ALL;
  if (!want.includes(target)) {
    target = ALL;
  }
  for (const [i, el] of placeSections(want).entries()) {
    const card = view.cards[i - 1];
    if (card === undefined) {
      morph(el, renderOverview(view));
    } else {
      morph(el, renderProject(card, view));
    }
  }
  morph(ui("#dots"), dotsHtml(view, want.indexOf(target)));
  // Keep the viewer on the display they were reading when one before it appears or goes (UX-124).
  if (keys()[current()] !== target) {
    go(target, "auto");
  }
  fitOverview();
  syncBreath();
  syncDots();
  const title = titleOf(view.asking);
  if (document.title !== title) {
    document.title = title;
  }
  alertOnNewAsk(view);
}

// A paint waits while a finger is on the displays, so a swipe is never yanked mid-gesture.
function paint() {
  if (!touching) {
    if (lastView !== null) {
      render(lastView);
    }
    return;
  }
  if (!paintQueued) {
    paintQueued = true;
    setTimeout(() => {
      paintQueued = false;
      paint();
    }, TOUCH_RETRY_MS);
  }
}

// ---------- health ----------
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

// ---------- polling ----------
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
      restartAnimation(ui("#health i")); // the dot breathes 16 s from each good poll
      paint();
    }
  } finally {
    inFlight = false;
    tick();
  }
}

function kick() {
  poll().catch(reportError);
}

// Reveal once (concept.md 3.4): after the first poll settles and the font is ready, capped at 3 s
// together. Two frames, so the hidden state paints first and the 0.2 s fade runs.
function reveal() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("loading");
    });
  });
}

/** @param {boolean} on */
function setTouching(on) {
  touching = on;
}

function listen() {
  const pages = ui("#pages");
  const passive = { passive: true };
  pages.addEventListener("scroll", syncDots, passive);
  pages.addEventListener("touchstart", () => setTouching(true), passive);
  pages.addEventListener("touchend", () => setTouching(false), passive);
  pages.addEventListener("touchcancel", () => setTouching(false), passive);
  ui("#phone").addEventListener("click", onTap);
  ui("#snd").addEventListener("click", onBell);
  ui("#warn").addEventListener("click", () => {
    if (authFailed) {
      location.reload();
    }
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      kick();
    }
  });
  globalThis.addEventListener("resize", () => {
    fitOverview();
    go(ui("#pages").dataset.cur ?? ALL, "auto");
  });
}

function start() {
  listen();
  paintBell();
  tick();
  const firstPoll = poll();
  setInterval(kick, POLL_MS);
  setInterval(tick, 1000);
  const cap = new Promise((resolve) => {
    setTimeout(resolve, REVEAL_CAP_MS);
  });
  Promise.race([Promise.all([firstPoll, document.fonts.ready]), cap]).then(reveal, reveal);
}

if ("document" in globalThis && document.querySelector("#pages") !== null) {
  start();
}

/**
 * The health box (concept.md 3.1; api.md 6.7), the pure core of the mock's tick(). lastOkMs is the
 * last successful poll; before the first, the time the page started waiting, so a board that never
 * answers still turns OFFLINE. OFFLINE comes only from the page's own failed polls.
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
    return { st: "idle", label: "NO DATA", age: null, msg: "" };
  }
  // The server's feed is right at view.now; between polls the page ages it by the same rule.
  const age = view.now - view.lastReportAt + sinceOk / 1000;
  if (view.feed === "idle") {
    return { st: "idle", label: "IDLE", age, msg: "" };
  }
  if (age > view.thresholds.staleMinutes * 60) {
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

/**
 * One key per open ask, the card and its words, so a new ask on the same card alerts again.
 * @param {View} view
 * @returns {Set<string>}
 */
export function needKeys(view) {
  return new Set(view.cards.filter((c) => c.needsMe !== null).map((c) => `${c.key}|${c.needsMe}`));
}

/**
 * The tab title: "swimcoach", prefixed "(N) " while N cards ask for Terry.
 * @param {number} asking
 * @returns {string}
 */
export function titleOf(asking) {
  if (asking > 0) {
    return `(${asking}) swimcoach`;
  }
  return "swimcoach";
}

/**
 * The page dots: the square overview dot, then one per card. The active dot's class is written
 * here, so a poll that keeps the viewer in place rewrites nothing.
 * @param {View} view
 * @param {number} active   index of the active display
 * @returns {string}
 */
export function dotsHtml(view, active) {
  const labels = ["All projects", ...view.cards.map((c) => c.title)];
  return labels
    .map((label, i) => {
      let on = "";
      if (i === active) {
        on = ' class="on"';
      }
      return `<button type="button"${on} aria-label="${esc(label)}"><i></i></button>`;
    })
    .join("");
}
