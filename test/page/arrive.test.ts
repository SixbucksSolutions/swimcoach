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

// The controller when the board changes shape: a card that arrives after the first render fades in
// and leaves every other card node alone (UX-135, with UX-110 still holding), and an empty or
// all-done board reads LIVE (UX-136, UX-137, UX-138).

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

describe("a card inserted mid-list (UX-135)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("does not animate cards one by one on the first render", async () => {
    await loadPage(fresh(afternoon));
    expect(slots()).toHaveLength(6);
    expect(stubs.animate).not.toHaveBeenCalled();
  });

  it("keeps every other card node, writes nothing inside them, and fades in only the new one", async () => {
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
    expect([frames[0]?.opacity, frames.at(-1)?.opacity]).toEqual([0, 1]);
    expect(options).toEqual({ duration: 300, easing: "ease-in" });
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

describe("other arrivals (UX-135)", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("fades in the GO TO KEYBOARD slot when it appears, and only that", async () => {
    await loadPage(withoutRed(fresh(afternoon)), fresh(afternoon));
    await revealed();
    const before = slots();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    const [kbd, ...rest] = slots();
    expect(kbd?.classList.contains("kbd")).toBe(true);
    expect(sameNodes(rest, before)).toBe(true);
    expect(stubs.animate.mock.contexts).toEqual([kbd]);
  });

  it("makes no animate call under prefers-reduced-motion: reduce", async () => {
    stubs.reduceMotion = true;
    await loadPage(fresh(afternoon), withInserted(fresh(afternoon)));
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(slots()).toHaveLength(7);
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
