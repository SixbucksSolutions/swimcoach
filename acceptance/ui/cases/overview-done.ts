// Overview checks for done milestones in V1 (UX-173 to UX-176): a done milestone leaves the slot grid
// for the GO CODE REVIEW line above the page dots. Black box: it reads the rendered page only.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import {
  board,
  COLOR,
  fillers,
  near,
  openWith,
  overviewOf,
  pick,
  titleOf,
} from "./overview-kit.ts";
import { areaOf, type Box, cardsOf, probe } from "./overview-probe.ts";
import { settleOn, shown } from "./project-support.ts";

/** --text #E8EEF4, the GO CODE REVIEW line's letters (docs/brand.md section 5). */
const TEXT = "rgb(232, 238, 244)";
const LINE_HEIGHT_PX = 28.2;
const SLOT_GAP_PX = 10;
const NEAR_DOTS_PX = 20;
const SLACK_PX = 1.5;

/** What the GO CODE REVIEW line looks like, and where it sits against the slots and the dots. */
interface LineInfo {
  readonly count: number;
  readonly text: string;
  readonly bg: string;
  readonly fg: string;
  readonly weight: string;
  readonly line: Box;
  readonly bar: Box;
  readonly dots: Box;
  readonly firstSlot: Box | null;
  readonly empty: string | null;
  readonly emptyBox: Box | null;
}

function lineOf(ctx: Parameters<UiCase["run"]>[0]): Promise<LineInfo> {
  return probe<LineInfo>(
    ctx.page,
    `(() => { const l = q('.doneline'); return { count: qa('.doneline').length, text: l ? l.textContent : '',
      bg: l ? cs(l).backgroundColor : '', fg: l ? cs(l).color : '', weight: l ? cs(l).fontWeight : '',
      line: box(l), bar: box(q('.donebar')), dots: box(q('#dots')), firstSlot: box(q('#pages .cards .pc')),
      empty: q('#pages > section.page .empty') ? q('#pages > section.page .empty').textContent : null,
      emptyBox: box(q('#pages > section.page .empty')) }; })()`,
  );
}

export const doneCases: UiCase[] = [
  {
    ids: ["UX-173", "UX-174"],
    title:
      "A done milestone takes no slot and counts on the GO CODE REVIEW line, even with a stale ask",
    async run(ctx) {
      const cards = await overviewOf(ctx, [
        pick("done", "finished", { needs_me: "A stale ask" }),
        ...fillers(3),
      ]);
      assert.deepEqual(
        cards.map((c) => c.name),
        fillers(3).map((p) => titleOf(ctx, p)),
        "Only the three running milestones have slots; no done Card, no GO TO KEYBOARD.",
      );
      assert.equal(
        (await areaOf(ctx.page)).half,
        false,
        "A done milestone does not count toward the four-slot threshold.",
      );
      assert.equal((await lineOf(ctx)).text, "GO CODE REVIEW · 1");
    },
  },
  {
    ids: ["UX-175"],
    title:
      "The GO CODE REVIEW line is slate, reads GO CODE REVIEW and the count, sits above the dots, and opens the first done display",
    async run(ctx) {
      const first = pick("done", "alpha");
      await openWith(ctx, board(ctx, [first, pick("green"), pick("done", "bravo")]));
      assert.equal((await cardsOf(ctx.page)).length, 1, "Only the running milestone has a slot.");
      const info = await lineOf(ctx);
      assert.equal(info.count, 1);
      assert.equal(info.text, "GO CODE REVIEW · 2");
      assert.equal(info.bg, COLOR.board, "Slate ground: --board.");
      assert.equal(info.fg, TEXT, "Full-strength letters: --text.");
      assert.equal(info.weight, "900");
      near(info.line.h, LINE_HEIGHT_PX, SLACK_PX, "the line's height");
      near(info.line.y - info.bar.y, SLOT_GAP_PX, SLACK_PX, "the gap above the line");
      assert.ok(info.line.b <= info.dots.y, "The line ends above the dots.");
      assert.ok(info.dots.y - info.line.b <= NEAR_DOTS_PX, "The line sits just above the dots.");
      assert.ok(info.firstSlot, "The running milestone has a slot.");
      near(
        info.firstSlot.y + 3 * info.firstSlot.h + 2 * SLOT_GAP_PX,
        info.bar.y,
        SLACK_PX,
        "three full slots end where the line's bar begins",
      );
      await ctx.page.locator(".doneline").tap();
      await settleOn(ctx.page, 1);
      assert.equal(
        await shown(ctx.page),
        titleOf(ctx, first),
        "The tap opens the first done display.",
      );
    },
  },
  {
    ids: ["UX-175"],
    title: "No GO CODE REVIEW line while nothing is done",
    async run(ctx) {
      await overviewOf(ctx, [pick("green"), pick("yellow"), pick("red")]);
      assert.equal((await lineOf(ctx)).count, 0);
      assert.equal(await ctx.page.locator(".donebar").count(), 0);
    },
  },
  {
    ids: ["UX-176"],
    title: "Every milestone done: Nothing running. above the GO CODE REVIEW line",
    async run(ctx) {
      await openWith(ctx, board(ctx, [pick("done", "alpha"), pick("done", "bravo")]));
      const info = await lineOf(ctx);
      assert.equal(info.empty, "Nothing running.");
      assert.equal(info.firstSlot, null, "No slots.");
      assert.equal(info.text, "GO CODE REVIEW · 2");
      assert.ok(info.emptyBox, "The all-done line is drawn.");
      assert.ok(info.emptyBox.b < info.line.y, "Nothing running. sits above the line.");
    },
  },
];
