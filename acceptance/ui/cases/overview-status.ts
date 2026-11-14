// Overview checks, area A, the Status line's parts and clock (MVP-11 A). The Health box's states are
// in overview-health.ts.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { COLOR, near, older, openWith, retimed, settle } from "./overview-kit.ts";
import { tapCard, viewing } from "./overview-nav.ts";
import { healthOf, probe, runningBreaths, statusBoxesOf, styleOf } from "./overview-probe.ts";

const HEADER_HEIGHT = 52;
const GUTTER = 14;
const PAGE_WIDTH = 402;

/** Opens the page at a local time of day (before any poll), with `body`, and runs the clock tick. */
async function openAtLocalTime(
  ctx: UiContext,
  body: Record<string, unknown>,
  hour: number,
  minute: number,
): Promise<void> {
  await ctx.page.clock.setSystemTime(new Date(2026, 10, 14, hour, minute, 0));
  await openWith(ctx, body);
  await ctx.advance(1000);
}

/** Moves the page's wall clock to a local time of day and runs one tick, then reads the clock. */
async function clockAt(ctx: UiContext, hour: number, minute: number): Promise<string> {
  await ctx.page.clock.setSystemTime(new Date(2026, 10, 14, hour, minute, 0));
  await ctx.advance(1000);
  return await probe<string>(ctx.page, "q('#clock').textContent");
}

const statusCases: UiCase[] = [
  {
    ids: ["UX-162", "UX-009"],
    title: "An empty board reads LIVE with no age, a breathing dot, over the empty-state line",
    async run(ctx) {
      ctx.answer({ body: ctx.example("empty") });
      await ctx.open();
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE");
      assert.equal(h.bg, COLOR.okFill);
      assert.equal(h.age, "");
      assert.equal(
        (await ctx.page.locator("#pages .empty").textContent())?.trim(),
        "No reports yet today.",
      );
      assert.equal(runningBreaths(h.dot).length, 1, "The LIVE dot breathes.");
    },
  },
  {
    ids: ["UX-001"],
    title:
      "Status line: mark and wordmark alone on the left; clock, Health box and bell 8 px apart on the right",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const s = await statusBoxesOf(ctx.page);
      near(s.health.x - s.clock.r, 8, 1, "clock to Health box");
      near(s.bell.x - s.health.r, 8, 1, "Health box to bell");
      assert.ok(s.brand.r <= s.wordmark.r, "The mark sits inside the wordmark group.");
      assert.ok(s.wordmark.r < s.clock.x, "Nothing sits between the wordmark and the clock.");
      near(s.bell.r, PAGE_WIDTH - GUTTER, 1, "The bell ends at the page's right gutter");
      near(s.brand.x, GUTTER, 1, "The mark starts at the left gutter");
      assert.equal(s.header.h, HEADER_HEIGHT);
    },
  },
  {
    ids: ["UX-003"],
    title: "The clock is left of the Health box, never right of it",
    async run(ctx) {
      await openAtLocalTime(ctx, ctx.example("afternoon"), 14, 25);
      const s = await statusBoxesOf(ctx.page);
      assert.ok(s.clock.r < s.health.x, "The clock ends before the Health box starts.");
      assert.ok(s.health.r < s.bell.x, "The bell is last.");
      assert.ok(s.wordmark.r < s.clock.x, "The wordmark is first.");
      assert.equal(s.clockText, "2:25pm");
    },
  },
  {
    ids: ["UX-004"],
    title: 'Wordmark: "swim" in lane blue, "coach" in lane amber',
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const marks = await probe<{ text: string; swim: string; coach: string }>(
        ctx.page,
        "wordmark()",
      );
      assert.equal(marks.text.replace(/\s/gu, ""), "swimcoach");
      assert.equal(marks.swim, COLOR.laneBlue);
      assert.equal(marks.coach, COLOR.laneAmber);
    },
  },
  {
    ids: ["UX-005"],
    title: "The mark sits beside the wordmark at 26 px",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const s = await statusBoxesOf(ctx.page);
      near(s.brand.w, 26, 0.5, "mark width");
      near(s.brand.h, 26, 0.5, "mark height");
      const image = await styleOf(ctx.page, "#brand", "backgroundImage");
      assert.notEqual(image, "none", "The mark is drawn.");
      assert.ok(
        s.brand.r <= s.wordmark.r && s.brand.x >= s.wordmark.x,
        "The mark is in the wordmark group.",
      );
    },
  },
  {
    ids: ["UX-002"],
    title: "The Status line on a project display looks and sits as on the overview",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const before = await statusBoxesOf(ctx.page);
      await tapCard(ctx, "FGA T04");
      assert.ok(await viewing(ctx, "FGA T04"), "The display slid over.");
      await settle(ctx);
      const after = await statusBoxesOf(ctx.page);
      assert.deepEqual(after, before, "Every part of the Status line keeps its box.");
    },
  },
  {
    ids: ["UX-006"],
    title: "The clock reads H:mm with lowercase am/pm and no space, 12-hour",
    async run(ctx) {
      await openAtLocalTime(ctx, ctx.example("afternoon"), 1, 32);
      assert.equal((await statusBoxesOf(ctx.page)).clockText, "1:32am");
      assert.equal(await clockAt(ctx, 12, 47), "12:47pm");
      assert.equal(await clockAt(ctx, 0, 5), "12:05am");
      assert.equal(await clockAt(ctx, 13, 0), "1:00pm");
    },
  },
  {
    ids: ["UX-007"],
    title: "Midnight and noon read 12:00am and 12:00pm, never 0:00",
    async run(ctx) {
      await openAtLocalTime(ctx, ctx.example("afternoon"), 0, 0);
      assert.equal((await statusBoxesOf(ctx.page)).clockText, "12:00am");
      assert.equal(await clockAt(ctx, 12, 0), "12:00pm");
    },
  },
  {
    ids: ["UX-008"],
    title: "Chart ends and the footer use the clock's H:mm am/pm format",
    async run(ctx) {
      const quarterPast = new Date(2026, 10, 14, 15, 7, 30);
      await ctx.page.clock.setSystemTime(quarterPast);
      await openWith(ctx, retimed(ctx.example("afternoon"), quarterPast.getTime() / 1000));
      await ctx.advance(1000);
      const texts = await probe<{ clock: string; foot: string; axis: string[] }>(
        ctx.page,
        "texts()",
      );
      const time = /^\d{1,2}:\d{2}(?:am|pm)$/u;
      assert.ok(texts.axis.length >= 2, "The charts label their ends.");
      for (const label of texts.axis) {
        assert.match(label, time, "A chart end reads H:mm am/pm.");
      }
      assert.match(texts.foot, /reported \d{1,2}:\d{2}(?:am|pm) by /u);
      assert.ok(
        texts.foot.includes(`reported ${texts.clock} by`),
        `The footer's report time (${texts.foot}) matches the clock (${texts.clock}) for the same instant.`,
      );
    },
  },
  {
    ids: ["UX-009"],
    title: "Health box LIVE: bold white LIVE on --ok-fill, breathing dot, no age under a minute",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE");
      assert.equal(h.bg, COLOR.okFill);
      assert.equal(h.fg, COLOR.white);
      assert.equal(h.weight, "800");
      assert.equal(h.age, "");
      assert.equal(runningBreaths(h.dot).length, 1, "The dot breathes.");
    },
  },
  {
    ids: ["UX-010"],
    title: "Health box LIVE shows its age once the newest report is a minute old",
    async run(ctx) {
      await openWith(ctx, older(ctx.example("afternoon"), 7 * 60));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE");
      assert.equal(h.age, "7m");
      assert.equal(h.bg, COLOR.okFill);
      assert.equal(h.warnShown, false);
      // A minute old shows, 59 seconds does not.
      await openWith(ctx, older(ctx.example("afternoon"), 59));
      assert.equal((await healthOf(ctx.page)).age, "");
    },
  },
];

export { statusCases };
