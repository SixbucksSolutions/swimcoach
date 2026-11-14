// @ts-check
// The page controller (docs/planning/t4-interfaces.md, MVP-08 C), ported from the approved mock
// (mocks/index.html, 430-441, 465-469, 471-588). This module only wires the parts together:
//   poll.js     polling, the health box and sign-in failures
//   nav.js      the displays, drawn through morph(), the dots, taps, swipes and the title
//   alerts.js   the bell and the chime
//   dom.js      shared DOM helpers and the breathing sync
// The wiring runs only when this module loads into public/index.html, which carries no test hook.

import { alertOnNewAsk, onBell, paintBell } from "./alerts.js";
import { ui } from "./dom.js";
import { ALL } from "./format.js";
import { fitOverview, go, onKey, onTap, render, syncDots } from "./nav.js";
import { signedOut, startPolling } from "./poll.js";

/** @import { View } from "./view.js" */

const REVEAL_CAP_MS = 3000;
const TOUCH_RETRY_MS = 300; // a paint waits while a finger is on the displays

/** @type {View|null} */
let latest = null;
let touching = false;
let paintQueued = false;

/**
 * Draws a View, then alerts on a new ask by chiming and jumping to the overview (UX-126, UX-127).
 * @param {View} view
 */
function draw(view) {
  render(view);
  if (alertOnNewAsk(view)) {
    go(ALL);
  }
}

// A paint waits while a finger is on the displays, so a swipe is never yanked mid-gesture.
function paint() {
  if (!touching) {
    if (latest !== null) {
      draw(latest);
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

/** @param {View} view   each successful poll's View */
function onView(view) {
  latest = view;
  paint();
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
    if (signedOut()) {
      location.reload();
    }
  });
  document.addEventListener("keydown", onKey);
  globalThis.addEventListener("resize", () => {
    fitOverview();
    go(ui("#pages").dataset.cur ?? ALL, "auto");
  });
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

function start() {
  listen();
  paintBell();
  const firstPoll = startPolling(onView);
  const cap = new Promise((resolve) => {
    setTimeout(resolve, REVEAL_CAP_MS);
  });
  Promise.race([Promise.all([firstPoll, document.fonts.ready]), cap]).then(reveal, reveal);
}

if ("document" in globalThis && document.querySelector("#pages") !== null) {
  start();
}

// biome-ignore lint/performance/noBarrelFile: the frozen interface names healthOf as main.js's export (t4-interfaces.md, MVP-08 C); it lives in poll.js beside the tick that uses it.
export { healthOf } from "./poll.js";
