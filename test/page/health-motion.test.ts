// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import stale from "../../contract/schemas/examples/state.stale.json" with { type: "json" };
import { POLL_MS } from "../../public/js/format.js";
import {
  $,
  fresh,
  health,
  loadPage,
  revealed,
  SEC,
  setUp,
  stubs,
  tearDown,
  watchDocument,
} from "./controller-stand-ins.ts";

// The Health box's motion (localswim swimcoach #0036; UX-183 to UX-186): a change of state fades the
// old state out and the new one in, the warning line with it, and the displays ease into their gray.
// No motion on the first render, under reduced motion, or on a poll that changed nothing.

const FADE_MS = 300;
const OFFLINE_AT_MS = 61 * SEC; // the first tick past three poll intervals (UX-159)

const STATUS_PARTS = new Set(["health", "warn", "pages"]);

type Call = [frames: Keyframe[], options: KeyframeAnimationOptions];
type Motion = [
  id: string,
  from: Keyframe | undefined,
  to: Keyframe | undefined,
  ease: unknown,
  ms: unknown,
];

/**
 * Each animate call on the Health box, the warning line or the displays, as [element id, first and
 * last keyframe, easing, duration]. A card arriving with a new board fades in too (UX-135); not here.
 */
function motions(): Motion[] {
  const calls = stubs.animate.mock.calls as Call[];
  const out: Motion[] = [];
  for (const [i, [frames, options]] of calls.entries()) {
    const el = stubs.animate.mock.contexts[i] as HTMLElement;
    if (STATUS_PARTS.has(el.id)) {
      out.push([el.id, frames[0], frames.at(-1), options.easing, options.duration]);
    }
  }
  return out;
}

/** The id of the element a change landed in: the target itself, or a text node's parent. */
function elementOf(record: MutationRecord): string {
  if (record.target instanceof Element) {
    return record.target.id;
  }
  return record.target.parentElement?.id ?? "";
}

/** Loads a board whose polls fail from the second on, and moves to the tick that turns it OFFLINE. */
async function untilOffline(): Promise<void> {
  await loadPage(fresh(afternoon), new TypeError("Failed to fetch"));
  await revealed();
  await vi.advanceTimersByTimeAsync(OFFLINE_AT_MS - 50);
}

describe("the Health box changing state (UX-183, UX-184, UX-185)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("fades LIVE out, then writes OFFLINE and fades it in with its warning and the gray", async () => {
    await untilOffline();
    expect(stubs.animate).toHaveBeenCalledTimes(1);
    expect(motions()).toEqual([["health", { opacity: 1 }, { opacity: 0 }, "ease-in", FADE_MS]]);
    // Fading out, the box still shows the old state, with no warning line yet.
    expect(health()).toEqual(["live", "LIVE", "live"]);
    expect($("#warn").textContent).toBe("");
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect($("#warn").textContent).toBe("Can't reach the board for 1m. Everything below is old.");
    const gray = { opacity: 0.4, filter: "grayscale(1)" };
    const clear = { opacity: 1, filter: "grayscale(0)" };
    expect(motions().slice(1)).toEqual([
      ["health", { opacity: 0 }, { opacity: 1 }, "ease-out", FADE_MS],
      ["warn", { opacity: 0 }, { opacity: 1 }, "ease-out", FADE_MS],
      ["pages", clear, gray, "ease-out", FADE_MS],
    ]);
  });

  it("fades the warning line out with STALE and eases the gray away on the way back to LIVE", async () => {
    await loadPage(fresh(stale), fresh(afternoon));
    await revealed();
    expect(motions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(motions()).toEqual([
      ["health", { opacity: 1 }, { opacity: 0 }, "ease-in", FADE_MS],
      ["warn", { opacity: 1 }, { opacity: 0 }, "ease-in", FADE_MS],
    ]);
    expect(health()).toEqual(["stale", "STALE", "stale"]);
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect([...health(), $("#warn").textContent]).toEqual(["live", "LIVE", "live", ""]);
    // No warning line to fade in under LIVE; the gray eases away.
    expect(motions().slice(2)).toEqual([
      ["health", { opacity: 0 }, { opacity: 1 }, "ease-out", FADE_MS],
      [
        "pages",
        { opacity: 0.4, filter: "grayscale(1)" },
        { opacity: 1, filter: "grayscale(0)" },
        "ease-out",
        FADE_MS,
      ],
    ]);
  });
});

describe("the Health box after and during a change (UX-183, UX-186)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("lands on the newest state when the state changes again mid-fade", async () => {
    await loadPage(fresh(afternoon));
    await revealed();
    // Between the page's own ticks (one a second), ask for STALE, then OFFLINE 0.1 s into its fade.
    const { showHealth } = await import("../../public/js/health.js");
    showHealth({ st: "stale", label: "STALE", age: 1600, msg: "Stale." });
    await vi.advanceTimersByTimeAsync(100);
    showHealth({ st: "off", label: "OFFLINE", age: 100, msg: "Offline." });
    expect(health()).toEqual(["live", "LIVE", "live"]);
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect([...health(), $("#warn").textContent]).toEqual(["off", "OFFLINE", "off", "Offline."]);
    expect(motions().map(([id]) => id)).toEqual(["health", "health", "warn", "pages"]);
  });

  it("then a steady second or poll starts nothing and writes nothing but changed text", async () => {
    await untilOffline();
    await vi.advanceTimersByTimeAsync(FADE_MS);
    const calls = stubs.animate.mock.calls.length;
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(stubs.animate).toHaveBeenCalledTimes(calls);
    // Only the warning line's running duration may change.
    expect(changes().filter((r) => elementOf(r) !== "warn")).toEqual([]);
  });
});

describe("the Health box holding still (UX-186)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("does not animate the first render, even a STALE one", async () => {
    await loadPage(fresh(stale));
    await revealed();
    expect(health()).toEqual(["stale", "STALE", "stale"]);
    expect(stubs.animate).not.toHaveBeenCalled();
  });

  it("switches at once, with no animate call, under prefers-reduced-motion: reduce", async () => {
    stubs.reduceMotion = true;
    await untilOffline();
    expect(health()).toEqual(["off", "OFFLINE", "off"]);
    expect(stubs.animate).not.toHaveBeenCalled();
  });

  it("switches at once, with no animate call, while the page is hidden", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    try {
      await untilOffline();
      expect(health()).toEqual(["off", "OFFLINE", "off"]);
      expect(stubs.animate).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "hidden");
    }
  });

  it("makes no animate call and no change on a steady LIVE poll", async () => {
    await loadPage(fresh(afternoon));
    await revealed();
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(changes()).toEqual([]);
    expect(stubs.animate).not.toHaveBeenCalled();
  });
});
