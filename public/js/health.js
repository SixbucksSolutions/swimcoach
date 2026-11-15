// @ts-check
// The Health box, the warning line under the Status line, and the displays' gray (concept.md 3.1),
// written by poll.js's tick every second. A change of state fades rather than switching (brand.md 6;
// localswim swimcoach #0036; UX-183 to UX-186). Terry, 2026-11-14: "going from LIVE to STALE? do a fade
// out/in to draw my eye gently." The old state fades out (0.3 s ease-in) with its warning line; the new
// one is written and fades in (0.3 s ease-out) with its own, while the displays ease into or out of
// their gray over the same 0.3 s.
//
// Motion fires only on a real change of state: a second or a poll that leaves the state alone writes
// only what changed and starts nothing (UX-110). Nothing moves before the reveal (the page's own 0.2 s
// fade covers the first render), while the page is hidden, or under prefers-reduced-motion: reduce.
// The fades run through the Web Animations API, so they write nothing to the DOM themselves.

import { setText, syncBreath, ui } from "./dom.js";
import { dur } from "./format.js";

/** @typedef {{st: string, label: string, age: number|null, msg: string}} Health */

const FADE_MS = 300;
const OUT = [{ opacity: 1 }, { opacity: 0 }];
const IN = [{ opacity: 0 }, { opacity: 1 }];
const GRAY = { opacity: 0.4, filter: "grayscale(1)" };
const CLEAR = { opacity: 1, filter: "grayscale(0)" };

/** @type {string|null} the state on screen, as keyOf gives it; null before the first write */
let shown = null;
/** @type {Health|null} the newest state asked for while a fade-out runs; written when it ends */
let pending = null;

/**
 * A state's identity: SIGN IN shares OFFLINE's class, so the label counts too.
 * @param {Health} h
 * @returns {string}
 */
function keyOf(h) {
  return `${h.st} ${h.label}`;
}

/**
 * @param {string|undefined} st
 * @returns {boolean}   whether the displays are grayed in this state (STALE, OFFLINE, SIGN IN)
 */
function grayed(st) {
  return st === "stale" || st === "off";
}

/** @returns {boolean}   whether a change MUST NOT move: before the reveal, hidden, or reduced motion */
function still() {
  return (
    document.documentElement.classList.contains("loading") ||
    document.hidden ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Writes a state, each part only when it changed, so a quiet second mutates nothing (UX-110).
 * @param {Health} h
 */
function write(h) {
  shown = keyOf(h);
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

/**
 * Fades the Health box in, the warning line with it when there is one, and eases the displays into or
 * out of their gray when that changed.
 * @param {boolean} wasGray
 */
function fadeIn(wasGray) {
  const timing = { duration: FADE_MS, easing: "ease-out" };
  ui("#health").animate(IN, timing);
  const warn = ui("#warn");
  if (warn.textContent !== "") {
    warn.animate(IN, timing);
  }
  const isGray = grayed(ui("#phone").dataset.health);
  if (isGray !== wasGray) {
    let frames = [CLEAR, GRAY];
    if (!isGray) {
      frames = [GRAY, CLEAR];
    }
    ui("#pages").animate(frames, timing);
  }
}

/** The fade-out has ended: write the newest state asked for, and fade it in. */
function swap() {
  const next = pending;
  pending = null;
  if (next === null) {
    return;
  }
  const wasGray = grayed(ui("#phone").dataset.health);
  write(next);
  fadeIn(wasGray);
}

/**
 * Fades the state on screen out, the warning line with it when there is one; swap() runs at the end.
 * @param {Health} h
 */
function fadeOut(h) {
  pending = h;
  const timing = { duration: FADE_MS, easing: "ease-in" };
  const out = ui("#health").animate(OUT, timing);
  const warn = ui("#warn");
  if (warn.textContent !== "") {
    warn.animate(OUT, timing);
  }
  out.addEventListener("finish", swap, { once: true });
}

/**
 * Shows a state: written in place when it is the one on screen (a new age or duration) or when nothing
 * may move; faded out and in when it is a new one. While a fade-out runs, the newest state waits for
 * its end, so a state that flickers mid-fade still lands on the latest.
 * @param {Health} h
 */
export function showHealth(h) {
  if (pending !== null) {
    pending = h;
    return;
  }
  if (shown === null || keyOf(h) === shown || still()) {
    write(h);
    return;
  }
  fadeOut(h);
}
