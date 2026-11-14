import { vi } from "vitest";
import { fitCards } from "../../public/js/overview.js";

// Stand-ins for the few DOM members fitCards (public/js/overview.js) touches, so its tests run under
// plain Node. Every stand-in counts its writes, which is what UX-110 is about: a poll over unchanged
// data MUST mutate nothing. Real layout (the numbers a browser measures) is the visual reviewer's job;
// the tests prove the arithmetic and the write discipline.
//
// Text width is NOT proportional to font size here, on purpose: Inter's opsz axis makes it so in
// Chromium (about 2.6 percent per px across 14 to 24px). A stand-in that scales linearly cannot see
// a measurement taken at the wrong size.

/** The one class: fitCards checks `instanceof HTMLElement`, so the stand-ins inherit from this. */
class FakeHtmlElement {}

/** Width of `text` at `size` px: 0.5 * length * size^0.97, so it is not linear in size. */
export function widthAt(text: string, size: number): number {
  return 0.5 * text.length * size ** 0.97;
}

/** The mock's one-shot formula (mocks/index.html 462), given the width AT the stylesheet size. */
export function mockSize(base: number, room: number, natural: number): string {
  if (natural <= room) {
    return "";
  }
  return `${Math.max(14, Math.floor(((base * room) / natural) * 10) / 10)}px`;
}

/**
 * A Title line holding `text`, in a box `room` px wide. Set `width` to resize the box. As in a
 * browser, getBoundingClientRect() gives the fractional width and clientWidth the rounded one, so a
 * fit that read clientWidth would be caught by a fractional box.
 */
export function fakeName(text: string, room: number) {
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
  const name = Object.assign(new FakeHtmlElement(), {
    textContent: text,
    width: room,
    writes,
    style,
    closest: () => ({ className: "pc" }),
    getBoundingClientRect: (): { width: number } => ({ width: name.width }),
  });
  Object.defineProperty(name, "clientWidth", { get: () => Math.round(name.width) });
  return name;
}

export type FakeName = ReturnType<typeof fakeName>;

/** A `.cards` grid of `count` children holding the given Title lines; `half` is its starting class. */
export function fakeCards(count: number, names: FakeName[] = [], half = false) {
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
export function fakePage(height: number, cards: ReturnType<typeof fakeCards> | null) {
  return Object.assign(new FakeHtmlElement(), { clientHeight: height, querySelector: () => cards });
}

export interface Dom {
  appended: number;
  removed: number;
  /** Width measurements taken: zero on a cache hit. */
  measured: number;
}

/** Installs the globals fitCards reads, with a probe that measures at the stylesheet size. */
export function installDom(): Dom {
  const dom: Dom = { appended: 0, removed: 0, measured: 0 };
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
      const probeName = { textContent: "", style: { fontSize: "" } };
      const probeButton = { className: "" };
      const probe = {
        className: "",
        style: { cssText: "" },
        // biome-ignore lint/style/useNamingConvention: innerHTML is the DOM's own property name.
        innerHTML: "",
        querySelector: (selector: string) => {
          if (selector === "button") {
            return probeButton;
          }
          return probeName;
        },
        remove: (): void => {
          dom.removed += 1;
        },
      };
      lastProbe = probe;
      return probe;
    },
    createRange: () => {
      let target: { textContent: string; style: { fontSize: string } } | null = null;
      return {
        selectNodeContents: (el: { textContent: string; style: { fontSize: string } }): void => {
          target = el;
        },
        getBoundingClientRect: (): { width: number } => {
          dom.measured += 1;
          let size = 24;
          if (lastProbe.className.includes("half")) {
            size = 20;
          }
          if (target?.style.fontSize) {
            size = Number.parseFloat(target.style.fontSize);
          }
          return { width: widthAt(target?.textContent ?? "", size) };
        },
      };
    },
  });
  return dom;
}

/** Runs fitCards on a stand-in page. */
export function run(page: ReturnType<typeof fakePage>): void {
  fitCards(page as unknown as HTMLElement);
}
