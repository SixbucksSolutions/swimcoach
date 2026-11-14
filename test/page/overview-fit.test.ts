import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Dom,
  type FakeName,
  fakeCards,
  fakeName,
  fakePage,
  installDom,
  mockSize,
  run,
  widthAt,
} from "./fit-stand-ins.ts";

// fitCards (public/js/overview.js), against the stand-ins in fit-stand-ins.ts.

const LONG_NAME = "mobile-onboarding-redesign";

describe("fitCards: the 4/8 slot grid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing on a page with no cards", () => {
    installDom();
    expect(() => {
      run(fakePage(800, null));
    }).not.toThrow();
  });

  it("uses four slots up to four cards: the screen share, and the grid is not half", () => {
    installDom();
    const cards = fakeCards(4);
    run(fakePage(800, cards));
    expect(cards.props["--slot"]).toBe("192.50px");
    expect(cards.classes.has("half")).toBe(false);
  });

  it("uses eight half slots from five cards", () => {
    installDom();
    const cards = fakeCards(5);
    run(fakePage(800, cards));
    expect(cards.props["--slot"]).toBe("91.25px");
    expect(cards.classes.has("half")).toBe(true);
  });

  it("never goes below the content minimum, so a short screen scrolls", () => {
    installDom();
    const full = fakeCards(2);
    run(fakePage(100, full));
    expect(full.props["--slot"]).toBe("101.70px");
    const half = fakeCards(9);
    run(fakePage(100, half));
    expect(half.props["--slot"]).toBe("83.50px");
  });

  it("writes no class when the markup already carries the right one", () => {
    installDom();
    const cards = fakeCards(5, [], true);
    run(fakePage(800, cards));
    expect(cards.writes.filter((w) => w.startsWith("class"))).toEqual([]);
  });
});

describe("fitCards: one-line names", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves a fitting name alone and floors a huge one at 14px", () => {
    installDom();
    const fits = fakeName("ab", 200);
    const huge = fakeName(LONG_NAME.repeat(5), 100);
    run(fakePage(800, fakeCards(3, [fits, huge])));
    expect([fits.style.fontSize, huge.style.fontSize]).toEqual(["", "14px"]);
  });

  it("corrects the one-shot size when the scaled text still overflows (UX-068)", () => {
    installDom();
    const long = fakeName(LONG_NAME, 252);
    run(fakePage(800, fakeCards(3, [long])));
    const oneShot = Number.parseFloat(mockSize(24, 252, widthAt(LONG_NAME, 24)));
    const size = Number.parseFloat(long.style.fontSize);
    expect(widthAt(LONG_NAME, oneShot)).toBeGreaterThan(252);
    expect(size).toBeLessThan(oneShot);
    expect(widthAt(LONG_NAME, size)).toBeLessThanOrEqual(252);
  });

  it("measures from the 20px stylesheet size in half slots, and the result fits", () => {
    installDom();
    const long = fakeName(LONG_NAME, 200);
    run(fakePage(800, fakeCards(5, [long], true)));
    const size = Number.parseFloat(long.style.fontSize);
    expect(size).toBeLessThanOrEqual(Number.parseFloat(mockSize(20, 200, widthAt(LONG_NAME, 20))));
    expect(widthAt(LONG_NAME, size)).toBeLessThanOrEqual(200);
  });

  it("clears a shrunken size once the name fits again", () => {
    installDom();
    const shrunk = fakeName("ab", 200);
    shrunk.style.fontSize = "16px";
    run(fakePage(800, fakeCards(3, [shrunk])));
    expect(shrunk.style.fontSize).toBe("");
  });

  it("leaves a name alone when its page is not laid out", () => {
    installDom();
    const hidden = fakeName(LONG_NAME, 0);
    run(fakePage(800, fakeCards(3, [hidden])));
    expect(hidden.writes).toEqual([]);
  });
});

describe("fitCards: an unchanged poll does no DOM work (UX-110)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Everything a fit can touch or measure, as one comparable list. */
  function tally(dom: Dom, cards: ReturnType<typeof fakeCards>, names: FakeName[]): number[] {
    const writes = names.map((n) => n.writes.length);
    return [dom.appended, dom.removed, dom.measured, cards.writes.length, ...writes];
  }

  it("a second identical fit adds no probe, measures nothing and writes nothing", () => {
    const dom = installDom();
    const names = [
      fakeName(LONG_NAME, 252),
      fakeName("ab", 252),
      fakeName(LONG_NAME.repeat(5), 100),
    ];
    const cards = fakeCards(3, names);
    const page = fakePage(800, cards);
    run(page);
    const first = tally(dom, cards, names);
    expect(first[0]).toBe(1);
    run(page);
    run(page);
    expect(tally(dom, cards, names)).toEqual(first);
  });

  it("measures again when the box width or the text changes", () => {
    const dom = installDom();
    const long = fakeName(LONG_NAME, 252);
    const page = fakePage(800, fakeCards(3, [long]));
    run(page);
    const { measured } = dom;
    long.clientWidth = 200;
    run(page);
    const afterWidth = dom.measured;
    long.textContent = `${LONG_NAME}-x`;
    run(page);
    expect([afterWidth > measured, dom.measured > afterWidth]).toEqual([true, true]);
  });

  it("opens the probe only on a miss, and removes it afterward", () => {
    const dom = installDom();
    const long = fakeName(LONG_NAME, 252);
    run(fakePage(800, fakeCards(3, [long])));
    expect([dom.appended, dom.removed]).toEqual([1, 1]);
    expect(long.writes).toHaveLength(1);
  });
});
