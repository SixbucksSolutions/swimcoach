// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import afternoon from "../../contract/schemas/examples/state.afternoon.json" with { type: "json" };
import alldone from "../../contract/schemas/examples/state.alldone.json" with { type: "json" };
import empty from "../../contract/schemas/examples/state.empty.json" with { type: "json" };
import { POLL_MS } from "../../public/js/format.js";
import { toView } from "../../public/js/state.js";
import {
  $,
  fresh,
  health,
  loadPage,
  revealed,
  SEC,
  setUp,
  slots,
  stubs,
  tearDown,
  watchDocument,
} from "./controller-stand-ins.ts";

// The controller when the board changes shape: a card that arrives after the first render slides in
// from the left and leaves every other card node alone, a card that leaves slides out to the right
// as a ghost that goes when its exit ends, GO TO KEYBOARD drops from the top (UX-177 to UX-181 and UX-190, with
// UX-110 still holding), and an empty or all-done board reads LIVE (UX-136, UX-137, UX-138).

/** A transform that starts off the left edge (UX-177). */
const FROM_LEFT = /^translateX\(-/u;

/** A transform above the card area, where GO TO KEYBOARD comes from and goes back to (UX-179). */
const UP_ABOVE = /^translateY\(-/u;

/** The afternoon board with one more milestone, docs-site T09, third in the server's order. */
function withInserted(body: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(body);
  const milestones = copy.milestones as Record<string, unknown>[];
  milestones.splice(2, 0, { ...structuredClone(milestones[1]), milestone: "T09" });
  return copy;
}

/** The afternoon board without its red milestone, so there is no GO TO KEYBOARD slot. */
function withoutRed(body: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(body);
  copy.milestones = (copy.milestones as { color: string }[]).filter((m) => m.color !== "red");
  return copy;
}

/** Whether every slot in after is the very node at the same place in before. */
function sameNodes(after: Element[], before: Element[]): boolean {
  return after.length === before.length && after.every((card, i) => card === before[i]);
}

describe("a card inserted mid-list (UX-177)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("does not animate cards one by one on the first render", async () => {
    await loadPage(fresh(afternoon));
    // GO TO KEYBOARD and the four running cards; the done milestone is on the GO CODE REVIEW line.
    expect(slots()).toHaveLength(5);
    expect(stubs.animate).not.toHaveBeenCalled();
  });

  it("keeps every other card node, writes nothing inside them, and slides in only the new one", async () => {
    await loadPage(fresh(afternoon), withInserted(fresh(afternoon)));
    await revealed();
    const before = slots();
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const after = slots();
    // GO TO KEYBOARD, auth-refresh, docs-site, then the new docs-site T09.
    const [added] = after.splice(3, 1);
    const key = toView(withInserted(afternoon)).cards.find((c) => c.title.endsWith("T09"))?.key;
    expect([key, added?.getAttribute("data-go")]).toEqual([expect.any(String), key]);
    expect(sameNodes(after, before)).toBe(true);
    const touched = changes().filter((r) => before.some((card) => card.contains(r.target)));
    expect(touched).toEqual([]);
    expect(stubs.animate.mock.contexts).toEqual([added]);
    const [frames, options] = stubs.animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    // From off the left edge, into place, decelerating (UX-177).
    expect(String(frames[0]?.transform)).toMatch(FROM_LEFT);
    expect(frames.at(-1)?.transform).toBe("none");
    expect(options).toEqual({ duration: 300, delay: 0, easing: "ease-out", fill: "backwards" });
  });

  it("then changes nothing anywhere in the document on an identical poll (UX-110)", async () => {
    await loadPage(fresh(afternoon), withInserted(fresh(afternoon)));
    await revealed();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const changes = watchDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(changes()).toEqual([]);
    expect(stubs.animate).toHaveBeenCalledTimes(1);
  });
});

describe("other arrivals and departures (UX-178, UX-179, UX-190)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("drops the GO TO KEYBOARD slot in from the top when it appears, and moves only that", async () => {
    await loadPage(withoutRed(fresh(afternoon)), fresh(afternoon));
    await revealed();
    const before = slots();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const [kbd, ...rest] = slots();
    expect(kbd?.classList.contains("kbd")).toBe(true);
    expect(sameNodes(rest, before)).toBe(true);
    expect(stubs.animate.mock.contexts).toEqual([kbd]);
    const [frames] = stubs.animate.mock.calls[0] as [Keyframe[]];
    expect(String(frames[0]?.transform)).toMatch(UP_ABOVE);
  });

  it("slides a card that left out to the right as a ghost, which goes when the exit ends", async () => {
    await loadPage(fresh(afternoon), withoutRed(fresh(afternoon)));
    await revealed();
    const leaving = slots().find((card) => card.classList.contains("kbd"));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    // The red milestone went, so GO TO KEYBOARD retracts up (UX-179) as a ghost in a wrapper.
    const call = stubs.animate.mock.calls.findIndex(
      (_, i) => stubs.animate.mock.contexts[i] === leaving,
    );
    expect(call).toBeGreaterThanOrEqual(0);
    const [frames, options] = stubs.animate.mock.calls[call] as [
      Keyframe[],
      KeyframeAnimationOptions,
    ];
    expect(String(frames.at(-1)?.transform)).toMatch(UP_ABOVE);
    expect(options.easing).toBe("ease-in");
    expect($("#pages .ghost")?.contains(leaving ?? null)).toBe(true);
    const exit = stubs.animate.mock.results[call]?.value as EventTarget;
    exit.dispatchEvent(new Event("finish"));
    expect($("#pages .ghost")).toBeNull();
  });

  it("makes no animate call under prefers-reduced-motion: reduce", async () => {
    stubs.reduceMotion = true;
    await loadPage(fresh(afternoon), withInserted(fresh(afternoon)));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(slots()).toHaveLength(6);
    expect(stubs.animate).not.toHaveBeenCalled();
  });
});

describe("an empty or finished board reads LIVE (UX-136, UX-137, UX-138)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("shows LIVE with no age on an empty board while polls get a 200", async () => {
    await loadPage(empty);
    expect(health()).toEqual(["live", "LIVE", "live"]);
    expect($("#health span").textContent).toBe("");
    expect($("#pages .empty").textContent).toBe("No reports yet today.");
    await vi.advanceTimersByTimeAsync(25 * SEC);
    expect([...health(), $("#health span").textContent]).toEqual(["live", "LIVE", "live", ""]);
  });

  it("shows LIVE, not IDLE, when every milestone is done (feed idle)", async () => {
    await loadPage(fresh(alldone));
    expect(health()).toEqual(["live", "LIVE", "live"]);
  });
});
