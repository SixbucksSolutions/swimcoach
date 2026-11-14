// Overview checks, area A and the health rows of M: the Health box in STALE, OFFLINE and SIGN IN, how
// it recovers, and the 30 s poll (MVP-11 A). Failing polls go through `answer({ fail })`.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import {
  COLOR,
  countPolls,
  MINUTE_MS,
  older,
  openWith,
  POLL_MS,
  pollOnce,
  settle,
} from "./overview-kit.ts";
import { untilLabel, waitFor } from "./overview-nav.ts";
import { cardsOf, healthOf, runningBreaths, statusBoxesOf } from "./overview-probe.ts";

const OUTAGE_MINUTES = 65;
const LONG_ENOUGH_FOR_OFFLINE_MS = 100_000;
const TWO_POLLS_AND_A_BIT_MS = 85_000;
const SECONDS_PER_MINUTE = 60;

/** Loses the board for `ms` of page time: every poll fails, the page clock jumps on. */
async function loseBoard(ctx: UiContext, ms: number): Promise<void> {
  ctx.answer({ fail: "abort" });
  // fastForward jumps the clock and fires each due timer once: a long outage in a moment. The jump
  // is not counted by ctx.now(), so a case never builds a state body after calling this.
  await ctx.page.clock.fastForward(ms);
  await ctx.advance(1000);
  await settle(ctx);
}

function signInCase(status: 401 | 403): UiCase {
  return {
    ids: ["UX-154"],
    title: `SIGN IN: Access answers ${status}; one reload, then the red box, grayed displays, a tap to reload`,
    async run(ctx) {
      const loads: string[] = [];
      ctx.page.on("request", (r) => {
        if (r.isNavigationRequest() && new URL(r.url()).pathname === "/") {
          loads.push(r.url());
        }
      });
      ctx.answer({ fail: status });
      await ctx.open();
      // The page reloads once, and how long that takes depends on the network: wait for the box.
      assert.ok(await untilLabel(ctx, "SIGN IN"), "The box reads SIGN IN after the reload.");
      assert.equal(loads.length, 2, "The page loads once and reloads once.");
      const box = await healthOf(ctx.page);
      assert.equal(box.label, "SIGN IN");
      assert.equal(box.bg, COLOR.offline);
      assert.equal(box.age, "");
      assert.equal(box.warn, "Signed out of the board. Tap here to sign in again.");
      assert.equal(box.pagesOpacity, 0.4);
      assert.equal(box.pagesFilter, "grayscale(1)");
      // An auth refusal never counts toward OFFLINE, and the page does not reload again within 5 min.
      await pollOnce(ctx);
      await pollOnce(ctx);
      await ctx.advance(2 * MINUTE_MS);
      await settle(ctx);
      assert.equal((await healthOf(ctx.page)).label, "SIGN IN");
      assert.equal(loads.length, 2, "No second reload inside 5 minutes.");
      await ctx.advance(2 * MINUTE_MS);
      assert.ok(
        await waitFor(async () => loads.length === 3),
        "A refusal after 5 minutes reloads once more.",
      );
      assert.ok(await untilLabel(ctx, "SIGN IN"));
      // The board answers again; a tap on the warning line reloads the page, which then reads LIVE.
      ctx.answer({ body: ctx.example("afternoon") });
      await ctx.page.locator("#warn").click();
      assert.ok(
        await waitFor(async () => loads.length === 4),
        "A tap on the warning line reloads.",
      );
      assert.ok(await untilLabel(ctx, "LIVE"), "The next good poll clears SIGN IN.");
    },
  };
}

const healthCases: UiCase[] = [
  {
    ids: ["UX-012", "UX-013"],
    title:
      "STALE: dark orange box, word only, grayed displays, and the exact duration in the warning line",
    async run(ctx) {
      await openWith(ctx, ctx.example("stale"));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "STALE");
      assert.equal(h.age, "", "STALE shows the word only.");
      assert.equal(h.bg, COLOR.stale);
      assert.equal(h.warnShown, true);
      assert.equal(h.warn, "No agent has reported for 35m. Everything below is old.");
      assert.equal(h.pagesOpacity, 0.4);
      assert.equal(h.pagesFilter, "grayscale(1)");
    },
  },
  {
    ids: ["UX-158"],
    title: "LIVE needs a newest report under 25 minutes old: 24 minutes is LIVE, 26 is STALE",
    async run(ctx) {
      await openWith(ctx, older(ctx.example("afternoon"), 24 * SECONDS_PER_MINUTE));
      assert.equal((await healthOf(ctx.page)).label, "LIVE");
      await openWith(ctx, older(ctx.example("afternoon"), 26 * SECONDS_PER_MINUTE));
      assert.equal((await healthOf(ctx.page)).label, "STALE");
    },
  },
  {
    ids: ["UX-138"],
    title: "STALE does not fire when every project is done: an old newest report still reads LIVE",
    async run(ctx) {
      await openWith(ctx, older(ctx.example("alldone"), 40 * SECONDS_PER_MINUTE));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE");
      assert.equal(h.bg, COLOR.okFill);
      assert.equal(h.age, "40m");
      assert.equal(h.warnShown, false);
      assert.equal(h.pagesOpacity, 1);
    },
  },
  {
    ids: ["UX-161"],
    title:
      "When every milestone is done and polls work, the Health box is LIVE with a breathing dot",
    async run(ctx) {
      await openWith(ctx, ctx.example("alldone"));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE");
      assert.equal(h.bg, COLOR.okFill);
      assert.equal(runningBreaths(h.dot).length, 1, "The dot breathes.");
      assert.deepEqual(
        (await cardsOf(ctx.page)).map((c) => c.bg),
        [COLOR.board, COLOR.board],
      );
    },
  },
  {
    ids: ["UX-158", "UX-159"],
    title:
      "LIVE holds through two failed polls; the third makes the box OFFLINE, grayed, word only",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      ctx.answer({ fail: "abort" });
      await ctx.advance(TWO_POLLS_AND_A_BIT_MS);
      await settle(ctx);
      const held = await healthOf(ctx.page);
      assert.equal(held.label, "LIVE", "Two failed polls leave the box LIVE.");
      assert.equal(held.bg, COLOR.okFill);
      assert.equal(held.pagesOpacity, 1);
      await ctx.advance(10_000);
      await settle(ctx);
      const off = await healthOf(ctx.page);
      assert.equal(off.label, "OFFLINE");
      assert.equal(off.age, "");
      assert.equal(off.bg, COLOR.offline);
      assert.equal(off.fg, COLOR.white);
      assert.equal(off.warnShown, true);
      assert.match(off.warn, /^Can't reach the board for \d+m\. Everything below is old\.$/u);
      assert.equal(off.pagesOpacity, 0.4);
      assert.equal(off.pagesFilter, "grayscale(1)");
    },
  },
  {
    ids: ["UX-015", "UX-125"],
    title: "A long outage (1h 05m) shows the word OFFLINE alone and the Status line keeps one row",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const live = await statusBoxesOf(ctx.page);
      await loseBoard(ctx, OUTAGE_MINUTES * MINUTE_MS);
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "OFFLINE");
      assert.equal(h.age, "");
      assert.equal(h.warn, "Can't reach the board for 1h 05m. Everything below is old.");
      const s = await statusBoxesOf(ctx.page);
      assert.ok(s.clock.x - s.wordmark.r >= 34, "At least 35 px between wordmark and clock.");
      assert.equal(s.header.h, live.header.h, "The Status line does not wrap.");
      assert.equal(s.bell.w, live.bell.w);
    },
  },
  {
    ids: ["UX-019"],
    title: "Recovery: the first good poll after OFFLINE returns the box to what the data calls for",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      await loseBoard(ctx, LONG_ENOUGH_FOR_OFFLINE_MS);
      assert.equal((await healthOf(ctx.page)).label, "OFFLINE");
      ctx.answer({ body: ctx.example("afternoon") });
      await pollOnce(ctx);
      const live = await healthOf(ctx.page);
      assert.equal(live.label, "LIVE", "A fresh newest report reads LIVE.");
      assert.equal(live.bg, COLOR.okFill);
      assert.equal(live.pagesOpacity, 1, "The gray is removed.");
      assert.equal(live.pagesFilter, "none");
      assert.equal(live.warnShown, false);
      await loseBoard(ctx, LONG_ENOUGH_FOR_OFFLINE_MS);
      assert.equal((await healthOf(ctx.page)).label, "OFFLINE");
      ctx.answer({ body: ctx.example("stale") });
      await pollOnce(ctx);
      const stale = await healthOf(ctx.page);
      assert.equal(stale.label, "STALE", "An old newest report reads STALE, not LIVE.");
      assert.equal(stale.pagesOpacity, 0.4);
    },
  },
  signInCase(401),
  signInCase(403),
  {
    ids: ["UX-156"],
    title: "The page polls every 30 seconds, not sooner",
    async run(ctx) {
      const polls = countPolls(ctx);
      const start = ctx.now();
      await openWith(ctx, ctx.example("afternoon"));
      assert.equal(polls.count(), 1, "One poll on load.");
      const elapsedMs = (ctx.now() - start) * 1000;
      await ctx.advance(POLL_MS - elapsedMs - 2000);
      await settle(ctx);
      assert.equal(polls.count(), 1, "No second poll before 30 s.");
      await pollOnce(ctx, 4000);
      assert.equal(polls.count(), 2, "The second poll comes at 30 s.");
      await pollOnce(ctx);
      assert.equal(polls.count(), 3, "And the third 30 s later.");
    },
  },
];

export { healthCases };
