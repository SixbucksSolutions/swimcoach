// Overview motion at its edges (localswim swimcoach #0035; UX-178, UX-190): a project display that
// goes away while it is on screen, and a poll that lands while a card is still leaving. Both were
// found by PR #54's independent review. The recorder comes from overview-motion.ts.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { board, type Json, openWith, POLL_MS, pause, pick, pollOnce } from "./overview-kit.ts";
import { GHOST_GONE_MS, movesOf, RECORDER } from "./overview-motion.ts";
import { tapDot } from "./project-support.ts";

function greens(ctx: UiContext, names: readonly string[]): Json {
  return board(
    ctx,
    names.map((n) => pick("green", n)),
  );
}

function isStatePoll(url: string): boolean {
  return url.includes("/state");
}

export const motionEdgeCases: UiCase[] = [
  {
    ids: ["UX-190"],
    title: "Nothing on the overview moves when the project display on screen goes away",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, greens(ctx, ["alpha", "bravo", "charlie"]));
      // The viewer reads bravo's display; bravo stops. The overview was off screen as the poll landed,
      // so nothing on it moves. Since #0037 the departed display stays and its notice fades in
      // (UX-187); that is the one motion, and it is on the departed display, not the overview.
      await tapDot(ctx.page, 2);
      await movesOf(ctx);
      ctx.answer({ body: greens(ctx, ["alpha", "charlie"]) });
      await pollOnce(ctx);
      const moves = (await movesOf(ctx)).filter((m) => m.who !== "gone-note");
      assert.deepEqual(moves, [], "No card streaks across the overview.");
      assert.equal(await ctx.page.locator(".ghost").count(), 0, "No ghost is drawn.");
    },
  },
  {
    ids: ["UX-178"],
    title:
      "A poll that lands while a card is leaving leaves no ghost and keeps the GO CODE REVIEW line",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, greens(ctx, ["alpha", "bravo", "charlie"]));
      // Bravo stops: its exit starts (0.3 s of real time).
      ctx.answer({ body: greens(ctx, ["alpha", "charlie"]) });
      const first = ctx.page.waitForResponse((r) => isStatePoll(r.url()));
      await ctx.advance(POLL_MS);
      await first;
      assert.equal(await ctx.page.locator(".ghost").count(), 1, "Bravo is mid-exit.");
      // A second poll lands at once, as when the app wakes and two polls arrive together, and a
      // milestone has gone done.
      ctx.answer({
        body: board(ctx, [pick("green", "alpha"), pick("green", "charlie"), pick("done", "delta")]),
      });
      const second = ctx.page.waitForResponse((r) => isStatePoll(r.url()));
      // biome-ignore lint/security/noSecrets: page script text; its punctuation reads as high entropy.
      await ctx.page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await second;
      await pause(GHOST_GONE_MS);
      assert.equal(await ctx.page.locator(".ghost").count(), 0, "No ghost remains.");
      assert.equal(await ctx.page.locator(".donebar").count(), 1, "One GO CODE REVIEW bar.");
      assert.equal(
        (await ctx.page.locator(".doneline").textContent())?.trim(),
        "GO CODE REVIEW · 1",
      );
      assert.equal(
        await ctx.page.evaluate("getComputedStyle(document.querySelector('.donebar')).position"),
        "sticky",
        "The bar is the real one, not an adopted ghost.",
      );
      assert.equal(await ctx.page.locator("#pages .cards > .pc").count(), 2, "Alpha and charlie.");
    },
  },
];
