import { afterEach, describe, expect, it, vi } from "vitest";
import { fitCards } from "../../public/js/overview.js";

// fitCards (public/js/overview.js) reads layout and writes styles, so it runs against stand-ins for
// the few DOM members it touches. Every stand-in counts its writes, which is what UX-110 is about:
// a poll over unchanged data MUST mutate nothing. Real layout (the numbers a browser measures) is
// the visual reviewer's job; these tests prove the arithmetic and the write discipline.
//
// Text width is NOT proportional to font size here, on purpose: Inter's opsz axis makes it so in
// Chromium (about 2.6 percent per px across 14 to 24px). A stand-in that scales linearly cannot see
// a measurement taken at the wrong size.

/** The one class: fitCards checks `instanceof HTMLElement`, so the stand-ins inherit from this. */
class FakeHtmlElement {}

/** Width of `text` at `size` px: 0.5 * length * size^0.97, so it is not linear in size. */
function widthAt(text: string, size: number): number {
  return 0.5 * text.length * size ** 0.97;
}

/** The mock's formula (mocks/index.html 462), given the width AT the stylesheet size. */
function mockSize(base: number, room: number, natural: number): string {
  if (natural <= room) {
    return "";
  }
  return `${Math.max(14, Math.floor(((base * room) / natural) * 10) / 10)}px`;
}

/** A Title line holding `text`, in a box `room` px wide. */
function fakeName(text: string, room: number) {
  const writes: string[] = [];
  const style = new Proxy(
    { fontSize: "" },
    {
      set(target, prop, value) {
        writes.push(String(value));
        return Reflect.set(target, prop, value);
      },
    },
  );
  return Object.assign(new FakeHtmlElement(), {
    textContent: text,
    clientWidth: room,
    writes,
    style,
  });
}

type FakeName = ReturnType<typeof fakeName>;

/** A `.cards` grid of `count` children holding the given Title lines; `half` is its starting class. */
function fakeCards(count: number, names: FakeName[] = [], half = false) {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
  if (half) {
    classes.add("half");
  }
  const writes: string[] = [];
  return Object.assign(new FakeHtmlElement(), {
    children: Array.from({ length: count }, () => ({})),
    querySelectorAll: () => names,
    writes,
    classes,
    props,
    style: {
      getPropertyValue: (name: string): string => props[name] ?? "",
      setProperty: (name: string, value: string): void => {
        props[name] = value;
        writes.push(`${name}=${value}`);
      },
    },
    classList: {
      contains: (c: string): boolean => classes.has(c),
      toggle: (c: string, force: boolean): void => {
        if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
        writes.push(`class ${c}=${force}`);
      },
    },
  });
}

/** A page `height` px tall, holding the grid (or none). */
function fakePage(height: number, cards: ReturnType<typeof fakeCards> | null) {
  return Object.assign(new FakeHtmlElement(), { clientHeight: height, querySelector: () => cards });
}

interface Dom {
  appended: number;
  removed: number;
}

/** Installs the globals fitCards reads, with a probe that measures at the stylesheet size. */
function installDom(): Dom {
  const dom: Dom = { appended: 0, removed: 0 };
  let lastProbe = { className: "" };
  vi.stubGlobal("HTMLElement", FakeHtmlElement);
  vi.stubGlobal("getComputedStyle", () => ({ paddingTop: "0px", paddingBottom: "0px" }));
  vi.stubGlobal("document", {
    body: {
      append: (): void => {
        dom.appended += 1;
      },
    },
    createElement: () => {
      const probeName = { textContent: "" };
      const probe = {
        className: "",
        style: { cssText: "" },
        // biome-ignore lint/style/useNamingConvention: innerHTML is the DOM's own property name.
        innerHTML: "",
        querySelector: () => probeName,
        remove: (): void => {
          dom.removed += 1;
        },
      };
      lastProbe = probe;
      return probe;
    },
    createRange: () => {
      let target: { textContent: string } | null = null;
      return {
        selectNodeContents: (el: { textContent: string }): void => {
          target = el;
        },
        getBoundingClientRect: (): { width: number } => {
          let base = 24;
          if (lastProbe.className.includes("half")) {
            base = 20;
          }
          return { width: widthAt(target?.textContent ?? "", base) };
        },
      };
    },
  });
  return dom;
}

/** Runs fitCards on a stand-in page. */
function run(page: ReturnType<typeof fakePage>): void {
  fitCards(page as unknown as HTMLElement);
}

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
  const Long = "mobile-onboarding-redesign";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sizes by the mock's formula from the width at the stylesheet size", () => {
    installDom();
    const fits = fakeName("ab", 200);
    const long = fakeName(Long, 252);
    const huge = fakeName(Long.repeat(5), 100);
    run(fakePage(800, fakeCards(3, [fits, long, huge])));
    expect(fits.style.fontSize).toBe("");
    expect(long.style.fontSize).toBe(mockSize(24, 252, widthAt(Long, 24)));
    expect(huge.style.fontSize).toBe("14px");
  });

  it("measures from the 20px stylesheet size in half slots", () => {
    installDom();
    const long = fakeName(Long, 150);
    run(fakePage(800, fakeCards(5, [long], true)));
    expect(long.style.fontSize).toBe(mockSize(20, 150, widthAt(Long, 20)));
  });

  it("is idempotent: a second fit writes nothing, though width is not linear in size", () => {
    installDom();
    const long = fakeName(Long, 252);
    const cards = fakeCards(3, [long]);
    const page = fakePage(800, cards);
    run(page);
    const size = long.style.fontSize;
    const before = [cards.writes.length, long.writes.length];
    run(page);
    run(page);
    expect([cards.writes.length, long.writes.length]).toEqual(before);
    expect(long.style.fontSize).toBe(size);
    expect(size).toBe(mockSize(24, 252, widthAt(Long, 24)));
  });
});

describe("fitCards: names, edge cases", () => {
  const Long = "mobile-onboarding-redesign";

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const hidden = fakeName(Long, 0);
    run(fakePage(800, fakeCards(3, [hidden])));
    expect(hidden.writes).toEqual([]);
  });

  it("measures on a probe outside the cards and removes it afterward", () => {
    const dom = installDom();
    const long = fakeName(Long, 252);
    run(fakePage(800, fakeCards(3, [long])));
    expect([dom.appended, dom.removed]).toEqual([1, 1]);
    expect(long.writes).toHaveLength(1);
  });
});
