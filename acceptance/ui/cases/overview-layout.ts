// Overview checks, area E: a Card's layout and the clock-hand trend arrow (MVP-11 A).
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { at, board, named, near, openWith, type Pick, pick, withBin } from "./overview-kit.ts";
import { type CardInfo, cardsOf, probe } from "./overview-probe.ts";

const BIN_NAMES = ["sharp_up", "up", "flat", "down", "sharp_down"] as const;
const DEGREES_IN_HALF_TURN = 180;

/** Five green cards, one per trend bin, from strong up to hard down. */
function binPicks(): Pick[] {
  return BIN_NAMES.map((bin, i) => withBin(`bin-${i}`, bin));
}

async function binCards(ctx: UiContext, picks: Pick[]): Promise<CardInfo[]> {
  await openWith(ctx, board(ctx, picks));
  return await cardsOf(ctx.page);
}

/** The hand's offset from the final digit's center, in px. */
function offsetOf(card: CardInfo | undefined): { dx: number; dy: number } {
  assert.ok(card?.handBox && card.pivotBox, "The Card draws a hand around the final digit.");
  return { dx: card.handBox.cx - card.pivotBox.cx, dy: card.handBox.cy - card.pivotBox.cy };
}

function binCase(ids: string[], bin: string, label: string, degrees: number): UiCase {
  return {
    ids,
    title: `Trend ${label}: the clock hand points at ${degrees} degrees from the final digit`,
    async run(ctx) {
      const cards = await binCards(ctx, [
        withBin("tracked", bin),
        pick("green", "filler-01"),
        pick("green", "filler-02"),
      ]);
      const card = at(cards, 0);
      assert.equal(card.handLabel, label);
      const { dx, dy } = offsetOf(card);
      near(
        (Math.atan2(dy, dx) * DEGREES_IN_HALF_TURN) / Math.PI,
        degrees,
        3,
        `hand angle of ${label}`,
      );
    },
  };
}

const BINS: ReadonlyArray<readonly [string[], string, string, number]> = [
  [["UX-057"], "sharp_up", "Sharp up", -90],
  [["UX-058"], "up", "Up", -45],
  [["UX-059"], "flat", "Flat", 0],
  [["UX-060"], "down", "Down", 45],
  [["UX-061"], "sharp_down", "Sharp down", 90],
];

const layoutCases: UiCase[] = [
  ...BINS.map(([ids, bin, label, degrees]) => binCase(ids, bin, label, degrees)),
  {
    ids: ["UX-062"],
    title: "Up arrows sit above the number, down arrows below it, and never beside a vertical hand",
    async run(ctx) {
      const [sharpUp, up, flat, down, sharpDown] = (await binCards(ctx, binPicks())).map(offsetOf);
      assert.ok(sharpUp && up && flat && down && sharpDown);
      assert.ok(sharpUp.dy < -20 && Math.abs(sharpUp.dx) < 3, "Strong up sits straight above.");
      assert.ok(up.dy < -10, "Up sits above.");
      assert.ok(Math.abs(flat.dy) < 3 && flat.dx > 10, "Flat sits beside, at 3 o'clock.");
      assert.ok(down.dy > 10, "Down sits below.");
      assert.ok(sharpDown.dy > 20 && Math.abs(sharpDown.dx) < 3, "Hard down sits straight below.");
    },
  },
  {
    ids: ["UX-064"],
    title: "The RTR block takes the same place on every Card, so the numbers line up",
    async run(ctx) {
      const cards = await binCards(ctx, binPicks());
      const first = at(cards, 0);
      for (const c of cards) {
        assert.ok(c.rtrBox && c.pivotBox && first.rtrBox && first.pivotBox);
        near(c.rtrBox.r, first.rtrBox.r, 0.5, "RTR block right edge");
        near(c.pivotBox.r, first.pivotBox.r, 0.5, "final digit right edge");
        near(c.rtrBox.cy - c.box.y, first.rtrBox.cy - first.box.y, 0.5, "RTR block vertical place");
      }
    },
  },
  {
    ids: ["UX-067"],
    title: "Side margins match: 18 px before the name, 18 px from a 3 o'clock hand's inked tip",
    async run(ctx) {
      const card = at(await binCards(ctx, [withBin("tracked", "flat"), pick("green", "other")]), 0);
      assert.ok(card.handBox);
      near(card.nameBox.x - card.box.x, 18, 1, "left margin to the name");
      // The arrow path ends at x = 19 of a 24-unit box, drawn with a 4-unit round cap: the tip is at 21.
      const tip = card.handBox.x + (21 / 24) * card.handBox.w;
      near(card.box.r - tip, 18, 1, "right margin to the hand's inked tip");
    },
  },
  {
    ids: ["UX-068"],
    title:
      "The Title line stays on one line: 24 px full, 20 px half, a long name shrinks to 14 px then ends clipped",
    async run(ctx) {
      const longName = pick("green", "mobile-onboarding-redesign", { milestone: "M12" });
      const full = await binCards(ctx, [longName, pick("green", "short")]);
      const short = named(full, "short T04");
      near(short.nameSize, 24, 0.1, "full slot name size");
      assert.equal(short.nameClipped, false);
      const long = named(full, "mobile-onboarding-redesign M12");
      assert.equal(long.nameSize, 14, "A long name shrinks to the 14 px floor.");
      assert.equal(long.nameClipped, true, "At the floor it ends clipped.");
      assert.equal(long.nameOverflow, "ellipsis");
      assert.ok(long.nameBox.h < 24, "The Title line is one line.");
      const half = await binCards(ctx, [
        longName,
        ...["a", "b", "c", "d"].map((p) => pick("green", `filler-${p}`)),
      ]);
      near(at(half, 1).nameSize, 20, 0.1, "half slot name size");
    },
  },
  {
    ids: ["UX-069"],
    title:
      "Detail blurb: 14 px, weight 500, indented 12 px under the Title line, with no separator",
    async run(ctx) {
      const card = named(await binCards(ctx, [pick("yellow", "bravo")]), "bravo T02");
      assert.ok(card.detailBox);
      assert.equal(card.detailSize, 14);
      assert.equal(card.detailWeight, "500");
      const indent = await probe<string>(ctx.page, "cs(q('#pages .pc .nm span')).paddingLeft");
      assert.equal(indent, "12px", "The blurb is indented 12 px.");
      near(card.detailBox.y - card.nameBox.b, 5, 1, "gap between the lines");
      const parts = await probe<string[]>(
        ctx.page,
        "qa('#pages .pc .nm > *').map((e) => e.tagName)",
      );
      assert.deepEqual(
        [...new Set(parts)].sort((a, b) => a.localeCompare(b)),
        ["B", "SPAN"],
      );
      const rule = await probe<string>(
        ctx.page,
        "cs(q('#pages .pc .nm span')).borderTopWidth + cs(q('#pages .pc .nm b')).borderBottomWidth",
      );
      assert.equal(rule, "0px0px", "Nothing draws a line between the two.");
    },
  },
];

export { layoutCases };
