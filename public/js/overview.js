// @ts-check
// Display 1, all projects: the port of overview() and fitCards()/fitNames() from the approved mock
// (mocks/index.html lines 337-351 and 442-464). renderOverview is pure: it reads one View and returns
// HTML. fitCards is the only function here that touches the DOM, and it writes only what changed.

/** @import { CardView, View } from "./view.js" */

import { clockRtr, esc, hoursOfCap } from "./format.js";

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

/** The GO TO KEYBOARD slot's key in slotKey; no CardView.key looks like it. */
const KBD_KEY = "*kbd*";

// biome-ignore lint/security/noSecrets: display text for the empty state, not a secret.
const EMPTY_STATE = '<div class="empty">No reports yet today.</div>';

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
    return `${card.finished} of ${card.total} done · ${hoursOfCap(card.activeHours, card.capHours)} hrs`;
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
 * What a name was last sized for, and the size it got. A name whose key is unchanged needs no
 * measuring, so an unchanged poll touches no DOM at all: no probe, no writes (UX-110).
 * @type {WeakMap<HTMLElement, {key: string, want: string}>}
 */
const sizeCache = new WeakMap();

/**
 * Bumped by fontsLoaded() each time a font finishes loading. It is part of every cache key, so a name
 * sized in the fallback font before Inter arrived is measured again after (concept.md 3.4).
 */
let fontEpoch = 0;

/** At most this many correction passes after the first estimate (UX-068). */
const NAME_MAX_PASSES = 3;

/**
 * A font size scaled to a candidate value: floored to 0.1px, never below NAME_MIN_PX.
 * @param {number} px
 * @returns {number}
 */
function clampName(px) {
  return Math.max(NAME_MIN_PX, Math.floor(px * 10) / 10);
}

/**
 * The hidden twin of a card's Title line, used only on a cache miss. Same classes as the live card,
 * so the same stylesheet font; outside the cards, on the body; visibility hidden, and removed before
 * fitCards returns, so it never paints.
 * @typedef {{root: HTMLElement, button: HTMLElement, name: HTMLElement}} Probe
 */

/**
 * @param {boolean} half  true in the eight-slot grid, where the stylesheet sets 20px instead of 24px
 * @returns {Probe|null}
 */
function openProbe(half) {
  const root = document.createElement("div");
  root.className = "cards";
  if (half) {
    root.className = "cards half";
  }
  root.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  root.innerHTML = '<button class="pc"><div class="nm"><b></b></div></button>';
  const button = root.querySelector("button");
  const name = root.querySelector("b");
  if (!(button && name)) {
    return null;
  }
  document.body.append(root);
  return { root, button, name };
}

/**
 * The width of the probe's text at the font size now set on it.
 * @param {HTMLElement} probeName
 * @returns {number}
 */
function widthOf(probeName) {
  const range = document.createRange();
  range.selectNodeContents(probeName);
  return range.getBoundingClientRect().width;
}

/**
 * The inline font-size a Title line needs, measured on the probe: "" when its text fits at the
 * stylesheet's size. Otherwise the mock's arithmetic (the width AT THE STYLESHEET SIZE, scaled once),
 * then a check at that size: Inter's opsz axis makes smaller text relatively wider, so the scaled
 * text can still overflow, and an ellipsis is reserved for names past the 14px floor (UX-068). Each
 * pass scales by box / width, at most NAME_MAX_PASSES, always flooring to 0.1px.
 * @param {Probe} probe
 * @param {{text: string, buttonClass: string, basePx: number, room: number}} spec  the live name's
 *   text; its button's classes, so a kbd name measures as kbd; the stylesheet's font size for the
 *   Title line; and the live name's box width
 * @returns {string}
 */
function measureNameSize(probe, spec) {
  const { text, buttonClass, basePx, room } = spec;
  probe.button.className = buttonClass;
  probe.name.style.fontSize = "";
  probe.name.textContent = text;
  const naturalWidth = widthOf(probe.name);
  if (naturalWidth <= room) {
    return "";
  }
  let size = clampName((basePx * room) / naturalWidth);
  for (let pass = 0; pass < NAME_MAX_PASSES && size > NAME_MIN_PX; pass += 1) {
    probe.name.style.fontSize = `${size}px`;
    const width = widthOf(probe.name);
    if (width <= room) {
      break;
    }
    size = clampName((size * room) / width);
  }
  return `${size}px`;
}

/**
 * The inline font-size a live Title line needs, from the cache when its key is unchanged. The result
 * depends on the text, the box, the grid mode and the button's classes only, never on the size now
 * showing. Returns null for a line that is not laid out (width 0), which is left alone. `state.probe`
 * is opened on the first miss.
 * @param {HTMLElement} name  the live Title line
 * @param {boolean} half
 * @param {number} basePx
 * @param {{probe: Probe|null}} state
 * @returns {string|null}
 */
function wantedNameSize(name, half, basePx, state) {
  // The fractional box, not clientWidth: clientWidth rounds, so a 167.656px box reads 168 and accepts
  // a 167.969px name that CSS then ellipsizes. No transform sits on the name, so this is its layout
  // width.
  const room = name.getBoundingClientRect().width;
  if (room === 0) {
    return null;
  }
  const text = name.textContent ?? "";
  const buttonClass = name.closest("button")?.className ?? "pc";
  const key = `${fontEpoch}|${half}|${buttonClass}|${room}|${text}`;
  const cached = sizeCache.get(name);
  if (cached?.key === key) {
    return cached.want;
  }
  state.probe ??= openProbe(half);
  if (!state.probe) {
    return null;
  }
  const want = measureNameSize(state.probe, { text, buttonClass, basePx, room });
  sizeCache.set(name, { key, want });
  return want;
}

/**
 * One-line names: shrinks a long name's font until it fits, down to 14px; past that, CSS ends it in an
 * ellipsis. Writes a size only when it differs from the one showing.
 * The hidden probe is a twin of the card markup (same classes, so the same stylesheet font and size),
 * placed on the body outside the cards, and removed before the function returns, so it never paints.
 * @param {HTMLElement} cards
 * @param {boolean} half  true in the eight-slot grid, where the stylesheet sets 20px instead of 24px
 * @param {number} basePx  the stylesheet's font size for the Title line
 * @returns {void}
 */
function fitNames(cards, half, basePx) {
  /** @type {{probe: Probe|null}} */
  const state = { probe: null };
  try {
    for (const name of cards.querySelectorAll("b")) {
      const want = wantedNameSize(name, half, basePx, state);
      // Exact, with no tolerance: sizes are floored to 0.1px, so one 0.1px step is a real correction
      // (19.4px ellipsizes a name that fits at 19.3px), and the cache already stops repeat writes.
      if (want !== null && name.style.fontSize !== want) {
        name.style.fontSize = want;
      }
    }
  } finally {
    state.probe?.root.remove();
  }
}

/**
 * True when the overview has more slots than four full ones; the GO TO KEYBOARD slot counts as one.
 * @param {number} slots
 * @returns {boolean}
 */
function isHalf(slots) {
  return slots > FULL_SLOTS;
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
  // `half` comes from the slot count here, as in the mock, so the markup already carries the class
  // that fitCards would set and a morph never strips it (UX-110).
  const slots = rest.length + Math.min(red.length, 1);
  let html = '<div class="cards">';
  if (isHalf(slots)) {
    html = '<div class="cards half">';
  }
  if (red.length > 0) {
    html += renderKeyboard(red);
  }
  for (const card of rest) {
    html += renderCard(card);
  }
  return `${html}</div>`;
}

/**
 * The overview's slot key, for morph()'s keyOf (UX-135): a card's `data-go`, which is CardView.key,
 * and one fixed key for the GO TO KEYBOARD slot. That slot's `data-go` follows the first red card, so
 * keying it by `data-go` would turn the card that just went red into the slot instead of letting the
 * slot arrive as a new node. Anything that is not a slot has no key.
 * @param {Element} el
 * @returns {string|null}
 */
export function slotKey(el) {
  if (!el.classList.contains("pc")) {
    return null;
  }
  if (el.classList.contains("kbd")) {
    return KBD_KEY;
  }
  return el.getAttribute("data-go");
}

/**
 * Tells fitCards that a font finished loading, so its next run measures every name again instead of
 * keeping a size taken in the fallback font. The controller calls it, then fits once more.
 * @returns {void}
 */
export function fontsLoaded() {
  fontEpoch += 1;
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
  const half = isHalf(cards.children.length);
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
  fitNames(cards, half, basePx);
}
