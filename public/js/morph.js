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
 * Makes live's children match next's, slot by slot.
 * @param {Node} live
 * @param {Node} next
 */
function syncChildren(live, next) {
  const wanted = [...next.childNodes];
  for (const [i, want] of wanted.entries()) {
    const have = live.childNodes[i];
    if (have === undefined) {
      live.appendChild(want);
    } else if (!sameSlot(have, want)) {
      live.replaceChild(want, have);
    } else if (have instanceof Element && want instanceof Element) {
      syncAttributes(have, want);
      syncChildren(have, want);
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
 * tag and attributes) is left alone.
 * @param {Element} target
 * @param {string} html
 */
export function morph(target, html) {
  const template = target.ownerDocument.createElement("template");
  template.innerHTML = html;
  syncChildren(target, template.content);
}
