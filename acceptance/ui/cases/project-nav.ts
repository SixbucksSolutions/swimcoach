// Project display checks, part 4: moving between displays (MVP-11 B; ledger area J, UX-113 to
// UX-124). Taps are real taps. WebKit cannot inject a touch drag, so a swipe is the touch events a
// finger raises, then the scroll the finger makes (scroll-snap settles it on the next display).
import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";
import type { UiCase } from "../types.ts";
import {
  boxOf,
  displayOf,
  find,
  type Json,
  mapAll,
  milestones,
  OVERVIEW,
  openOn,
  quiet,
  scrollLeft,
  settleOn,
  shown,
  showProject,
  squash,
  style,
  swipe,
  tapDot,
  textOf,
  until,
} from "./project-support.ts";

const PAGE_WIDTH = 402;
const SCREEN_HEIGHT = 874;
const POLL_MS = 30_000;
const QUIET_MS = 600;
const SCROLL_PX = 300;
const DOTS_ZONE_PX = 80;
const SLACK_PX = 1;

/** The dots, as the viewer sees them. */
function dots(page: Page): Locator {
  return page.locator("#dots button");
}

/** Which dots are highlighted, by position: the ones painted differently from the rest. */
async function litDots(dotsList: Locator): Promise<number[]> {
  const colors = await mapAll(dotsList, (dot) => style(dot.locator("i"), "backgroundColor"));
  const counts = new Map<string, number>();
  for (const color of colors) {
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const [common] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [""];
  return colors.flatMap((color, index) => {
    if (color === common) {
      return [];
    }
    return [index];
  });
}

/** Scrolls display number `index` down to `top` px, as a finger drag would; returns where it came to rest. */
async function scrollPage(page: Page, index: number, top: number): Promise<number> {
  return await page.evaluate(
    `(() => { const el = document.querySelector("#pages > section.page:nth-child(${index + 1})"); el.scrollTop = ${top}; return el.scrollTop; })()`,
  );
}

/** A body with one more milestone in front, copied from FGA T04 and renamed. */
function withNewFirst(body: Json): Json {
  const copy = structuredClone(body);
  const added = structuredClone(find(copy, "FGA T04"));
  added.project = "alpha-new";
  added.milestone = "M1";
  milestones(copy).unshift(added);
  return copy;
}

export const navCases: UiCase[] = [
  {
    ids: ["UX-113"],
    title: "The overview is the first display, and its dot is square",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      assert.equal(await scrollLeft(ctx.page), 0);
      assert.equal(await shown(ctx.page), OVERVIEW);
      assert.ok(
        (await ctx.page.locator("#pages > section.page").first().locator(".pc").count()) > 0,
        "The first display holds the project cards.",
      );
      assert.deepEqual(await litDots(dots(ctx.page)), [0]);
      // Square: not fully round, unlike the project dots.
      assert.notEqual(await style(dots(ctx.page).first().locator("i"), "borderRadius"), "50%");
      assert.equal(await style(dots(ctx.page).nth(1).locator("i"), "borderRadius"), "50%");
    },
  },
  {
    ids: ["UX-114"],
    title: "One further dot per project, and the active dot is the one highlighted",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      assert.equal(await dots(ctx.page).count(), 1 + milestones(body).length);
      for (const index of [3, 6, 1, 0]) {
        // biome-ignore lint/performance/noAwaitInLoops: each tap follows the one before
        await tapDot(ctx.page, index);
        assert.deepEqual(await litDots(dots(ctx.page)), [index], `Dot ${index} alone is lit.`);
      }
    },
  },
  {
    ids: ["UX-115"],
    title: "Tapping a card on the overview opens that project's display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      const card = ctx.page
        .locator("#pages > section.page")
        .first()
        .locator(".pc", { hasText: "FGA T04" });
      await card.tap();
      await settleOn(ctx.page, 3);
      assert.equal(await shown(ctx.page), "FGA T04");
      const display = displayOf(ctx.page, "FGA T04", body);
      const title = await boxOf(display.locator("h2"));
      assert.ok(
        title.x >= 0 && title.x + title.width <= PAGE_WIDTH,
        "The display's title is in view.",
      );
      assert.equal(await textOf(display.locator("h2")), "FGA T04");
    },
  },
  {
    ids: ["UX-116"],
    title: "Tapping All projects returns to the overview, from any display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      for (const index of [1, 4, 6]) {
        // biome-ignore lint/performance/noAwaitInLoops: each trip follows the one before
        await tapDot(ctx.page, index);
        const title = `${(milestones(body)[index - 1] as Json).project as string} ${(milestones(body)[index - 1] as Json).milestone as string}`;
        await displayOf(ctx.page, title, body).locator(".back").tap();
        await settleOn(ctx.page, 0);
        assert.equal(await shown(ctx.page), OVERVIEW, `Back from display ${index}.`);
        assert.deepEqual(await litDots(dots(ctx.page)), [0]);
      }
    },
  },
  {
    ids: ["UX-117"],
    title: "A swipe left moves to the next display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      await swipe(ctx.page, "left");
      await settleOn(ctx.page, 1);
      assert.deepEqual(await litDots(dots(ctx.page)), [1]);
      await swipe(ctx.page, "left");
      await settleOn(ctx.page, 2);
      assert.equal(await shown(ctx.page), "docs-site T02");
    },
  },
  {
    ids: ["UX-118"],
    title: "A swipe right moves to the previous display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      await tapDot(ctx.page, 3);
      await swipe(ctx.page, "right");
      await settleOn(ctx.page, 2);
      assert.equal(await shown(ctx.page), "docs-site T02");
      await swipe(ctx.page, "right");
      await settleOn(ctx.page, 1);
      assert.deepEqual(await litDots(dots(ctx.page)), [1]);
    },
  },
  {
    ids: ["UX-119"],
    title: "Tapping a dot jumps to that display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      await tapDot(ctx.page, 5);
      assert.equal(await shown(ctx.page), "mobile-onboarding M12");
      await tapDot(ctx.page, 2);
      assert.equal(await shown(ctx.page), "docs-site T02");
      await tapDot(ctx.page, 0);
      assert.equal(await shown(ctx.page), OVERVIEW);
    },
  },
  {
    ids: ["UX-120"],
    title: "A swipe right on the overview does nothing: the board does not wrap",
    async run(ctx) {
      await openOn(ctx, ctx.example("afternoon"));
      await swipe(ctx.page, "right");
      await quiet(ctx.page, QUIET_MS);
      assert.equal(await scrollLeft(ctx.page), 0);
      assert.equal(await shown(ctx.page), OVERVIEW);
      assert.deepEqual(await litDots(dots(ctx.page)), [0]);
    },
  },
  {
    ids: ["UX-121"],
    title: "A swipe left on the last display does nothing: the board does not wrap",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      const last = milestones(body).length;
      await tapDot(ctx.page, last);
      await swipe(ctx.page, "left");
      await quiet(ctx.page, QUIET_MS);
      assert.equal(await scrollLeft(ctx.page), last * PAGE_WIDTH);
      assert.deepEqual(await litDots(dots(ctx.page)), [last]);
    },
  },
  {
    ids: ["UX-122"],
    title: "A project display scrolls from top to bottom while the status line stays pinned",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const clock = ctx.page.locator("#clock");
      const clockAt = (await boxOf(clock)).y;
      const nameAt = (await boxOf(display.locator("h2"))).y;
      const reached = await scrollPage(ctx.page, 3, SCROLL_PX);
      assert.ok(reached > 0, "The display is taller than the screen, so it scrolls.");
      assert.ok(
        Math.abs((await boxOf(display.locator("h2"))).y - (nameAt - reached)) <= SLACK_PX,
        "The content moves up.",
      );
      assert.equal((await boxOf(clock)).y, clockAt, "The status line stays where it was.");
      await scrollPage(ctx.page, 3, SCREEN_HEIGHT * 4);
      assert.ok(
        await display.locator(".foot").isVisible(),
        "The footer is reachable at the bottom.",
      );
      assert.equal(await ctx.page.evaluate("window.scrollY"), 0, "The page itself never scrolls.");
    },
  },
  {
    ids: ["UX-123"],
    title: "The dots stay visible at the bottom on every display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await openOn(ctx, body);
      const ys: number[] = [];
      for (const index of [0, 3, 6]) {
        // biome-ignore lint/performance/noAwaitInLoops: each display follows the one before
        await tapDot(ctx.page, index);
        if (index > 0) {
          await scrollPage(ctx.page, index, SCREEN_HEIGHT * 4);
        }
        const box = await boxOf(ctx.page.locator("#dots"));
        assert.ok(
          box.y + box.height <= SCREEN_HEIGHT + SLACK_PX,
          `Display ${index}: dots on screen.`,
        );
        assert.ok(box.y >= SCREEN_HEIGHT - DOTS_ZONE_PX, `Display ${index}: dots at the bottom.`);
        ys.push(box.y);
      }
      assert.ok(
        Math.max(...ys) - Math.min(...ys) <= SLACK_PX,
        "The dots do not move between displays.",
      );
    },
  },
  {
    ids: ["UX-124"],
    title:
      "A project that appears or disappears between polls does not move the viewer off their display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "FGA T04");
      // An earlier project goes away: FGA T04 moves from display 3 to display 2, and stays in view.
      const without: Json = structuredClone(body);
      without.milestones = milestones(without).filter((m) => m.project !== "docs-site");
      ctx.answer({ body: without });
      await ctx.advance(POLL_MS);
      await until(ctx.page, "six dots", async () => (await dots(ctx.page).count()) === 6);
      await settleOn(ctx.page, 2);
      assert.equal(await shown(ctx.page), "FGA T04");
      assert.deepEqual(await litDots(dots(ctx.page)), [2]);
      assert.equal(
        squash(await displayOf(ctx.page, "FGA T04", without).locator("h2").textContent()),
        "FGA T04",
      );
      // An earlier project arrives: FGA T04 moves to display 3, and still stays in view.
      const added = withNewFirst(without);
      ctx.answer({ body: added });
      await ctx.advance(POLL_MS);
      await until(ctx.page, "seven dots", async () => (await dots(ctx.page).count()) === 7);
      await settleOn(ctx.page, 3);
      assert.equal(await shown(ctx.page), "FGA T04");
      assert.deepEqual(await litDots(dots(ctx.page)), [3]);
    },
  },
];
