// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import { toView } from "../../public/js/state.js";

// The controller (public/js/main.js and the modules it wires), loaded into the page shell with fetch
// and the font set stubbed: drawing, UX-110 on the whole document, late fonts, failed polls and
// sign-in failures.

const T0 = 1_800_000_000_000; // the page clock, in ms, on a minute boundary
const SEC = 1000;
const OVERVIEW = "../../public/js/overview.js";

const SHELL = `<div id="phone"><header><h1><i id="brand"></i><span class="word">swim<span>coach</span></span></h1><span id="clock"></span><span id="health" class="wait"><i></i><b>&hellip;</b><span></span></span><button id="snd" type="button" aria-label="Alerts off"></button></header><div id="warn"></div><main id="pages"></main><nav id="dots"></nav></div>`;

let answers: unknown[];
let reload: ReturnType<typeof vi.fn>;
let reported: ReturnType<typeof vi.fn>;
let fontFace: { status: string };
let fontListeners: (() => void)[];

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

/** A font set holding one face (Inter) in the given state; fireLoadingDone() plays its event. */
function installFonts(status: string): void {
  fontFace = { status };
  fontListeners = [];
  const face = fontFace;
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

function fireLoadingDone(): void {
  for (const listener of fontListeners) {
    listener();
  }
}

/** The same body with every time moved so its now is the page's now. */
function fresh(body: Record<string, unknown>): Record<string, unknown> {
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

async function loadPage(...queued: unknown[]): Promise<void> {
  answers = queued;
  vi.resetModules();
  document.documentElement.className = "loading";
  document.title = "";
  document.body.innerHTML = SHELL;
  await import("../../public/js/main.js");
  await vi.advanceTimersByTimeAsync(0);
}

/** Lets the reveal's two animation frames run. */
async function revealed(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

/**
 * Records every change anywhere in the document; call the result to read them. Start it after the
 * one-time reveal (the `loading` class), which is the page load's change, not a poll's.
 */
function watchDocument(): () => MutationRecord[] {
  // The records reach the callback after the test's awaits, so keep what it is handed.
  const seen: MutationRecord[] = [];
  const observer = new MutationObserver((records) => seen.push(...records));
  const all = { subtree: true, childList: true, attributes: true, characterData: true };
  observer.observe(document, all);
  return () => [...seen, ...observer.takeRecords()];
}

function $(selector: string): HTMLElement {
  return document.querySelector(selector) as HTMLElement;
}
function sections(): string[] {
  return [...$("#pages").children].map((el) => (el as HTMLElement).dataset.key ?? "");
}
function health(): [string, string | null, string | undefined] {
  return [$("#health").className, $("#health b").textContent, $("#phone").dataset.health];
}

function setUp(): void {
  vi.useFakeTimers({
    now: T0,
    toFake: ["Date", "setTimeout", "setInterval", "requestAnimationFrame"],
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  reload = vi.fn();
  vi.stubGlobal("location", { reload });
  // Every browser the page targets has reportError (Safari 15.4 on); happy-dom does not.
  reported = vi.fn();
  vi.stubGlobal("reportError", reported);
  installFonts("loaded");
  sessionStorage.clear();
}

function tearDown(): void {
  vi.doUnmock(OVERVIEW);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
}

describe("the controller draws the board", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("polls the dated state path with no-store, a manual redirect and a timeout", async () => {
    await loadPage(fresh(afternoon));
    const options = { cache: "no-store", redirect: "manual", signal: expect.any(AbortSignal) };
    expect(fetch).toHaveBeenCalledWith("/api/2026-11-13/state", expect.objectContaining(options));
  });

  it("draws one section per card in the server's order, the dots, the title and LIVE", async () => {
    await loadPage(fresh(afternoon));
    expect(sections()).toEqual(["*all*", ...toView(afternoon).cards.map((c) => c.key)]);
    const dots = [...$("#dots").children].map((b) => b.className);
    expect(dots).toEqual(["on", "", "", "", "", "", ""]);
    expect(document.title).toBe("(1) swimcoach");
    expect(health()).toEqual(["live", "LIVE", "live"]);
  });

  it("reveals the page once, after the first poll", async () => {
    await loadPage(fresh(afternoon));
    await vi.advanceTimersByTimeAsync(50);
    expect(document.documentElement.classList.contains("loading")).toBe(false);
  });

  it("adds and removes sections as milestones come and go", async () => {
    await loadPage(fresh(afternoon), fresh(keyboard));
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(sections()).toEqual(["*all*", ...toView(keyboard).cards.map((c) => c.key)]);
    expect(document.title).toBe("(2) swimcoach");
  });
});

describe("the controller on a steady board (UX-110)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("changes nothing anywhere in the document on a poll that brings the same board", async () => {
    await loadPage(fresh(afternoon));
    await revealed();
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(changes()).toEqual([]);
  });

  it("restarts the LIVE dot's breath through Web Animations, writing nothing", async () => {
    await loadPage(fresh(afternoon));
    const breath = { currentTime: 15_000, playState: "running", play: vi.fn() };
    Object.assign($("#health i"), { getAnimations: () => [breath] });
    await revealed();
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect([breath.currentTime, breath.play.mock.calls.length]).toEqual([0, 1]);
    expect(changes()).toEqual([]);
  });
});

describe("the controller when the font lands late (concept.md 3.4)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("fits the overview once more after the font, then a steady poll writes nothing", async () => {
    const fits = vi.fn();
    const bumps = vi.fn();
    vi.doMock(OVERVIEW, async (importOriginal) => {
      const real = await importOriginal<typeof import("../../public/js/overview.js")>();
      return {
        ...real,
        fitCards: (page: HTMLElement): void => {
          fits();
          real.fitCards(page);
        },
        fontsLoaded: (): void => {
          bumps();
          real.fontsLoaded();
        },
      };
    });
    installFonts("loading");
    await loadPage(fresh(afternoon));
    await revealed();
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([1, 1]);
    fireLoadingDone();
    // Still loading: nothing new to fit for.
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([1, 1]);
    fontFace.status = "loaded";
    fireLoadingDone();
    fireLoadingDone(); // a second event for the same load fits nothing more
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([2, 2]);
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(10 * SEC);
    // The steady poll fits again, from the cache: no new font state, no change.
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([3, 2]);
    expect(changes()).toEqual([]);
  });
});

describe("the controller on failed polls", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("turns OFFLINE after 30 s of failed polls, never SIGN IN", async () => {
    await loadPage(fresh(afternoon), new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(30 * SEC);
    expect(health()).toEqual(["live", "LIVE", "live"]);
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect($("#warn").textContent).toBe("Can't reach the board for 1m. Everything below is old.");
    expect([reload, reported].map((f) => f.mock.calls.length)).toEqual([0, 0]);
  });

  it("counts a body it cannot read as a failed poll, and says why in the console", async () => {
    await loadPage(fresh(afternoon), { now: "soon" });
    await vi.advanceTimersByTimeAsync(40 * SEC);
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect(reported).toHaveBeenCalledWith(expect.any(TypeError));
  });
});

describe("the controller on a sign-in failure", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it.each(["redirect", 401, 403])("reloads once on %s", async (answer) => {
    await loadPage(answer);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem("swimcoach.authReloadAt"))).toBe(T0);
  });

  it("shows SIGN IN, not OFFLINE, when the reload is spent, and a tap reloads", async () => {
    sessionStorage.setItem("swimcoach.authReloadAt", String(T0 - 60 * SEC));
    await loadPage(fresh(afternoon), 401);
    await vi.advanceTimersByTimeAsync(70 * SEC);
    expect(reload).not.toHaveBeenCalled();
    expect(health()).toEqual(["off", "SIGN IN", "off"]);
    expect($("#warn").textContent).toBe("Signed out of the board. Tap here to sign in again.");
    $("#warn").click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("clears SIGN IN on the next good poll", async () => {
    sessionStorage.setItem("swimcoach.authReloadAt", String(T0));
    await loadPage(401, fresh(afternoon));
    expect($("#health b").textContent).toBe("SIGN IN");
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect([$("#health b").textContent, $("#warn").textContent]).toEqual(["LIVE", ""]);
  });
});
