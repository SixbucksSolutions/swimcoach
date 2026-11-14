// @ts-check
// A poll changes only the values that changed (UX-110; concept.md section 3.4). The renderers return
// HTML strings; morph() parses one into an inert template and walks it beside the live DOM, by
// position and tag. A node that matches keeps its identity, its scroll position and its running
// animations, and is written to only where an attribute or a text differs. A node that does not
// match is replaced whole. So a poll that changed nothing mutates nothing.
//
// The `style` attribute has one exception, because two writers share it. Where the new markup sets
// `style`, morph() syncs it like any attribute (the renderers draw bar widths and colors that way).
// Where the new markup has no `style`, morph() leaves the live one alone: that one belongs to the page
// at run time, written by fitCards() and fitNames() (overview.js) and by the breathing sync (main.js).
//
// Matching by position is wrong for a list whose members come and go in the middle: the overview's
// cards. There a caller passes keyOf, and a child list whose every member has a key is matched by key
// instead, so a new card is the one new node and every other card keeps its node (UX-135).

/** @typedef {(el: Element) => string|null} KeyOf  an element's stable key, or null for none */

/**
 * Two nodes are the same slot when they are the same kind of node with the same tag and namespace.
 * @param {Node} live
 * @param {Node} next
 * @returns {boolean}
 */
function sameSlot(live, next) {
  if (live.nodeType !== next.nodeType || live.nodeName !== next.nodeName) {
    return false;
  }
  if (live instanceof Element && next instanceof Element) {
    return live.namespaceURI === next.namespaceURI;
  }
  return true;
}

/**
 * Writes only the attributes that differ, and removes those the new markup dropped.
 * @param {Element} live
 * @param {Element} next
 */
function syncAttributes(live, next) {
  for (const { name, value } of next.attributes) {
    if (live.getAttribute(name) !== value) {
      live.setAttribute(name, value);
    }
  }
  for (const { name } of [...live.attributes]) {
    if (name !== "style" && !next.hasAttribute(name)) {
      live.removeAttribute(name);
    }
  }
}

/**
 * A child list's keys, when every child is an element with a key of its own and no two share one;
 * otherwise null, and the list is matched by position.
 * @param {Node[]} nodes
 * @param {KeyOf|undefined} keyOf
 * @returns {string[]|null}
 */
function keysOf(nodes, keyOf) {
  if (keyOf === undefined || nodes.length === 0) {
    return null;
  }
  /** @type {string[]} */
  const keys = [];
  for (const node of nodes) {
    if (!(node instanceof Element)) {
      return null;
    }
    const key = keyOf(node);
    if (key === null) {
      return null;
    }
    keys.push(key);
  }
  if (new Set(keys).size !== keys.length) {
    return null;
  }
  return keys;
}

/**
 * The keyed live children of a list, first of each key.
 * @param {Node} live
 * @param {KeyOf} keyOf
 * @returns {Map<string, Element>}
 */
function poolOf(live, keyOf) {
  /** @type {Map<string, Element>} */
  const pool = new Map();
  const elements = [...live.childNodes].filter((child) => child instanceof Element);
  for (const child of elements) {
    const key = keyOf(child);
    if (key !== null && !pool.has(key)) {
      pool.set(key, child);
    }
  }
  return pool;
}

/**
 * Makes live's children match next's by key: a live child whose key is still wanted keeps its node
 * and is moved into place only if it is out of place; a wanted key with no live child is inserted
 * whole; a live child whose key went away is removed. So a card inserted mid-list leaves every other
 * card node untouched (UX-135), where matching by position would rewrite each card after it.
 * @param {Node} live
 * @param {Element[]} wanted
 * @param {string[]} keys   wanted's keys, in order
 * @param {KeyOf} keyOf
 */
function syncKeyed(live, wanted, keys, keyOf) {
  const pool = poolOf(live, keyOf);
  for (const [i, want] of wanted.entries()) {
    let node = pool.get(keys[i] ?? "");
    if (node !== undefined && sameSlot(node, want)) {
      syncAttributes(node, want);
      syncChildren(node, want, keyOf);
    } else {
      node = want;
    }
    if (live.childNodes[i] !== node) {
      live.insertBefore(node, live.childNodes[i] ?? null);
    }
  }
  while (live.childNodes.length > wanted.length) {
    live.lastChild?.remove();
  }
}

/**
 * Makes live's children match next's: by key where keyOf gives every wanted child one, else slot by
 * slot.
 * @param {Node} live
 * @param {Node} next
 * @param {KeyOf} [keyOf]
 */
function syncChildren(live, next, keyOf) {
  const wanted = [...next.childNodes];
  const keys = keysOf(wanted, keyOf);
  if (keys !== null && keyOf !== undefined) {
    syncKeyed(live, /** @type {Element[]} */ (wanted), keys, keyOf);
    return;
  }
  for (const [i, want] of wanted.entries()) {
    const have = live.childNodes[i];
    if (have === undefined) {
      live.appendChild(want);
    } else if (!sameSlot(have, want)) {
      live.replaceChild(want, have);
    } else if (have instanceof Element && want instanceof Element) {
      syncAttributes(have, want);
      syncChildren(have, want, keyOf);
    } else if (have.nodeValue !== want.nodeValue) {
      have.nodeValue = want.nodeValue;
    }
  }
  while (live.childNodes.length > wanted.length) {
    live.lastChild?.remove();
  }
}

/**
 * Makes target's children match the markup in html, touching only what differs. target itself (its
 * tag and attributes) is left alone. With keyOf, any child list whose every member has a key (and no
 * two share one) is matched by key rather than by position; see syncKeyed.
 * @param {Element} target
 * @param {string} html
 * @param {KeyOf} [keyOf]
 */
export function morph(target, html, keyOf) {
  const template = target.ownerDocument.createElement("template");
  template.innerHTML = html;
  syncChildren(target, template.content, keyOf);
}
