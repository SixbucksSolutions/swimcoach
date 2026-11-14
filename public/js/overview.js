// @ts-check
// Display 1, all projects: the port of overview() and fitCards()/fitNames() from the approved mock
// (mocks/index.html lines 337-351 and 442-464). renderOverview is pure: it reads one View and returns
// HTML. fitCards is the only function here that touches the DOM, and it writes only what changed.

/** @import { CardView, View } from "./view.js" */

import { clockRtr, esc } from "./format.js";

/** The gap between slots in px; the same 10px as `.cards{gap}` in overview.css. */
const SLOT_GAP = 10;

/**
 * The content minimum of one slot in px, by slot count: 101.7 for 4 slots, 83.5 for 8 (UX-028).
 * @type {Readonly<Record<4|8, number>>}
 */
const SLOT_MIN = Object.freeze({ 4: 101.7, 8: 83.5 });

/** More than this many cards flips the overview from four full slots to eight half slots (UX-025). */
const FULL_SLOTS = 4;

/**
 * The Title line's font size in px, as the stylesheet sets it: 24 in a full slot, 20 in a half slot.
 * @type {Readonly<{full: number, half: number}>}
 */
const NAME_PX = Object.freeze({ full: 24, half: 20 });

/** The smallest a shrunken Title line gets before CSS ends it in an ellipsis (UX-068). */
const NAME_MIN_PX = 14;

/** Two measured font sizes this close are the same size, so a poll does not rewrite one. */
const NAME_TOLERANCE_PX = 0.1;

// biome-ignore lint/security/noSecrets: display text for the empty state, not a secret.
const EMPTY_STATE = '<div class="empty">No reports yet today.</div>';

/**
 * Hours as a short number: 4 stays "4" and 2.25 becomes "2.3", never "2.250000001".
 * @param {number} hours
 * @returns {string}
 */
function hoursText(hours) {
  return String(Number(hours.toFixed(1)));
}

/**
 * The Detail blurb under a card's Title line, or "" for none (concept.md 3.2).
 * Ratio mode: green shows nothing; every other level shows the words for its reason.
 * count_and_time mode (UX-131): "N of M done · H of C hrs", unless the card is done ("Done") or
 * silent (the silence); red never reaches here, because red cards leave the list.
 * @param {CardView} card
 * @returns {string}
 */
function blurb(card) {
  if (card.mode === "count_and_time") {
    if (card.level === "done" || card.reason === "silent") {
      return card.why;
    }
    return `${card.finished} of ${card.total} done · ${hoursText(card.activeHours)} of ${hoursText(card.capHours)} hrs`;
  }
  if (card.level === "green") {
    return "";
  }
  return card.why;
}

/**
 * One ordinary card.
 * @param {CardView} card
 * @returns {string}
 */
function renderCard(card) {
  let detail = "";
  const words = blurb(card);
  if (words) {
    detail = `<span>${esc(words)}</span>`;
  }
  let rtr = "";
  if (card.rtr !== null && card.level !== "done") {
    rtr = `<div class="rt">${clockRtr(card.rtr, card.dir)}</div>`;
  }
  return (
    `<button class="pc ${card.level}" data-go="${esc(card.key)}">` +
    `<div class="nm"><b>${esc(card.title)}</b>${detail}</div>${rtr}</button>`
  );
}

/**
 * The one GO TO KEYBOARD slot that takes every red card's place; it opens the first of them.
 * @param {CardView[]} red  at least one card, in the server's order
 * @returns {string}
 */
function renderKeyboard(red) {
  const [first] = red;
  if (!first) {
    return "";
  }
  const names = red.map((card) => esc(card.title)).join(" · ");
  return (
    `<button class="pc kbd" data-go="${esc(first.key)}">` +
    `<div class="nm"><b>GO TO KEYBOARD</b><span>${names}</span></div></button>`
  );
}

/**
 * Sets one inline custom property, but only when its value differs, so an unchanged poll mutates
 * nothing (UX-110).
 * @param {CSSStyleDeclaration} style
 * @param {string} name
 * @param {string} value
 * @returns {void}
 */
function setPropertyIfChanged(style, name, value) {
  if (style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
}

/**
 * True when both sizes are set and within NAME_TOLERANCE_PX of each other, or are the same string.
 * @param {string} have  the inline font-size now, "" when none
 * @param {string} want  the font-size wanted, "" when none
 * @returns {boolean}
 */
function sameNameSize(have, want) {
  if (have === want) {
    return true;
  }
  if (have === "" || want === "") {
    return false;
  }
  return Math.abs(Number.parseFloat(have) - Number.parseFloat(want)) <= NAME_TOLERANCE_PX;
}

/**
 * The inline font-size a Title line needs: "" when its text fits at the stylesheet's size, else the
 * size that fits, never below NAME_MIN_PX. The natural width comes from a Range over the text, scaled
 * from the size now showing to the stylesheet's size, so the inline size never has to be cleared and
 * set again to measure. Returns null for a line that is not laid out (width 0), which is left alone.
 * @param {HTMLElement} name
 * @param {number} basePx  the stylesheet's font size for the Title line
 * @returns {string|null}
 */
function wantedNameSize(name, basePx) {
  const room = name.clientWidth;
  const showingPx = Number.parseFloat(getComputedStyle(name).fontSize);
  if (room === 0 || !(showingPx > 0)) {
    return null;
  }
  const range = document.createRange();
  range.selectNodeContents(name);
  const naturalWidth = (range.getBoundingClientRect().width * basePx) / showingPx;
  if (naturalWidth <= room) {
    return "";
  }
  return `${Math.max(NAME_MIN_PX, Math.floor(((basePx * room) / naturalWidth) * 10) / 10)}px`;
}

/**
 * One-line names: shrinks a long name's font until it fits, down to 14px; past that, CSS ends it in an
 * ellipsis. Writes a size only when it differs from the one showing.
 * @param {HTMLElement} cards
 * @param {number} basePx  the stylesheet's font size for the Title line
 * @returns {void}
 */
function fitNames(cards, basePx) {
  for (const name of cards.querySelectorAll("b")) {
    const want = wantedNameSize(name, basePx);
    if (want !== null && !sameNameSize(name.style.fontSize, want)) {
      name.style.fontSize = want;
    }
  }
}

/**
 * The overview page's inner HTML. Red cards leave the list into one GO TO KEYBOARD slot, first; the
 * other cards keep the server's order, which this function MUST NOT change (api.md 6.9).
 * @param {View} view
 * @returns {string}
 */
export function renderOverview(view) {
  if (view.cards.length === 0) {
    return EMPTY_STATE;
  }
  const red = view.cards.filter((card) => card.level === "red");
  const rest = view.cards.filter((card) => card.level !== "red");
  let html = '<div class="cards">';
  if (red.length > 0) {
    html += renderKeyboard(red);
  }
  for (const card of rest) {
    html += renderCard(card);
  }
  return `${html}</div>`;
}

/**
 * The 4/8 slot grid (concept.md 3.2). Up to four slots: four equal slots, two Detail blurb lines. Five
 * or more: eight half-height slots, one blurb line. Slot height comes from the screen but never goes
 * below the content minimum, so more than eight slots scroll. Runs synchronously after the page is
 * rendered, so nothing paints twice. Writes a style or class only when its value changes (UX-110).
 * @param {HTMLElement} page  the overview's `<section class="page">`
 * @returns {void}
 */
export function fitCards(page) {
  const cards = page.querySelector(".cards");
  if (!(cards instanceof HTMLElement)) {
    return;
  }
  const half = cards.children.length > FULL_SLOTS;
  /** @type {4|8} */
  let rows = 4;
  let basePx = NAME_PX.full;
  if (half) {
    rows = 8;
    basePx = NAME_PX.half;
  }
  if (cards.classList.contains("half") !== half) {
    cards.classList.toggle("half", half);
  }
  const computed = getComputedStyle(page);
  const available =
    page.clientHeight -
    Number.parseFloat(computed.paddingTop) -
    Number.parseFloat(computed.paddingBottom);
  const slot = Math.max(SLOT_MIN[rows], (available - (rows - 1) * SLOT_GAP) / rows);
  setPropertyIfChanged(cards.style, "--slot", `${slot.toFixed(2)}px`);
  fitNames(cards, basePx);
}
