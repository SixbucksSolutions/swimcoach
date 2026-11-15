// @ts-check
// A project display that leaves the board while it is on screen (localswim swimcoach #0037). Terry,
// 2026-11-14: "I don't want to just be ejected out of the card." So the display stays where it is,
// dims, and says why, then glides back to the overview by itself after RETURN_S seconds, or at once
// on a tap of the notice. No modal: the board sits in Terry's peripheral vision, and a modal would hold
// it on a dead page until he put the controller down. The notice says "off the board", not
// "completed", because the page cannot know why the agent sent stop.

import { ALL, esc } from "./format.js";

/** Seconds before the viewer is taken back to the overview. */
const RETURN_S = 5;

/** The notice's fade-in, in ms: the 0.3 s of the overview's motion (UX-177 to UX-182). */
const FADE_MS = 300;

/**
 * The display that left while on screen, and its countdown.
 * @type {{ key: string, section: HTMLElement, left: number, tick: number, timer: number }|null}
 */
let departed = null;

/** @returns {boolean}  whether the viewer asked for reduced motion */
function reduced() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @returns {string|null}  the key of the display that left while on screen, or null */
function departedKey() {
  return departed?.key ?? null;
}

/** @returns {HTMLElement|null}  the departed display's section, or null */
function departedSection() {
  return departed?.section ?? null;
}

/** Counts the notice down by one second. */
function tickDown() {
  if (departed === null) {
    return;
  }
  departed.left = Math.max(departed.left - 1, 0);
  const count = departed.section.querySelector(".gone-note b");
  if (count !== null) {
    count.textContent = String(departed.left);
  }
}

/**
 * Marks a display as departed: it dims (CSS, `.page.departed`), a notice goes on top of it, and a
 * countdown starts. A display already departed is left alone, so a poll during the countdown changes
 * nothing.
 * @param {HTMLElement} section  the departed display's section
 * @param {string} key
 * @param {() => void} onReturn  takes the viewer back to the overview when the countdown ends
 */
function depart(section, key, onReturn) {
  // A display already counting down, or still carrying a notice, is never marked twice.
  if (departed?.key === key || section.querySelector(":scope > .gone-note") !== null) {
    return;
  }
  const title = section.querySelector("h2")?.textContent ?? "";
  section.classList.add("departed");
  section.insertAdjacentHTML(
    "afterbegin",
    `<div class="gone-note"><button type="button" data-go="${esc(ALL)}">` +
      `${esc(title)} is off the board · back to all projects in <b>${RETURN_S}</b> s</button></div>`,
  );
  const note = section.querySelector(".gone-note");
  if (note !== null && !reduced()) {
    note.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" });
  }
  departed = {
    key,
    section,
    left: RETURN_S,
    tick: setInterval(tickDown, 1000),
    timer: setTimeout(onReturn, RETURN_S * 1000),
  };
}

/** Stops the countdown and forgets the departed display; the caller removes or restores it. */
function endDeparture() {
  if (departed !== null) {
    clearInterval(departed.tick);
    clearTimeout(departed.timer);
    departed = null;
  }
}

/**
 * The project came back before the countdown ended: the display is live again, so the notice and the
 * dimming go. Its next draw refills it.
 */
function cancelDeparture() {
  if (departed !== null) {
    departed.section.classList.remove("departed");
    departed.section.querySelector(".gone-note")?.remove();
  }
  endDeparture();
}

/** @returns {ScrollBehavior}  a glide back to the overview, or a jump under reduced motion */
function returnBehavior() {
  if (reduced()) {
    return "auto";
  }
  return "smooth";
}

export { cancelDeparture, depart, departedKey, departedSection, endDeparture, returnBehavior };
