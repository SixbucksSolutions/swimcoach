// Project display checks: a display whose project leaves the board while it is on screen
// (localswim swimcoach #0037; UX-187 to UX-189). Instead of an instant jump to the overview, the
// display stays, dims and says so, counts down, then returns the viewer by itself.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import {
  board,
  type Json,
  openWith,
  pause,
  pick,
  pollOnce,
  settle,
  titleOf,
} from "./overview-kit.ts";
import { settleOn, shown, tapDot } from "./project-support.ts";

const RETURN_MS = 5000;
const GLIDE_MS = 700;
const SCROLL_MS = 900;
const DIM_SETTLE_MS = 500;

function greens(ctx: UiContext, names: readonly string[]): Json {
  return board(
    ctx,
    names.map((n) => pick("green", n)),
  );
}

/** The Title line of a green card for project `name`. */
function named(ctx: UiContext, name: string): string {
  return titleOf(ctx, pick("green", name));
}

/** Opens alpha, bravo, charlie, goes to bravo's display, and has bravo stop. */
async function bravoLeaves(ctx: UiContext): Promise<void> {
  await openWith(ctx, greens(ctx, ["alpha", "bravo", "charlie"]));
  await tapDot(ctx.page, 2);
  ctx.answer({ body: greens(ctx, ["alpha", "charlie"]) });
  await pollOnce(ctx);
}

/** The departed display's notice text, or null. */
async function notice(ctx: UiContext): Promise<string | null> {
  const note = ctx.page.locator(".gone-note");
  if ((await note.count()) === 0) {
    return null;
  }
  return ((await note.textContent()) ?? "").trim();
}

export const departedCases: UiCase[] = [
  {
    ids: ["UX-187"],
    title:
      "A project display that leaves the board while on screen stays, dims and counts down, with its dot dimmed",
    async run(ctx) {
      await bravoLeaves(ctx);
      assert.equal(await shown(ctx.page), named(ctx, "bravo"), "The viewer is not ejected.");
      assert.equal(
        await notice(ctx),
        `${named(ctx, "bravo")} is off the board · back to all projects in 5 s`,
      );
      await pause(DIM_SETTLE_MS);
      const dim = await ctx.page.evaluate(
        "(() => { const s = document.querySelector('.page.departed'); const h = s.querySelector(':scope > h2'); return [getComputedStyle(h).opacity, getComputedStyle(h).filter]; })()",
      );
      assert.deepEqual(dim, ["0.4", "grayscale(1)"], "The display's content is dimmed.");
      assert.equal(
        await ctx.page.locator("#dots button").count(),
        4,
        "Its dot stays until it goes.",
      );
      assert.equal(
        await ctx.page.evaluate(
          "getComputedStyle(document.querySelector('#dots button.gone i')).opacity",
        ),
        "0.4",
      );
      await ctx.advance(2000);
      assert.equal(
        await notice(ctx),
        `${named(ctx, "bravo")} is off the board · back to all projects in 3 s`,
        "It counts down.",
      );
    },
  },
  {
    ids: ["UX-188"],
    title: "After 5 s the viewer is back on the overview by itself, and the departed display goes",
    async run(ctx) {
      await bravoLeaves(ctx);
      await ctx.advance(RETURN_MS);
      await pause(SCROLL_MS);
      await ctx.advance(GLIDE_MS);
      await settle(ctx);
      await settleOn(ctx.page, 0);
      assert.equal(await shown(ctx.page), "", "The overview is on screen.");
      assert.equal(await ctx.page.locator("#pages > section.page").count(), 3);
      assert.equal(await ctx.page.locator(".gone-note").count(), 0);
      assert.equal(await ctx.page.locator("#dots button").count(), 3);
    },
  },
  {
    ids: ["UX-188"],
    title: "A viewer who moves to another display during the countdown stays there when it ends",
    async run(ctx) {
      await bravoLeaves(ctx);
      // Displays now: overview, alpha, bravo (departed), charlie. The viewer moves on to charlie.
      await tapDot(ctx.page, 3);
      await ctx.advance(RETURN_MS);
      await pause(SCROLL_MS);
      await ctx.advance(GLIDE_MS);
      await settle(ctx);
      assert.equal(await shown(ctx.page), named(ctx, "charlie"), "The viewer is not pulled away.");
      assert.equal(
        await ctx.page.locator("#pages > section.page").count(),
        3,
        "Bravo's display went.",
      );
      assert.equal(await ctx.page.locator("#dots button").count(), 3, "And its dot.");
    },
  },
  {
    ids: ["UX-188"],
    title: "A tap on the notice goes back to the overview at once",
    async run(ctx) {
      await bravoLeaves(ctx);
      await ctx.page.locator(".gone-note button").tap();
      await settleOn(ctx.page, 0);
      assert.equal(await shown(ctx.page), "", "The overview is on screen.");
    },
  },
  {
    ids: ["UX-189"],
    title: "A project that comes back during the countdown makes its display live again",
    async run(ctx) {
      await bravoLeaves(ctx);
      // Bravo reports again within the countdown. A poll kicked now, not one 20 s of page time
      // later, which would let the 5 s return run first.
      ctx.answer({ body: greens(ctx, ["alpha", "bravo", "charlie"]) });
      const back = ctx.page.waitForResponse((r) => r.url().includes("/state"));
      // biome-ignore lint/security/noSecrets: page script text; its punctuation reads as high entropy.
      await ctx.page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await back;
      await settle(ctx);
      assert.equal(await notice(ctx), null, "No notice.");
      assert.equal(await ctx.page.locator(".page.departed").count(), 0, "No dimming.");
      await ctx.advance(RETURN_MS + GLIDE_MS);
      await settle(ctx);
      assert.equal(await shown(ctx.page), named(ctx, "bravo"), "No return: the viewer stays.");
    },
  },
];
