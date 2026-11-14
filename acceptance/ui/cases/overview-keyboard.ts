// Overview checks, area D: the GO TO KEYBOARD slot (MVP-11 A). The slot is found by its Title line.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import { at, COLOR, fillers, near, openWith, overviewOf, pick, reds } from "./overview-kit.ts";
import { tapCard, viewing } from "./overview-nav.ts";
import { boxOf, cardsOf, probe, runningBreaths } from "./overview-probe.ts";

const MIDDLE_DOT = "·";
const THREE_DOTS = "...";
const TWO_LINES_PX = 36.4;
const ONE_LINE_PX = 18.2;
const GTK = "GO TO KEYBOARD";

const keyboardCases: UiCase[] = [
  {
    ids: ["UX-035", "UX-047", "UX-051"],
    title:
      "A red project becomes one breathing red GO TO KEYBOARD slot, first, and leaves the list",
    async run(ctx) {
      const cards = await overviewOf(ctx, [pick("flat"), pick("red"), pick("green")]);
      const first = at(cards, 0);
      assert.equal(first.name, GTK);
      assert.equal(first.detail, "search-index T03");
      assert.equal(first.bg, COLOR.badFill);
      assert.equal(first.fg, COLOR.white);
      assert.equal(runningBreaths(first.animations).length, 1, "The red slot breathes.");
      assert.equal(first.css.timing, "ease-in-out");
      assert.equal(
        cards.filter((c) => c.name === "search-index T03").length,
        0,
        "The red project has no Card of its own.",
      );
      assert.equal(cards.length, 3);
    },
  },
  {
    ids: ["UX-048"],
    title: "Two red projects: the blurb lists their names joined by a middle dot",
    async run(ctx) {
      await openWith(ctx, ctx.example("keyboard"));
      const cards = await cardsOf(ctx.page);
      assert.equal(at(cards, 0).name, GTK);
      assert.equal(at(cards, 0).detail, `localswim V2 T06 ${MIDDLE_DOT} search-index T03`);
      assert.deepEqual(
        cards.map((c) => c.name),
        [GTK, "FGA T04"],
      );
    },
  },
  {
    ids: ["UX-049", "UX-056", "UX-030"],
    title:
      "Many red projects: one blurb of names, two lines in a full slot, one in a half slot, clipped never dotted",
    async run(ctx) {
      const one = await overviewOf(ctx, [...reds(1), ...fillers(2)]);
      const many = await overviewOf(ctx, [...reds(6), ...fillers(2)]);
      const full = at(many, 0);
      assert.equal(full.box.h, at(one, 0).box.h, "GO TO KEYBOARD never grows with the asks.");
      assert.equal(full.detailClamp, "2");
      assert.equal(full.detailClipped, true, "The names do not all fit; the rest is clipped.");
      near(full.detailBox?.h ?? 0, TWO_LINES_PX, 1, "two blurb lines in a full slot");
      assert.equal(full.detail?.includes(THREE_DOTS), false, "Three ASCII dots never stand in.");
      for (const c of many) {
        assert.equal(
          c.detailClamp ?? "2",
          "2",
          "Every Card on the screen shows the same line count.",
        );
      }
      const half = await overviewOf(ctx, [...reds(6), ...fillers(3)]);
      assert.equal(at(half, 0).detailClamp, "1");
      assert.equal(at(half, 0).detailClipped, true);
      near(at(half, 0).detailBox?.h ?? 0, ONE_LINE_PX, 1, "one blurb line in a half slot");
      assert.equal(at(half, 0).box.h, at(half, 1).box.h, "Every slot is the same height.");
    },
  },
  {
    ids: ["UX-050"],
    title: "With nothing red no slot is reserved: row one is the first green or yellow Card",
    async run(ctx) {
      const cards = await overviewOf(ctx, [pick("flat"), pick("green"), pick("yellow")]);
      assert.equal(
        cards.some((c) => c.name === GTK),
        false,
      );
      const area = await boxOf(ctx.page, "#pages .cards");
      near(at(cards, 0).box.y, area.y, 0.5, "row one starts at the top of the Card display area");
      assert.equal(at(cards, 0).name, "docs-site T02");
    },
  },
  {
    ids: ["UX-052"],
    title:
      "The remaining Cards keep alphabetical order below GO TO KEYBOARD, even when a project between them went red",
    async run(ctx) {
      const cards = await overviewOf(ctx, [
        pick("green", "alpha"),
        pick("red", "bravo"),
        pick("green", "charlie"),
      ]);
      assert.deepEqual(
        cards.map((c) => c.name),
        [GTK, "alpha T04", "charlie T04"],
      );
    },
  },
  {
    ids: ["UX-054", "UX-055"],
    title: "Tapping GO TO KEYBOARD opens the first red project's display, which shows its full ask",
    async run(ctx) {
      // Two red projects, in the server's order: localswim V2 first, then search-index.
      await openWith(ctx, ctx.example("keyboard"));
      await tapCard(ctx, GTK);
      assert.ok(
        await viewing(ctx, "localswim V2 T06"),
        "The display of the first red project opens, not the last.",
      );
      const text = await probe<string>(ctx.page, "inView().textContent");
      assert.ok(text.includes("1 ticket in Needs Terry"), "Its own display shows its full ask.");
    },
  },
];

export { keyboardCases };
