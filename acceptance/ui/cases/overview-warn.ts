// Overview checks: the six-slot fit holds while the warning line comes and goes (MVP-12 visual
// review, 2026-11-14). The line takes room from the Card display area, so the slots MUST refit to the
// smaller area in STALE, OFFLINE and SIGN IN, and grow back when the board is LIVE again, whether or
// not a poll drew a new view.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { board, fillers, near, openWith, pollOnce, settle } from "./overview-kit.ts";
import { areaOf, cardsOf, healthOf } from "./overview-probe.ts";

const SIX = 6;
const OUTAGE_MS = 100_000;

/** Asserts that every slot fits the area: nothing scrolls, and the last slot ends at its bottom. */
async function fitsArea(ctx: UiContext, when: string): Promise<void> {
  const area = await areaOf(ctx.page);
  const cards = await cardsOf(ctx.page);
  assert.equal(cards.length, SIX, `${when}: six slots.`);
  assert.equal(area.half, true, `${when}: half slots.`);
  assert.ok(
    area.scrollHeight <= area.clientHeight + 1,
    `${when}: six slots fit without scrolling (${area.scrollHeight} > ${area.clientHeight}).`,
  );
  const last = cards.at(-1);
  assert.ok(last, `${when}: a last slot.`);
  near(last.box.b, area.bottom, 1.5, `${when}: the last slot ends at the area's bottom`);
}

const warnCases: UiCase[] = [
  {
    ids: ["UX-142", "UX-144"],
    title: "STALE: the warning line takes its room and six half slots still fit above the dots",
    async run(ctx) {
      await openWith(ctx, ctx.example("stale"));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "STALE");
      assert.equal(h.warnShown, true);
      await fitsArea(ctx, "STALE");
    },
  },
  {
    ids: ["UX-142", "UX-144"],
    title:
      "LIVE to OFFLINE with no new view, then back to LIVE: the slots refit each time the warning line changes",
    async run(ctx) {
      await openWith(ctx, board(ctx, fillers(SIX)));
      assert.equal((await healthOf(ctx.page)).warnShown, false);
      await fitsArea(ctx, "LIVE");
      // Only failed polls from here: no view is drawn, so only the warning line changes the area.
      ctx.answer({ fail: "abort" });
      await ctx.page.clock.fastForward(OUTAGE_MS);
      await ctx.advance(1000);
      await settle(ctx);
      const off = await healthOf(ctx.page);
      assert.equal(off.label, "OFFLINE");
      assert.equal(off.warnShown, true);
      await fitsArea(ctx, "OFFLINE");
      ctx.answer({ body: board(ctx, fillers(SIX)) });
      await pollOnce(ctx);
      assert.equal((await healthOf(ctx.page)).warnShown, false);
      await fitsArea(ctx, "LIVE again");
    },
  },
];

export { warnCases };
