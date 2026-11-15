// @ts-check
// The overview's motion (localswim swimcoach #0035; UX-177 to UX-182). Direction carries meaning
// (Terry, 2026-11-14): sideways means a project did it, "outside our sphere of control"; vertical
// means swimcoach itself did it. A project card arrives from off the left edge and leaves off the
// right; GO TO KEYBOARD drops from under the status bar and retracts up under it; the GO CODE REVIEW
// line rises from under the page dots and sinks back under them.
//
// One poll plays up to three phases of PHASE_MS each, and skips any phase with nothing to do: every
// exit together, then one glide of the cards that stay to their new places (resizing them when the
// grid crosses the 3/6 boundary), then every arrival together.
//
// It works on the overview's keyed slots (slotKey): snapshot() records where each was before the
// morph, and play() compares that with where each is after the page is fitted. A slot that stayed is
// the same node (morph keeps it), so the glide is an inverted transform from its old place. A slot
// that went is a detached node; it comes back for its exit as a ghost at its old place, and goes when
// the exit ends. Everything runs through the Web Animations API, so a poll that changed nothing
// animates nothing and writes nothing (UX-110).

import { slotKey } from "./overview.js";

/** One phase of motion, in ms: the 0.3 s of the fade-in it replaces (UX-135). */
const PHASE_MS = 300;

/** How far past the screen edge a card travels, in px, so its rounded corner is clear of it too. */
const CLEAR_PX = 24;

/** A move smaller than this, in px, is layout rounding, not a move. */
const STILL_PX = 0.5;

/** GO TO KEYBOARD's key in slotKey. */
const KBD_KEY = "*kbd*";

/**
 * Where one slot sat, in viewport px, and its Title line's font size: the 3/6 boundary changes that
 * size too (24 px full, 20 px half), so it glides with the card instead of snapping.
 * @typedef {{ el: Element, top: number, left: number, width: number, height: number,
 *   name: Element|null, nameSize: number }} Place
 */

/**
 * The overview before a draw: its slots by key, whether they were half slots, and the GO CODE REVIEW
 * bar if one was drawn.
 * @typedef {{ slots: Map<string, Place>, half: boolean, bar: Place|null }} Snapshot
 */

/**
 * @param {Element} el
 * @returns {Place}
 */
function placeOf(el) {
  const r = el.getBoundingClientRect();
  const name = el.querySelector(".nm b");
  let nameSize = 0;
  if (name !== null) {
    nameSize = Number.parseFloat(getComputedStyle(name).fontSize);
  }
  return { el, top: r.top, left: r.left, width: r.width, height: r.height, name, nameSize };
}

/**
 * True when the page MAY move: the overview is the display on screen, and the viewer has not asked
 * for reduced motion (UX-182).
 * @param {boolean} overviewInView
 * @returns {boolean}
 */
function motionAllowed(overviewInView) {
  return overviewInView && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Where every slot and the GO CODE REVIEW bar sit now.
 * @param {Element} section  the overview's section
 * @returns {Snapshot}
 */
function snapshot(section) {
  /** @type {Map<string, Place>} */
  const slots = new Map();
  for (const el of section.querySelectorAll(":scope > .cards > .pc")) {
    const key = slotKey(el);
    if (key !== null) {
      slots.set(key, placeOf(el));
    }
  }
  const grid = section.querySelector(":scope > .cards");
  const bar = section.querySelector(":scope > .donebar");
  let barPlace = null;
  if (bar !== null) {
    barPlace = placeOf(bar);
  }
  return { slots, half: grid?.classList.contains("half") ?? false, bar: barPlace };
}

/**
 * What each exit removes from the page when it ends: a card's wrapper, or the bar itself.
 * @type {WeakMap<object, Element>}
 */
const ghosts = new WeakMap();

/**
 * Removes a ghost once its exit has run (or been cancelled).
 * @param {Event} e  the Animation's finish or cancel event
 */
function dropGhost(e) {
  if (e.target !== null) {
    ghosts.get(e.target)?.remove();
  }
}

/**
 * Puts a departed node back at its old place, inside the section, for its exit. A card goes in a
 * wrapper with the old grid's classes, so a half slot keeps its half-slot type while it leaves.
 * @param {HTMLElement} section
 * @param {Place} place
 * @param {string} gridClass  "cards" or "cards half"; "" for the GO CODE REVIEW bar
 * @returns {{ moving: Element, outer: Element }}  the node to animate, and the node to remove after
 */
function ghostOf(section, place, gridClass) {
  const box = section.getBoundingClientRect();
  const at =
    `position:absolute;margin:0;pointer-events:none;top:${place.top - box.top + section.scrollTop}px;` +
    `left:${place.left - box.left}px;width:${place.width}px;height:${place.height}px;`;
  const { el } = place;
  if (gridClass === "") {
    el.setAttribute("style", at);
    section.append(el);
    return { moving: el, outer: el };
  }
  const holder = section.ownerDocument.createElement("div");
  holder.className = `ghost ${gridClass}`;
  holder.setAttribute("style", `${at}display:block;`);
  el.setAttribute("style", "height:100%;");
  holder.append(el);
  section.append(holder);
  return { moving: el, outer: holder };
}

/**
 * Plays one exit: a project card off the right edge, GO TO KEYBOARD up under the status bar, the GO
 * CODE REVIEW bar down under the dots. Accelerating, so it reads as leaving (ease-in).
 * @param {HTMLElement} section
 * @param {Place} place
 * @param {"right"|"up"|"down"} way
 * @param {string} gridClass
 */
function leave(section, place, way, gridClass) {
  const { moving, outer } = ghostOf(section, place, gridClass);
  const box = section.getBoundingClientRect();
  let to = `translateX(${box.right - place.left + CLEAR_PX}px)`;
  if (way === "up") {
    to = `translateY(${-(place.top - box.top + place.height + CLEAR_PX)}px)`;
  } else if (way === "down") {
    to = `translateY(${box.bottom - place.top + CLEAR_PX}px)`;
  }
  const exit = moving.animate([{ transform: "none" }, { transform: to }], {
    duration: PHASE_MS,
    easing: "ease-in",
  });
  ghosts.set(exit, outer);
  exit.addEventListener("finish", dropGhost);
  exit.addEventListener("cancel", dropGhost);
}

/**
 * Glides a slot that stayed from its old place to its new one, and from its old height to its new
 * one when the grid changed slot size. It holds the old place until its phase starts.
 * @param {Place} from
 * @param {Place} to
 * @param {number} delay
 */
function glide(from, to, delay) {
  /** @type {Keyframe} */
  const start = { transform: `translateY(${from.top - to.top}px)` };
  /** @type {Keyframe} */
  const end = { transform: "none" };
  if (Math.abs(from.height - to.height) > STILL_PX) {
    start.height = `${from.height}px`;
    end.height = `${to.height}px`;
  }
  /** @type {KeyframeAnimationOptions} */
  const timing = { duration: PHASE_MS, delay, easing: "ease-in-out", fill: "backwards" };
  to.el.animate([start, end], timing);
  // The Title line's size changes with the slot size; it eases with the card rather than snapping.
  if (to.name !== null && Math.abs(from.nameSize - to.nameSize) > STILL_PX) {
    to.name.animate([{ fontSize: `${from.nameSize}px` }, { fontSize: `${to.nameSize}px` }], timing);
  }
}

/**
 * Plays one arrival into its new place: a project card from off the left edge, GO TO KEYBOARD down
 * from under the status bar, the GO CODE REVIEW bar up from under the dots. Decelerating, so it reads
 * as settling in (ease-out). It waits off screen until its phase starts.
 * @param {HTMLElement} section
 * @param {Place} place
 * @param {"left"|"down"|"up"} way
 * @param {number} delay
 */
function arrive(section, place, way, delay) {
  const box = section.getBoundingClientRect();
  let from = `translateX(${-(place.left - box.left + place.width + CLEAR_PX)}px)`;
  if (way === "down") {
    from = `translateY(${-(place.top - box.top + place.height + CLEAR_PX)}px)`;
  } else if (way === "up") {
    from = `translateY(${box.bottom - place.top + CLEAR_PX}px)`;
  }
  place.el.animate([{ transform: from }, { transform: "none" }], {
    duration: PHASE_MS,
    delay,
    easing: "ease-out",
    fill: "backwards",
  });
}

/**
 * True when a slot that stayed moved or changed size.
 * @param {Place} from
 * @param {Place} to
 * @returns {boolean}
 */
function moved(from, to) {
  return Math.abs(from.top - to.top) > STILL_PX || Math.abs(from.height - to.height) > STILL_PX;
}

/**
 * Phase 1: every slot and bar that went plays its exit. GO TO KEYBOARD retracts up, the bar sinks,
 * a project card leaves to the right.
 * @param {HTMLElement} section
 * @param {Snapshot} before
 * @param {Snapshot} after
 * @returns {number}  how many exits play
 */
function playExits(section, before, after) {
  let gridClass = "cards";
  if (before.half) {
    gridClass = "cards half";
  }
  let exits = 0;
  for (const [key, place] of before.slots) {
    if (!after.slots.has(key)) {
      let way = /** @type {"right"|"up"} */ ("right");
      if (key === KBD_KEY) {
        way = "up";
      }
      leave(section, place, way, gridClass);
      exits += 1;
    }
  }
  if (before.bar !== null && after.bar === null) {
    leave(section, before.bar, "down", "");
    exits += 1;
  }
  return exits;
}

/**
 * Phase 2: every slot that stayed but moved or changed size glides to its new place.
 * @param {Snapshot} before
 * @param {Snapshot} after
 * @param {number} delay  when the phase starts, in ms
 * @returns {number}  how many glides play
 */
function playGlides(before, after, delay) {
  let glides = 0;
  for (const [key, place] of after.slots) {
    const from = before.slots.get(key);
    if (from !== undefined && moved(from, place)) {
      glide(from, place, delay);
      glides += 1;
    }
  }
  return glides;
}

/**
 * Phase 3: every new slot and a new bar arrive. GO TO KEYBOARD drops in, the bar rises, a project
 * card comes in from the left.
 * @param {HTMLElement} section
 * @param {Snapshot} before
 * @param {Snapshot} after
 * @param {number} delay  when the phase starts, in ms
 */
function playArrivals(section, before, after, delay) {
  for (const [key, place] of after.slots) {
    if (!before.slots.has(key)) {
      let way = /** @type {"left"|"down"} */ ("left");
      if (key === KBD_KEY) {
        way = "down";
      }
      arrive(section, place, way, delay);
    }
  }
  if (before.bar === null && after.bar !== null) {
    arrive(section, after.bar, "up", delay);
  }
}

/**
 * Plays the overview's motion for one draw: exits, then the glide, then arrivals (UX-181), each
 * phase skipped when it has nothing to do. Runs after the page is fitted, so every new place is final.
 * @param {HTMLElement} section  the overview's section
 * @param {Snapshot} before  snapshot() taken just before the morph
 */
function play(section, before) {
  const after = snapshot(section);
  let delay = 0;
  if (playExits(section, before, after) > 0) {
    delay = PHASE_MS;
  }
  if (playGlides(before, after, delay) > 0) {
    delay += PHASE_MS;
  }
  playArrivals(section, before, after, delay);
}

export { motionAllowed, play, snapshot };
