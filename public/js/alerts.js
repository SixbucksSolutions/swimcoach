// @ts-check
// Alerts (concept.md 3.1; UX-125 to UX-130): the bell, and a two-tone chime when a new ask arrives
// with alerts on. Sound needs the bell tap first (UX-129). WebKit has no vibration API (UX-128).

import { ui } from "./dom.js";
import { BELL } from "./format.js";

/** @import { View } from "./view.js" */

let soundOn = false;
/** @type {AudioContext|null} */
let audio = null;
/** @type {Set<string>|null} */
let knownNeeds = null;

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

/** Draws the bell: slashed while alerts are off (UX-125). */
export function paintBell() {
  const snd = ui("#snd");
  snd.innerHTML = BELL(soundOn);
  snd.classList.toggle("on", soundOn);
  let label = "Alerts off";
  if (soundOn) {
    label = "Alerts on";
  }
  snd.setAttribute("aria-label", label);
}

/** The bell's tap: turns alerts on or off, and chimes once when turned on. */
export function onBell() {
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

/**
 * Chimes when a new ask arrives with alerts on (UX-126, UX-130). The caller then jumps to the
 * overview (UX-127).
 * @param {View} view
 * @returns {boolean}   whether it chimed
 */
export function alertOnNewAsk(view) {
  const needs = needKeys(view);
  const known = knownNeeds;
  knownNeeds = needs;
  if (known !== null && soundOn && [...needs].some((k) => !known.has(k))) {
    chime();
    return true;
  }
  return false;
}

/**
 * One key per open ask, the card and its words, so a new ask on the same card alerts again.
 * @param {View} view
 * @returns {Set<string>}
 */
export function needKeys(view) {
  return new Set(view.cards.filter((c) => c.needsMe !== null).map((c) => `${c.key}|${c.needsMe}`));
}
