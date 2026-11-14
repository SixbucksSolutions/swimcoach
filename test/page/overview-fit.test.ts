import { afterEach, describe, expect, it, vi } from "vitest";
import { fitCards } from "../../public/js/overview.js";

// fitCards (public/js/overview.js) reads layout and writes styles, so it runs against stand-ins for
// the few DOM members it touches. Every stand-in counts its writes, which is what UX-110 is about:
// a poll over unchanged data MUST mutate nothing. Real layout (the numbers a browser measures) is
// the visual reviewer's job; these tests prove the arithmetic and the write discipline.

/** The one class: fitCards checks `instanceof HTMLElement`, so the stand-ins inherit from this. */
class FakeHtmlElement {}

/** A Title line whose text is `naturalWidth` px wide at the stylesheet's size `base`, in a `room` px box. */
function fakeName(naturalWidth: number, room: number, base = 24) {
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
    naturalWidth,
    clientWidth: room,
    base,
    writes,
    style,
  });
}

type FakeName = ReturnType<typeof fakeName>;

/** A `.cards` grid of `count` children holding the given Title lines. */
function fakeCards(count: number, names: FakeName[] = []) {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
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

/** Installs the globals fitCards reads. */
function installDom(): void {
  vi.stubGlobal("HTMLElement", FakeHtmlElement);
  vi.stubGlobal("getComputedStyle", (el: Partial<FakeName>) => {
    const showing = el.style?.fontSize || el.base;
    return { fontSize: `${showing ?? 16}px`, paddingTop: "0px", paddingBottom: "0px" };
  });
  vi.stubGlobal("document", {
    createRange: () => {
      let target: FakeName | null = null;
      return {
        selectNodeContents: (el: FakeName): void => {
          target = el;
        },
        getBoundingClientRect: (): { width: number } => {
          const showing = Number.parseFloat(target?.style.fontSize || String(target?.base));
          return { width: ((target?.naturalWidth ?? 0) * showing) / (target?.base ?? 24) };
        },
      };
    },
  });
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
});

describe("fitCards: one-line names", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shrinks a long name to fit, and to 14px at the least", () => {
    installDom();
    const fits = fakeName(150, 200);
    const long = fakeName(300, 200);
    const huge = fakeName(2000, 200);
    run(fakePage(800, fakeCards(3, [fits, long, huge])));
    expect([fits.style.fontSize, long.style.fontSize, huge.style.fontSize]).toEqual([
      "",
      "16px",
      "14px",
    ]);
  });

  it("measures from the 20px stylesheet size in half slots", () => {
    installDom();
    const long = fakeName(250, 200, 20);
    run(fakePage(800, fakeCards(5, [long])));
    expect(long.style.fontSize).toBe("16px");
  });

  it("clears a shrunken size once the name fits again", () => {
    installDom();
    const shrunk = fakeName(150, 200);
    shrunk.style.fontSize = "16px";
    run(fakePage(800, fakeCards(3, [shrunk])));
    expect(shrunk.style.fontSize).toBe("");
  });

  it("leaves a name alone when its page is not laid out", () => {
    installDom();
    const hidden = fakeName(300, 0);
    run(fakePage(800, fakeCards(3, [hidden])));
    expect(hidden.writes).toEqual([]);
  });

  it("writes nothing on a second call over unchanged data (UX-110)", () => {
    installDom();
    const long = fakeName(300, 200);
    const cards = fakeCards(5, [long, fakeName(100, 200)]);
    const page = fakePage(800, cards);
    run(page);
    const before = [cards.writes.length, long.writes.length];
    run(page);
    expect([cards.writes.length, long.writes.length]).toEqual(before);
    expect(before[0]).toBeGreaterThan(0);
  });
});
