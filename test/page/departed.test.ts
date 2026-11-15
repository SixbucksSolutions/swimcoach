// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import { cancelDeparture, depart, departedKey, endDeparture } from "../../public/js/departed.js";
import { dotsHtml } from "../../public/js/nav.js";
import { toView } from "../../public/js/state.js";

// A project display that leaves the board while on screen (public/js/departed.js; localswim #0037):
// it is marked once, counts down, and comes back to life if its project returns. The page dots keep a
// dimmed dot for it, written in the order syncDots() leaves the live class, so a poll during the
// countdown rewrites nothing.

const KEY = '["bravo","t01"]';

/** A project display section with a title, as nav.js draws one. */
function section(): HTMLElement {
  const el = document.createElement("section");
  el.className = "page";
  el.dataset.key = KEY;
  el.innerHTML = '<button class="back">&lsaquo; All projects</button><h2>bravo T01</h2><p>Body</p>';
  document.body.append(el);
  return el;
}

describe("a departed display (localswim #0037)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Object.defineProperty(Element.prototype, "animate", {
      value: () => new EventTarget(),
      configurable: true,
    });
  });
  afterEach(() => {
    endDeparture();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is marked once: one notice, however many draws land during the countdown", () => {
    const el = section();
    const back = vi.fn();
    depart(el, KEY, back);
    depart(el, KEY, back);
    expect(el.classList.contains("departed")).toBe(true);
    expect(el.querySelectorAll(".gone-note")).toHaveLength(1);
    expect(el.querySelector(".gone-note")?.textContent).toBe(
      "bravo T01 is off the board · back to all projects in 5 s",
    );
    expect(departedKey()).toBe(KEY);
  });

  it("counts down each second and takes the viewer back after 5 s", () => {
    const el = section();
    const back = vi.fn();
    depart(el, KEY, back);
    vi.advanceTimersByTime(2000);
    expect(el.querySelector(".gone-note b")?.textContent).toBe("3");
    expect(back).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("comes back to life when its project returns: no notice, no dimming, no return", () => {
    const el = section();
    const back = vi.fn();
    depart(el, KEY, back);
    cancelDeparture();
    expect(el.classList.contains("departed")).toBe(false);
    expect(el.querySelector(".gone-note")).toBeNull();
    expect(departedKey()).toBeNull();
    vi.advanceTimersByTime(6000);
    expect(back).not.toHaveBeenCalled();
  });
});

describe("the page dots with a departed display (localswim #0037)", () => {
  it("keep a dimmed dot at its place, gone before on, as syncDots() leaves the live class", () => {
    const view = toView(afternoon);
    const host = document.createElement("div");
    host.innerHTML = dotsHtml(view, 2, 2);
    const buttons = [...host.children];
    expect(buttons).toHaveLength(view.cards.length + 2);
    const [, , live] = buttons;
    expect(live?.getAttribute("class")).toBe("gone on");
    expect(live?.getAttribute("aria-label")).toBe("Off the board");
    live?.classList.remove("on");
    live?.classList.add("on");
    expect(live?.getAttribute("class")).toBe("gone on");
  });
});
