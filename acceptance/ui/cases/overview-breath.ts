// Overview checks, area F: the LIVE dot and GO TO KEYBOARD breathe in step (MVP-11 A). CSS animations
// run on the browser's own time, not the page clock, so these cases read animation state; the one
// real-time wait is the frozen-page case.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { near, openWith, pause, pollOnce, settle } from "./overview-kit.ts";
import { cardsOf, healthOf, probe, runningBreaths } from "./overview-probe.ts";

const FROZEN_WAIT_MS = 41_000;
const WARM_UP_MS = 1200;

/** Both breaths' current times, read in one page task so they share one frame of the timeline. */
function breathTimes(ctx: UiContext): Promise<[number, number]> {
  return probe<[number, number]>(ctx.page, "breaths()");
}

async function inStep(ctx: UiContext, when: string): Promise<number> {
  const [dot, slot] = await breathTimes(ctx);
  near(dot, slot, 1, `The dot and GO TO KEYBOARD agree ${when}`);
  return dot;
}

async function running(ctx: UiContext): Promise<{ dot: number; slot: number }> {
  const { dot } = await healthOf(ctx.page);
  const kbd = (await cardsOf(ctx.page)).find((c) => c.name === "GO TO KEYBOARD");
  return {
    dot: runningBreaths(dot).length,
    slot: runningBreaths(kbd?.animations ?? []).length,
  };
}

const breathCases: UiCase[] = [
  {
    ids: ["UX-160"],
    title:
      "The LIVE dot and GO TO KEYBOARD breathe in step: same 2 s ease-in-out cycle, 20 cycles, same clock",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const { dot } = await healthOf(ctx.page);
      const kbd = (await cardsOf(ctx.page)).find((c) => c.name === "GO TO KEYBOARD");
      const [dotBreath] = runningBreaths(dot);
      const [slot] = runningBreaths(kbd?.animations ?? []);
      assert.ok(dotBreath && slot, "Both breathe.");
      for (const a of [dotBreath, slot]) {
        assert.equal(a.end, 40_000, "Twenty cycles of 2 s, 40 s in all.");
      }
      assert.equal((await healthOf(ctx.page)).dotCss.timing, "ease-in-out");
      assert.equal(kbd?.css.timing, "ease-in-out");
      await inStep(ctx, "after load");
    },
  },
  {
    ids: ["UX-072", "UX-076"],
    title: "Each good poll restarts both breaths together, and they stay in phase between polls",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      await inStep(ctx, "after load");
      await pause(WARM_UP_MS);
      await ctx.advance(10_000);
      const before = await inStep(ctx, "between polls");
      assert.ok(before >= WARM_UP_MS, `The breath has run for a while (${before} ms).`);
      await pollOnce(ctx);
      const after = await inStep(ctx, "after a poll");
      assert.ok(
        after < before,
        `A good poll restarts the breath (${before} ms, then ${after} ms).`,
      );
      assert.ok(after < 1000, "It starts again from its first frame.");
    },
  },
  {
    ids: ["UX-074"],
    title: "GO TO KEYBOARD breathes only while the box says LIVE: not in STALE, not in OFFLINE",
    async run(ctx) {
      await openWith(ctx, ctx.example("stale"));
      assert.equal((await healthOf(ctx.page)).label, "STALE");
      assert.deepEqual(await running(ctx), { dot: 0, slot: 0 }, "Both are still in STALE.");
      await openWith(ctx, ctx.example("afternoon"));
      assert.deepEqual(await running(ctx), { dot: 1, slot: 1 }, "Both breathe in LIVE.");
      ctx.answer({ fail: "abort" });
      await ctx.page.clock.fastForward(120_000);
      await ctx.advance(1000);
      await settle(ctx);
      assert.equal((await healthOf(ctx.page)).label, "OFFLINE");
      assert.deepEqual(await running(ctx), { dot: 0, slot: 0 }, "Both are still in OFFLINE.");
    },
  },
  {
    ids: ["UX-075"],
    title: "Under reduced motion nothing breathes and the page does not fade in, even while LIVE",
    async run(ctx) {
      await ctx.page.emulateMedia({ reducedMotion: "reduce" });
      await openWith(ctx, ctx.example("afternoon"));
      assert.equal((await healthOf(ctx.page)).label, "LIVE");
      assert.ok(
        (await cardsOf(ctx.page)).some((c) => c.name === "GO TO KEYBOARD"),
        "GO TO KEYBOARD is on the board.",
      );
      assert.deepEqual(await running(ctx), { dot: 0, slot: 0 }, "Neither breathes.");
      await pollOnce(ctx);
      assert.deepEqual(await running(ctx), { dot: 0, slot: 0 }, "A good poll starts no breath.");
      assert.equal(await probe<string>(ctx.page, "cs(document.body).transitionDuration"), "0s");
    },
  },
  {
    ids: ["UX-157"],
    title:
      "A frozen page stops breathing by itself: 40 s after the last good poll both animations have ended",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      assert.deepEqual(await running(ctx), { dot: 1, slot: 1 });
      // The page clock is paused, so no poll comes: this is a page whose script has frozen.
      await pause(FROZEN_WAIT_MS);
      assert.deepEqual(await running(ctx), { dot: 0, slot: 0 }, "Both have stopped.");
    },
  },
];

export { breathCases };
