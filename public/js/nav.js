// @ts-check
// Navigation and drawing (mock lines 430-441, 465-469, 471-494): one <section class="page" data-key>
// per display, each drawn through morph(), the page dots, taps, swipes and arrow keys, and the tab
// title. A poll that keeps the viewer in place changes nothing on the page (UX-110).

import {
  cancelDeparture,
  depart,
  departedKey,
  departedSection,
  endDeparture,
  returnBehavior,
} from "./departed.js";
import { syncBreath, ui } from "./dom.js";
import { ALL, esc } from "./format.js";
import { morph } from "./morph.js";
import { clearGhosts, motionAllowed, play, snapshot } from "./motion.js";
import { fitCards, renderOverview, slotKey } from "./overview.js";
import { renderProject } from "./project.js";

/** @import { View } from "./view.js" */
/** @import { Snapshot } from "./motion.js" */

/** How long the glide back to the overview takes before the departed display is removed, in ms. */
const GLIDE_MS = 700;

/**
 * The last View drawn, so the departed display can be removed by drawing it again once the viewer
 * is back on the overview (departed.js).
 * @type {View|null}
 */
let lastView = null;

/**
 * The display keys to draw: want, plus the departed display, kept at the place it had (departed.js).
 * @param {string[]} want
 * @param {string|null} keep
 * @returns {string[]}
 */
function withDeparted(want, keep) {
  if (keep === null) {
    return want;
  }
  const order = [...want];
  const at = Math.min(Math.max(keys().indexOf(keep), 1), order.length);
  order.splice(at, 0, keep);
  return order;
}

/**
 * Ends the departure once the glide has had its time. It removes the departed display itself rather
 * than trusting the glide to have finished: on a slow or throttled page the viewer can still be on
 * it, and a redraw would take it for a display that just left. A viewer still on it lands on the
 * overview; one who moved elsewhere during the countdown stays there.
 */
function finishReturn() {
  const section = departedSection();
  const stillOn = section !== null && keys()[current()] === section.dataset.key;
  endDeparture();
  section?.remove();
  if (stillOn) {
    go(ALL, "auto");
  }
  if (lastView !== null) {
    render(lastView);
  }
}

/**
 * The countdown ended: a viewer still on the departed display glides back to the overview (a jump
 * under reduced motion), and the display goes once the glide has had its time.
 */
function returnHome() {
  if (keys()[current()] === departedKey()) {
    go(ALL, returnBehavior());
  }
  setTimeout(finishReturn, GLIDE_MS);
}

/**
 * Draws the overview through a keyed morph, so every card already on screen keeps its node.
 * @param {HTMLElement} el   the overview's section
 * @param {View} view
 * @param {boolean} overviewInView   whether the overview is the display on screen
 * @returns {Snapshot|null}   where the slots were before the draw, for the motion that follows it
 *   (motion.js); null on the first draw, which the whole-page reveal covers (concept.md 3.4), and
 *   whenever the page MUST NOT move (UX-190)
 */
function drawOverview(el, view, overviewInView) {
  clearGhosts(el);
  let before = null;
  if (el.hasChildNodes() && motionAllowed(overviewInView)) {
    before = snapshot(el);
  }
  morph(el, renderOverview(view), slotKey);
  return before;
}

function sections() {
  return [...ui("#pages").children].filter((el) => el instanceof HTMLElement);
}

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
 * The departed display to keep for this draw, if any (departed.js): the one already counting down,
 * unless its project came back, or the display on screen whose project just left.
 * @param {string[]} want
 * @param {string} shown   the key of the display on screen as the poll landed
 * @returns {string|null}
 */
function keptDisplay(want, shown) {
  const counting = departedKey();
  if (counting !== null && want.includes(counting)) {
    cancelDeparture();
  } else if (counting !== null) {
    return counting;
  }
  if (shown !== ALL && !want.includes(shown)) {
    return shown;
  }
  return null;
}

/**
 * Draws every display: the overview, each project, and the departed display, if any.
 * @param {string[]} order
 * @param {View} view
 * @param {string|null} keep
 * @param {boolean} overviewInView
 * @returns {{ el: HTMLElement, before: Snapshot }|null}   the overview's motion to play, if any
 */
function drawSections(order, view, keep, overviewInView) {
  const byKey = new Map(view.cards.map((c) => [c.key, c]));
  let motion = null;
  for (const el of placeSections(order)) {
    const key = el.dataset.key ?? "";
    const card = byKey.get(key);
    if (key === ALL) {
      const before = drawOverview(el, view, overviewInView);
      if (before !== null) {
        motion = { el, before };
      }
    } else if (card !== undefined) {
      morph(el, renderProject(card, view));
    } else if (key === keep) {
      depart(el, key, returnHome);
    }
  }
  return motion;
}

/** @returns {string[]}   the display keys, left to right */
export function keys() {
  return sections().map((el) => el.dataset.key ?? "");
}

/** @returns {number}   the index of the display in view */
export function current() {
  const pages = ui("#pages");
  return Math.round(pages.scrollLeft / Math.max(pages.clientWidth, 1));
}

/**
 * Scrolls to a display by key; an unknown key does nothing.
 * @param {string|undefined} key
 * @param {ScrollBehavior} [behavior]
 */
export function go(key, behavior = "smooth") {
  const i = keys().indexOf(key ?? "");
  if (key !== undefined && i >= 0) {
    const pages = ui("#pages");
    pages.scrollTo({ left: i * pages.clientWidth, behavior });
  }
}

/** Highlights the dot of the display in view, and records its key. */
export function syncDots() {
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

/** Fits the overview's cards to the screen (08-A's fitCards). */
export function fitOverview() {
  const [overview] = sections();
  if (overview !== undefined) {
    fitCards(overview);
  }
}

/** @param {Event} e   a tap on a card, the back link, the mark and wordmark, or a dot */
export function onTap(e) {
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
export function onKey(e) {
  if (e.key === "ArrowLeft") {
    go(keys()[current() - 1]);
  } else if (e.key === "ArrowRight") {
    go(keys()[current() + 1]);
  }
}

/**
 * Draws one View: the sections, the dots, the fit, the breath and the title.
 * @param {View} view
 */
export function render(view) {
  lastView = view;
  const want = [ALL, ...view.cards.map((c) => c.key)];
  const shown = keys()[current()] ?? ALL;
  // Motion plays only when the overview was already the display on screen as this poll landed. When
  // the project display being read goes away, it stays and says so (departed.js), and nothing on
  // the overview moves, because the overview is off screen (UX-190).
  const overviewInView = shown === ALL;
  const keep = keptDisplay(want, shown);
  const order = withDeparted(want, keep);
  let target = shown;
  if (!order.includes(target)) {
    target = ALL;
  }
  const motion = drawSections(order, view, keep, overviewInView);
  morph(ui("#dots"), dotsHtml(view, order.indexOf(target), order.indexOf(keep ?? "")));
  // Keep the viewer on the display they were reading when one before it appears or goes (UX-124).
  if (keys()[current()] !== target) {
    go(target, "auto");
  }
  fitOverview();
  syncBreath();
  // After the fit, so every slot's new place is final.
  if (motion !== null) {
    play(motion.el, motion.before);
  }
  syncDots();
  const title = titleOf(view.asking);
  if (document.title !== title) {
    document.title = title;
  }
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
 * A departed display (departed.js) keeps a dimmed dot of its own at its place until it goes.
 * @param {View} view
 * @param {number} active   index of the active display
 * @param {number} [gone]   index of the departed display's dot, or -1 for none
 * @returns {string}
 */
export function dotsHtml(view, active, gone = -1) {
  const labels = ["All projects", ...view.cards.map((c) => c.title)];
  if (gone > 0) {
    labels.splice(gone, 0, "Off the board");
  }
  return labels
    .map((label, i) => {
      // "gone" first: syncDots() toggles "on" at the end of the list, so markup in the same order
      // matches the live class and a poll during the countdown rewrites nothing (UX-110).
      const cls = [];
      if (i === gone) {
        cls.push("gone");
      }
      if (i === active) {
        cls.push("on");
      }
      let attr = "";
      if (cls.length > 0) {
        attr = ` class="${cls.join(" ")}"`;
      }
      return `<button type="button"${attr} aria-label="${esc(label)}"><i></i></button>`;
    })
    .join("");
}
