// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import { morph } from "../../public/js/morph.js";
import { dotsHtml } from "../../public/js/nav.js";
import { toView } from "../../public/js/state.js";

// morph() (public/js/morph.js): a poll changes only the values that changed (UX-110). The check the
// ledger names is a MutationObserver: unchanged nodes stay untouched.

let host: HTMLElement;
let observer: MutationObserver;

beforeEach(() => {
  document.body.innerHTML = '<main id="host" class="page" data-key="k"></main>';
  host = document.querySelector("#host") as HTMLElement;
  observer = new MutationObserver(() => undefined);
});

/** Starts recording every change under host. */
function watch(): void {
  observer.observe(host, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
  });
}

/** Stops recording and returns what changed. */
function changes(): MutationRecord[] {
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}

function $(selector: string): HTMLElement {
  const el = host.querySelector(selector);
  if (el === null) {
    throw new Error(`no ${selector}`);
  }
  return el as HTMLElement;
}

/** A card-like fragment: a name, a blurb, a styled bar, an SVG and an entity. */
function card(word: string, width: number): string {
  return (
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    '<div class="cards"><button class="pc green" data-go="a"><div class="nm"><b>FGA T04</b>' +
    `<span>${word}</span></div></button></div>` +
    `<div class="meter" style="--c:var(--ok)"><div class="bar"><i style="width:${width}%"></i></div></div>` +
    '<svg viewBox="0 0 24 24" role="img" aria-label="Up"><path d="M4 12h15"/></svg>' +
    "<p>Waiting&hellip;</p>"
  );
}

describe("morph on unchanged markup", () => {
  it("builds the markup into an empty target", () => {
    morph(host, card("On time", 40));
    const parsed = document.createElement("div");
    parsed.innerHTML = card("On time", 40);
    expect(host.innerHTML).toBe(parsed.innerHTML);
    expect($("p").textContent).toBe(`Waiting${String.fromCharCode(8230)}`);
  });

  it("changes nothing when the markup is unchanged (UX-110)", () => {
    morph(host, card("On time", 40));
    watch();
    morph(host, card("On time", 40));
    expect(changes()).toEqual([]);
  });

  it("leaves the target's own tag and attributes alone", () => {
    watch();
    morph(host, card("On time", 40));
    expect(changes().filter((r) => r.target === host && r.type === "attributes")).toEqual([]);
    expect([host.id, host.className, host.dataset.key]).toEqual(["host", "page", "k"]);
  });

  it("keeps a style the page set at run time where the markup sets none (fitNames)", () => {
    morph(host, card("On time", 40));
    $(".nm b").style.fontSize = "15.5px";
    $(".cards").style.setProperty("--slot", "190.25px");
    watch();
    morph(host, card("Toss-up", 40));
    expect(changes().filter((r) => r.attributeName === "style")).toEqual([]);
    expect($(".nm b").style.fontSize).toBe("15.5px");
    expect($(".cards").style.getPropertyValue("--slot")).toBe("190.25px");
  });
});

describe("morph on changed markup", () => {
  it("rewrites only a changed text, and keeps every element", () => {
    morph(host, card("On time", 40));
    const [button, name] = [$("button"), $(".nm b")];
    watch();
    morph(host, card("Toss-up", 40));
    expect(changes().map((r) => r.type)).toEqual(["characterData"]);
    expect($(".nm span").textContent).toBe("Toss-up");
    expect([$("button"), $(".nm b")]).toEqual([button, name]);
  });

  it("rewrites only a changed attribute", () => {
    morph(host, card("On time", 40));
    const bar = $(".bar i");
    watch();
    morph(host, card("On time", 55));
    expect(changes().map((r) => [r.type, r.attributeName, r.oldValue])).toEqual([
      ["attributes", "style", "width:40%"],
    ]);
    expect($(".bar i")).toBe(bar);
    expect(bar.getAttribute("style")).toBe("width:55%");
  });

  it("removes an attribute the new markup dropped", () => {
    morph(host, '<button class="pc red" data-go="a" disabled>x</button>');
    morph(host, '<button class="pc red" data-go="a">x</button>');
    expect($("button").hasAttribute("disabled")).toBe(false);
  });

  it("keeps SVG in its namespace with its attribute case", () => {
    morph(host, card("On time", 40));
    const svg = $("svg");
    expect([svg.namespaceURI, svg.getAttribute("viewBox")]).toEqual([
      "http://www.w3.org/2000/svg",
      "0 0 24 24",
    ]);
    watch();
    morph(host, card("On time", 40).replace('aria-label="Up"', 'aria-label="Flat"'));
    expect(changes().map((r) => r.attributeName)).toEqual(["aria-label"]);
    expect($("svg")).toBe(svg);
  });
});

describe("morph on changed structure", () => {
  it("replaces a node whose tag changed, and only that node", () => {
    morph(host, "<h2>A</h2><p>B</p><p>C</p>");
    const [h2, , last] = host.children;
    morph(host, "<h2>A</h2><div>B</div><p>C</p>");
    expect(host.innerHTML).toBe("<h2>A</h2><div>B</div><p>C</p>");
    expect([host.children[0], host.children[2]]).toEqual([h2, last]);
  });

  it("appends new children and removes extra ones", () => {
    morph(host, "<li>1</li><li>2</li>");
    const [one] = host.children;
    morph(host, "<li>1</li><li>2</li><li>3</li>");
    expect(host.children).toHaveLength(3);
    morph(host, "<li>1</li>");
    expect(host.innerHTML).toBe("<li>1</li>");
    expect(host.children[0]).toBe(one);
    morph(host, "");
    expect(host.childNodes).toHaveLength(0);
  });

  it("swaps a text node for an element at the same position", () => {
    morph(host, "<b>x</b>tail");
    morph(host, "<b>x</b><i>tail</i>");
    expect(host.innerHTML).toBe("<b>x</b><i>tail</i>");
  });
});

describe("the page dots through morph", () => {
  it("rewrite nothing when the viewer stays on the same display", () => {
    const view = toView(afternoon);
    morph(host, dotsHtml(view, 3));
    watch();
    morph(host, dotsHtml(view, 3));
    expect(changes()).toEqual([]);
    const on = [...host.children].map((b) => b.classList.contains("on"));
    expect(on).toEqual([false, false, false, true, false, false, false]);
  });

  it("label each dot with its display, escaped", () => {
    const view = toView(afternoon);
    const [first] = view.cards;
    if (first === undefined) {
      throw new Error("the afternoon example has cards");
    }
    morph(host, dotsHtml({ ...view, cards: [{ ...first, title: 'A "B" <C>' }] }, 0));
    const labels = [...host.children].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["All projects", 'A "B" <C>']);
  });
});
