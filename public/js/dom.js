// @ts-check
// Small DOM helpers the controller's modules share, and the breathing sync (concept.md 3.1): the LIVE
// dot and every GO TO KEYBOARD slot breathe on one clock.

/**
 * The shell element for a selector; the page cannot run without it.
 * @param {string} selector
 * @returns {HTMLElement}
 */
export function ui(selector) {
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
export function setText(el, text) {
  if (el.textContent !== text) {
    el.textContent = text;
  }
}

/** @param {HTMLElement} el   restarts its CSS animation from the first frame */
export function restartAnimation(el) {
  el.style.animation = "none";
  el.getBoundingClientRect();
  el.style.animation = "";
}

/** Locks every GO TO KEYBOARD slot to the LIVE dot's breath: same animation clock, same phase. */
export function syncBreath() {
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
