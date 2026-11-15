// Overview checks, area A, the Status line's parts, and the page's time format (MVP-11 A). The Health box's states are
// in overview-health.ts.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { COLOR, near, older, openWith, retimed, settle } from "./overview-kit.ts";
import { tapCard, viewing } from "./overview-nav.ts";
import { healthOf, probe, runningBreaths, statusBoxesOf, styleOf } from "./overview-probe.ts";

const HEADER_HEIGHT = 52;
const SHARED_HEIGHT = 34;
const IDLE_AGE_SECONDS = (12 * 60 + 5) * 60;
const GUTTER = 14;
const PAGE_WIDTH = 402;

/** A time on the page: H:mm with lowercase am/pm and no space, 12-hour (UX-194). */
const TIME = /\d{1,2}:\d{2}(?:am|pm)/u;

/**
 * Opens the page at a local time of day with every project reporting at that moment, and reads the
 * footers, which say "reported <time> by <agent>".
 */
async function footersAt(ctx: UiContext, hour: number, minute: number): Promise<string> {
  const at = new Date(2026, 10, 14, hour, minute, 30);
  await ctx.page.clock.setSystemTime(at);
  await openWith(ctx, retimed(ctx.example("afternoon"), at.getTime() / 1000));
  await ctx.advance(1000);
  return (await probe<{ foot: string }>(ctx.page, "texts()")).foot;
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
    ids: ["UX-192"],
    title:
      "Status line: mark and wordmark alone on the left; Health box and bell 8 px apart on the right",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const s = await statusBoxesOf(ctx.page);
      near(s.bell.x - s.health.r, 8, 1, "Health box to bell");
      assert.ok(s.brand.r <= s.wordmark.r, "The mark sits inside the wordmark group.");
      assert.ok(s.wordmark.r < s.health.x, "The wordmark comes before the Health box.");
      assert.equal(s.parts, 3, "The Status line holds the wordmark, the Health box and the bell.");
      near(s.bell.r, PAGE_WIDTH - GUTTER, 1, "The bell ends at the page's right gutter");
      near(s.brand.x, GUTTER, 1, "The mark starts at the left gutter");
      assert.equal(s.header.h, HEADER_HEIGHT);
    },
  },
  {
    ids: ["UX-193"],
    title: "The Status line shows no clock; the phone's own status bar shows the time",
    async run(ctx) {
      await ctx.page.clock.setSystemTime(new Date(2026, 10, 14, 14, 25, 0));
      await openWith(ctx, ctx.example("afternoon"));
      await ctx.advance(1000);
      const s = await statusBoxesOf(ctx.page);
      assert.doesNotMatch(s.headerText, TIME, `No time in the Status line ("${s.headerText}").`);
      assert.ok(s.wordmark.r < s.health.x, "The wordmark is first.");
      assert.ok(s.health.r < s.bell.x, "The bell is last.");
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
    ids: ["UX-199"],
    title: "The mark is 34 px and the wordmark 22 px, and the Status line stays 52 px tall",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const s = await statusBoxesOf(ctx.page);
      near(s.brand.w, 34, 0.5, "mark width");
      near(s.brand.h, 34, 0.5, "mark height");
      const marks = await probe<{ size: number }>(ctx.page, "wordmark()");
      near(marks.size, 22, 0.1, "wordmark size");
      assert.equal(s.header.h, HEADER_HEIGHT, "The Card display area loses no height.");
      const image = await styleOf(ctx.page, "#brand", "backgroundImage");
      assert.notEqual(image, "none", "The mark is drawn.");
      assert.ok(
        s.brand.r <= s.wordmark.r && s.brand.x >= s.wordmark.x,
        "The mark is in the wordmark group.",
      );
    },
  },
  {
    ids: ["UX-199"],
    title: "An all-done board's LIVE 12h 05m keeps at least 35 px from the wordmark",
    async run(ctx) {
      await openWith(ctx, older(ctx.example("alldone"), IDLE_AGE_SECONDS));
      const h = await healthOf(ctx.page);
      assert.equal(h.label, "LIVE", "An all-done board stays LIVE as it ages.");
      assert.equal(h.age, "12h 05m");
      const s = await statusBoxesOf(ctx.page);
      assert.ok(
        s.health.x - s.wordmark.r >= 34,
        `At least 35 px between wordmark and Health box (${(s.health.x - s.wordmark.r).toFixed(1)}).`,
      );
      assert.equal(s.header.h, HEADER_HEIGHT, "The Status line keeps one row.");
    },
  },
  {
    ids: ["UX-201"],
    title:
      "The mark and wordmark, the Health box and the bell are each 34 px tall, centered on one line",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const s = await statusBoxesOf(ctx.page);
      const parts = {
        mark: s.brand,
        "mark and wordmark group": s.wordmark,
        health: s.health,
        bell: s.bell,
      };
      for (const [name, part] of Object.entries(parts)) {
        near(part.h, SHARED_HEIGHT, 0.5, `${name} height`);
        near(part.cy, s.bell.cy, 0.5, `${name} center`);
      }
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
    ids: ["UX-194"],
    title: "A footer's time reads H:mm with lowercase am/pm and no space, 12-hour",
    async run(ctx) {
      for (const [hour, minute, text] of [
        [1, 32, "1:32am"],
        [12, 47, "12:47pm"],
        [0, 5, "12:05am"],
        [13, 0, "1:00pm"],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: each time of day is its own page load
        const foot = await footersAt(ctx, hour, minute);
        assert.ok(foot.includes(`reported ${text} by`), `${text} in the footers (${foot}).`);
      }
    },
  },
  {
    ids: ["UX-194"],
    title: "Midnight and noon read 12:00am and 12:00pm, never 0:00",
    async run(ctx) {
      for (const [hour, text] of [
        [0, "12:00am"],
        [12, "12:00pm"],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: each time of day is its own page load
        const foot = await footersAt(ctx, hour, 0);
        assert.ok(foot.includes(`reported ${text} by`), `${text} in the footers (${foot}).`);
        assert.ok(!foot.includes(" 0:00"), "Never 0:00.");
      }
    },
  },
  {
    ids: ["UX-194"],
    title: "Chart ends and the footer use one H:mm am/pm format",
    async run(ctx) {
      const quarterPast = new Date(2026, 10, 14, 15, 7, 30);
      await ctx.page.clock.setSystemTime(quarterPast);
      await openWith(ctx, retimed(ctx.example("afternoon"), quarterPast.getTime() / 1000));
      await ctx.advance(1000);
      const texts = await probe<{ foot: string; axis: string[] }>(ctx.page, "texts()");
      const time = /^\d{1,2}:\d{2}(?:am|pm)$/u;
      assert.ok(texts.axis.length >= 2, "The charts label their ends.");
      for (const label of texts.axis) {
        assert.match(label, time, "A chart end reads H:mm am/pm.");
      }
      assert.match(texts.foot, /reported \d{1,2}:\d{2}(?:am|pm) by /u);
      assert.ok(
        texts.foot.includes("reported 3:07pm by"),
        `The footer's report time (${texts.foot}) is the report's own instant, 3:07pm.`,
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
