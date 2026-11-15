// Project display checks: the mark and wordmark as a way home (UX-200). A tap on either goes back to
// the overview from any project display, as "All projects" does, and does nothing on the overview.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import { pause } from "./overview-kit.ts";
import { OVERVIEW, openOn, scrollLeft, settleOn, shown, tapDot } from "./project-support.ts";

/** Longer than any smooth scroll the page starts, so a glide would have moved the strip by now. */
const GLIDE_MS = 800;

const homeCases: UiCase[] = [
  {
    ids: ["UX-200"],
    title: "Tapping the mark or the wordmark returns to the overview, and does nothing on it",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      await ctx.page.locator("header h1 .word").tap();
      await pause(GLIDE_MS);
      assert.equal(await scrollLeft(ctx.page), 0, "On the overview, the tap starts no glide.");
      assert.equal(await shown(ctx.page), OVERVIEW, "On the overview, the tap stays there.");
      await ctx.page.locator("#health").tap();
      await ctx.page.locator("#snd").tap();
      await pause(GLIDE_MS);
      assert.equal(await scrollLeft(ctx.page), 0, "The Health box and bell do not navigate.");
      for (const [index, part] of [
        [1, "header h1 .word"],
        [4, "#brand"],
        [6, "header h1 .word"],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: each trip follows the one before
        await tapDot(ctx.page, index);
        await settleOn(ctx.page, index);
        await ctx.page.locator(part).tap();
        await settleOn(ctx.page, 0);
        assert.equal(await shown(ctx.page), OVERVIEW, `Back from display ${index} by ${part}.`);
      }
    },
  },
];

export { homeCases };
