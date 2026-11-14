// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import alldone from "../../contract/schemas/examples/state.alldone.json" with { type: "json" };
import empty from "../../contract/schemas/examples/state.empty.json" with { type: "json" };
import keyboard from "../../contract/schemas/examples/state.keyboard.json" with { type: "json" };
import stale from "../../contract/schemas/examples/state.stale.json" with { type: "json" };
import { needKeys } from "../../public/js/alerts.js";
import { healthOf } from "../../public/js/main.js";
import { titleOf } from "../../public/js/nav.js";
import { mayReload, outcomeOf } from "../../public/js/poll.js";
import { toView } from "../../public/js/state.js";
import type { View } from "../../public/js/view.js";

// The controller (public/js/main.js): the health box (concept.md 3.1, api.md 6.7), sign-in failures
// (api.md 2), and the page it drives. The pure functions first; then the controller itself, loaded
// into the page shell with fetch stubbed.

const T0 = 1_800_000_000_000; // the page clock, in ms
const SEC = 1000;
const ELLIPSIS = String.fromCharCode(8230); // U+2026

/** The afternoon View with its newest report ageSeconds old at its own now. */
function aged(ageSeconds: number): View {
  const view = toView(afternoon);
  return { ...view, lastReportAt: view.now - ageSeconds };
}

/** An age to the millisecond, so float noise in the examples' times does not matter. */
function rounded(seconds: number | null): number | null {
  if (seconds === null) {
    return null;
  }
  return Math.round(seconds * 1000) / 1000;
}

/** The OFFLINE warning over an old board. */
function gone(age: string): string {
  return `Can't reach the board for ${age}. Everything below is old.`;
}

/** The STALE warning. */
function quiet(age: string): string {
  return `No agent has reported for ${age}. Everything below is old.`;
}

describe("healthOf", () => {
  it.each([
    ["before the first poll", null, 0, ["wait", ELLIPSIS, null, ""]],
    ["30 s into a first poll", null, 30, ["wait", ELLIPSIS, null, ""]],
    [
      "a board that never answered",
      null,
      30.001,
      ["off", "OFFLINE", 30.001, "Can't reach the board for 1m."],
    ],
    ["2 minutes after a report", aged(120), 5, ["live", "LIVE", 125, ""]],
    ["30 s after the last good poll", aged(60), 30, ["live", "LIVE", 90, ""]],
    ["4 minutes after the last good poll", aged(60), 240, ["off", "OFFLINE", 240, gone("4m")]],
    ["24m 59s after a report", aged(24 * 60 + 50), 9, ["live", "LIVE", 1499, ""]],
    ["aging past 25 minutes", aged(24 * 60 + 50), 11, ["stale", "STALE", 1501, quiet("25m")]],
    ["the stale example", toView(stale), 0, ["stale", "STALE", 2100.133, quiet("35m")]],
    ["every milestone done", toView(alldone), 0, ["idle", "IDLE", 0.902, ""]],
    ["an empty board", toView(empty), 0, ["idle", "NO DATA", null, ""]],
    ["an empty board, unreachable", toView(empty), 31, ["off", "OFFLINE", 31, gone("1m")]],
  ] as const)("%s", (_label, view, seconds, [st, label, age, msg]) => {
    const h = healthOf(view, T0, T0 + seconds * SEC);
    expect([h.st, h.label, rounded(h.age), h.msg]).toEqual([st, label, age, msg]);
  });
});

describe("outcomeOf: a sign-in failure is not OFFLINE noise", () => {
  it.each([
    ["opaqueredirect", 0, false, "auth"],
    ["basic", 401, false, "auth"],
    ["basic", 403, false, "auth"],
    ["basic", 200, true, "ok"],
    ["basic", 404, false, "fail"],
    ["basic", 500, false, "fail"],
    ["basic", 502, false, "fail"],
  ] as const)("%s %i is %s", (type, status, ok, want) => {
    expect(outcomeOf({ type, status, ok })).toBe(want);
  });
});

describe("mayReload, titleOf and needKeys", () => {
  it.each([
    ["no reload yet", null, true],
    ["an unreadable record", Number.NaN, true],
    ["a reload a minute ago", T0 - 60 * SEC, false],
    ["a reload five minutes ago", T0 - 5 * 60 * SEC, true],
    ["a reload in the future (clock change)", T0 + SEC, true],
  ])("may reload after %s: %s", (_label, last, want) => {
    expect(mayReload(last, T0)).toBe(want);
  });

  it("titles the tab swimcoach, with the count while cards ask", () => {
    expect([titleOf(0), titleOf(2)]).toEqual(["swimcoach", "(2) swimcoach"]);
  });

  it("keys each ask by card and words", () => {
    expect([...needKeys(toView(keyboard))]).toEqual([
      `${JSON.stringify(["localswim v2", "t06"])}|1 ticket in Needs Terry`,
      `${JSON.stringify(["search-index", "t03"])}|Pick an index strategy: per-tenant or shared`,
    ]);
    expect(needKeys(toView(alldone)).size).toBe(0);
  });
});

// ---------- the controller, in the page shell ----------

const SHELL = `<div id="phone"><header><h1><i id="brand"></i><span class="word">swim<span>coach</span></span></h1><span id="clock"></span><span id="health" class="wait"><i></i><b>&hellip;</b><span></span></span><button id="snd" type="button" aria-label="Alerts off"></button></header><div id="warn"></div><main id="pages"></main><nav id="dots"></nav></div>`;

let answers: unknown[];
let reload: ReturnType<typeof vi.fn>;
let reported: ReturnType<typeof vi.fn>;

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
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
  sessionStorage.clear();
}

function tearDown(): void {
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
    expect([...$("#dots").children].map((b) => b.className)).toEqual([
      "on",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(document.title).toBe("(1) swimcoach");
    expect(health()).toEqual(["live", "LIVE", "live"]);
  });

  it("reveals the page once, after the first poll", async () => {
    await loadPage(fresh(afternoon));
    await vi.advanceTimersByTimeAsync(50);
    expect(document.documentElement.classList.contains("loading")).toBe(false);
  });

  it("changes nothing on a poll that brings the same board (UX-110)", async () => {
    await loadPage(fresh(afternoon));
    // The records reach the callback after the awaits below, so keep what it is handed.
    const seen: MutationRecord[] = [];
    const observer = new MutationObserver((records) => seen.push(...records));
    const all = { subtree: true, childList: true, attributes: true, characterData: true };
    observer.observe($("#pages"), all);
    observer.observe($("#dots"), all);
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect([...seen, ...observer.takeRecords()]).toEqual([]);
  });

  it("adds and removes sections as milestones come and go", async () => {
    await loadPage(fresh(afternoon), fresh(keyboard));
    await vi.advanceTimersByTimeAsync(10 * SEC);
    expect(sections()).toEqual(["*all*", ...toView(keyboard).cards.map((c) => c.key)]);
    expect(document.title).toBe("(2) swimcoach");
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
