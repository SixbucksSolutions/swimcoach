// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import { POLL_MS } from "../../public/js/format.js";
import { toView } from "../../public/js/state.js";
import {
  $,
  fireLoadingDone,
  fresh,
  health,
  installFonts,
  loadPage,
  OVERVIEW,
  revealed,
  SEC,
  sections,
  setUp,
  stubs,
  T0,
  tearDown,
  watchDocument,
} from "./controller-stand-ins.ts";

// The controller (public/js/main.js and the modules it wires), loaded into the page shell with fetch
// and the font set stubbed: drawing, UX-110 on the whole document, late fonts, failed polls and
// sign-in failures. Cards arriving and the empty board are in arrive.test.ts.

describe("the controller draws the board", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("polls the dated state path with no-store, a manual redirect and a timeout", async () => {
    await loadPage(fresh(afternoon));
    const options = { cache: "no-store", redirect: "manual", signal: expect.any(AbortSignal) };
    expect(fetch).toHaveBeenCalledWith("/api/2026-11-14/state", expect.objectContaining(options));
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
    await vi.advanceTimersByTimeAsync(POLL_MS);
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
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(changes()).toEqual([]);
  });

  it("restarts the LIVE dot's breath through Web Animations, writing nothing", async () => {
    await loadPage(fresh(afternoon));
    const breath = { currentTime: 15_000, playState: "running", play: vi.fn() };
    Object.assign($("#health i"), { getAnimations: () => [breath] });
    await revealed();
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
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
    stubs.fontFace.status = "loaded";
    fireLoadingDone();
    fireLoadingDone(); // a second event for the same load fits nothing more
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([2, 2]);
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    // The steady poll fits again, from the cache: no new font state, no change.
    expect([fits.mock.calls.length, bumps.mock.calls.length]).toEqual([3, 2]);
    expect(changes()).toEqual([]);
  });
});

describe("the controller on failed polls", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("turns OFFLINE after three failed polls (90 s), never SIGN IN", async () => {
    await loadPage(fresh(afternoon), new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(3 * POLL_MS);
    expect(health()).toEqual(["live", "LIVE", "live"]);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect($("#warn").textContent).toBe("Can't reach the board for 2m. Everything below is old.");
    expect([stubs.reload, stubs.reported].map((f) => f.mock.calls.length)).toEqual([0, 0]);
  });

  it("counts a body it cannot read as a failed poll, and says why in the console", async () => {
    await loadPage(fresh(afternoon), { now: "soon" });
    await vi.advanceTimersByTimeAsync(4 * POLL_MS);
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect(stubs.reported).toHaveBeenCalledWith(expect.any(TypeError));
  });
});

describe("the controller on a sign-in failure", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it.each(["redirect", 401, 403])("reloads once on %s", async (answer) => {
    await loadPage(answer);
    expect(stubs.reload).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem("swimcoach.authReloadAt"))).toBe(T0);
  });

  it("shows SIGN IN, not OFFLINE, when the reload is spent, and a tap reloads", async () => {
    sessionStorage.setItem("swimcoach.authReloadAt", String(T0 - 60 * SEC));
    await loadPage(fresh(afternoon), 401);
    await vi.advanceTimersByTimeAsync(4 * POLL_MS); // past OFFLINE's 90 s, still SIGN IN
    expect(stubs.reload).not.toHaveBeenCalled();
    expect(health()).toEqual(["off", "SIGN IN", "off"]);
    expect($("#warn").textContent).toBe("Signed out of the board. Tap here to sign in again.");
    $("#warn").click();
    expect(stubs.reload).toHaveBeenCalledTimes(1);
  });

  it("clears SIGN IN on the next good poll", async () => {
    sessionStorage.setItem("swimcoach.authReloadAt", String(T0));
    await loadPage(401, fresh(afternoon));
    expect($("#health b").textContent).toBe("SIGN IN");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect([$("#health b").textContent, $("#warn").textContent]).toEqual(["LIVE", ""]);
  });
});
