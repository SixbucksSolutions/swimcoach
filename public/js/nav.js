// @ts-check
// Navigation and drawing (mock lines 430-441, 465-469, 471-494): one <section class="page" data-key>
// per display, each drawn through morph(), the page dots, taps, swipes and arrow keys, and the tab
// title. A poll that keeps the viewer in place changes nothing on the page (UX-110).

import { syncBreath, ui } from "./dom.js";
import { ALL, esc } from "./format.js";
import { morph } from "./morph.js";
import { fitCards, renderOverview } from "./overview.js";
import { renderProject } from "./project.js";

/** @import { View } from "./view.js" */

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

/** @param {Event} e   a tap on a card, the back link or a dot */
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
