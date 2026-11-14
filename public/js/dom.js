// @ts-check
// Small DOM helpers the controller's modules share, and the breathing (concept.md 3.1): the LIVE dot
// breathes a fixed 40 s (20 cycles of 2 s) from each good poll, which outlasts the 30 s poll plus its
// 8 s timeout, and every GO TO KEYBOARD slot breathes on its clock (UX-157).
// Both run through the Web Animations API, so restarting a breath writes nothing to the DOM (UX-110).

/**
 * The last CSS animation seen on each element. A finished CSS animation leaves getAnimations() but
 * stays tied to its element, and play() on it starts it over from its first frame.
 * @type {WeakMap<Element, Animation>}
 */
const seen = new WeakMap();

/**
 * The element's CSS animation: the running one, else the last one seen (finished, but still its own).
 * @param {Element} el
 * @returns {Animation|undefined}
 */
function animationOf(el) {
  const [running] = el.getAnimations();
  if (running !== undefined) {
    seen.set(el, running);
    return running;
  }
  return seen.get(el);
}

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

/**
 * Starts the LIVE dot's 40 s breath over, from its first frame. Only while the box is LIVE: a box that
 * turns LIVE starts a fresh CSS animation of its own, and an old one would breathe in another state.
 */
export function restartBreath() {
  if (ui("#health").className !== "live") {
    return;
  }
  const breath = animationOf(ui("#health i"));
  if (breath !== undefined) {
    breath.currentTime = 0;
    breath.play();
  }
}

/** Locks every GO TO KEYBOARD slot to the LIVE dot's breath: same animation clock, same phase. */
export function syncBreath() {
  const [dot] = ui("#health i").getAnimations();
  if (dot === undefined) {
    return; // not LIVE: the CSS rule has already stopped the slot
  }
  for (const slot of document.querySelectorAll(".pc.kbd")) {
    const throb = animationOf(slot);
    if (throb !== undefined) {
      if (throb.playState === "finished") {
        throb.play();
      }
      throb.currentTime = dot.currentTime;
    }
  }
}
