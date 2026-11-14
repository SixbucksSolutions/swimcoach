import { vi } from "vitest";

// The page shell and the stand-ins the controller tests share (controller.test.ts and arrive.test.ts):
// a fetch that hands out queued answers, a font set, location.reload, reportError, element.animate and
// matchMedia, all on fake timers. No tests live here.

const SHELL = `<div id="phone"><header><h1><i id="brand"></i><span class="word">swim<span>coach</span></span></h1><span id="clock"></span><span id="health" class="wait"><i></i><b>&hellip;</b><span></span></span><button id="snd" type="button" aria-label="Alerts off"></button></header><div id="warn"></div><main id="pages"></main><nav id="dots"></nav></div>`;

type Spy = ReturnType<typeof vi.fn>;

let answers: unknown[] = [];
let fontListeners: (() => void)[] = [];
const realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

/** A fetch that hands out the queued answers in turn, the last one forever. */
function fakeFetch(): Promise<unknown> {
  let [next] = answers;
  if (answers.length > 1) {
    next = answers.shift();
  }
  if (next instanceof Error) {
    return Promise.reject(next);
  }
  if (next === "redirect") {
    return Promise.resolve({ type: "opaqueredirect", status: 0, ok: false });
  }
  if (typeof next === "number") {
    return Promise.resolve({ type: "basic", status: next, ok: false });
  }
  const reply = { type: "basic", status: 200, ok: true, json: () => Promise.resolve(next) };
  return Promise.resolve(reply);
}

/** Whether a change landed outside the status line's clock (see watchDocument). */
function outsideClock(record: MutationRecord): boolean {
  const clock = document.querySelector("#clock");
  return clock === null || !clock.contains(record.target);
}

export const T0 = 1_800_000_000_000; // the page clock, in ms, on a minute boundary
export const SEC = 1000;
export const OVERVIEW = "../../public/js/overview.js";

/** The stand-ins setUp() installs fresh for each test. */
export const stubs: {
  reload: Spy;
  reported: Spy;
  animate: Spy;
  fontFace: { status: string };
  reduceMotion: boolean;
} = {
  reload: vi.fn(),
  reported: vi.fn(),
  animate: vi.fn(),
  fontFace: { status: "loaded" },
  reduceMotion: false,
};

/** A font set holding one face (Inter) in the given state; fireLoadingDone() plays its event. */
export function installFonts(status: string): void {
  stubs.fontFace = { status };
  fontListeners = [];
  const face = stubs.fontFace;
  const set = {
    ready: Promise.resolve(),
    addEventListener: (_type: string, listener: () => void): void => {
      fontListeners.push(listener);
    },
    *[Symbol.iterator](): Generator<{ status: string }> {
      yield face;
    },
  };
  Object.defineProperty(document, "fonts", { value: set, configurable: true });
}

export function fireLoadingDone(): void {
  for (const listener of fontListeners) {
    listener();
  }
}

/** The same body with every time moved so its now is the page's now. */
export function fresh(body: Record<string, unknown>): Record<string, unknown> {
  const shift = Date.now() / 1000 - (body.now as number);
  const copy = structuredClone(body);
  copy.now = (copy.now as number) + shift;
  copy.last_report_at = (copy.last_report_at as number) + shift;
  for (const m of copy.milestones as { updated_at: number; last_move_at: number }[]) {
    m.updated_at += shift;
    m.last_move_at += shift;
  }
  return copy;
}

export async function loadPage(...queued: unknown[]): Promise<void> {
  answers = queued;
  vi.resetModules();
  document.documentElement.className = "loading";
  document.title = "";
  document.body.innerHTML = SHELL;
  await import("../../public/js/main.js");
  await vi.advanceTimersByTimeAsync(0);
}

/** Lets the reveal's two animation frames run. */
export async function revealed(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

/**
 * Records every change anywhere in the document; call the result to read them. Start it after the
 * one-time reveal (the `loading` class), which is the page load's change, not a poll's. The status
 * line's clock is left out: it is UX-110's one allowed writer, once a minute, and a 30 s poll steps
 * over a minute boundary every other time.
 */
export function watchDocument(): () => MutationRecord[] {
  // The records reach the callback after the test's awaits, so keep what it is handed.
  const seen: MutationRecord[] = [];
  const observer = new MutationObserver((records) => seen.push(...records));
  const all = { subtree: true, childList: true, attributes: true, characterData: true };
  observer.observe(document, all);
  return () => [...seen, ...observer.takeRecords()].filter(outsideClock);
}

export function $(selector: string): HTMLElement {
  return document.querySelector(selector) as HTMLElement;
}

export function sections(): string[] {
  return [...$("#pages").children].map((el) => (el as HTMLElement).dataset.key ?? "");
}

export function health(): [string, string | null, string | undefined] {
  return [$("#health").className, $("#health b").textContent, $("#phone").dataset.health];
}

/** The overview's slots (cards and the GO TO KEYBOARD slot), in order. */
export function slots(): Element[] {
  return [...document.querySelectorAll("#pages .pc")];
}

export function setUp(): void {
  vi.useFakeTimers({
    now: T0,
    toFake: ["Date", "setTimeout", "setInterval", "requestAnimationFrame"],
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  stubs.reload = vi.fn();
  vi.stubGlobal("location", { reload: stubs.reload });
  // Every browser the page targets has reportError (Safari 15.4 on); happy-dom does not.
  stubs.reported = vi.fn();
  vi.stubGlobal("reportError", stubs.reported);
  installFonts("loaded");
  sessionStorage.clear();
  // A card's fade-in (UX-135) goes through element.animate; record the calls and their elements.
  stubs.animate = vi.fn();
  Object.defineProperty(Element.prototype, "animate", { value: stubs.animate, configurable: true });
  stubs.reduceMotion = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: stubs.reduceMotion && query === "(prefers-reduced-motion: reduce)",
  }));
}

export function tearDown(): void {
  vi.doUnmock(OVERVIEW);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (realAnimate === undefined) {
    Reflect.deleteProperty(Element.prototype, "animate");
  } else {
    Object.defineProperty(Element.prototype, "animate", realAnimate);
  }
}
