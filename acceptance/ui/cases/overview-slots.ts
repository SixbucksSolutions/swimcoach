// Overview checks, area B (slot modes) and the grid, size and geometry rows of E and M (MVP-11 A).
// All at 402 x 874 CSS px unless a case says it resizes. Measured figures carry about 1 px of room.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { at, board, near, openWith, type Pick, pick, settle, withBin } from "./overview-kit.ts";
import {
  type Area,
  areaOf,
  boxOf,
  type CardInfo,
  cardsOf,
  probe,
  styleOf,
} from "./overview-probe.ts";

const GAP = 10;
const FULL_SLOTS = 3;
const HALF_SLOTS = 6;
const HALF_SLOT_FLOOR = 83.5;
const PHONE_AREA = 625; // the home-screen app's page height on the phone (UX-144)
const STATUS_LINE = 52;
const DOTS = 32;

/** `n` quiet green Cards in server order. */
function quiet(n: number): Pick[] {
  return Array.from({ length: n }, (_, i) =>
    pick("green", `slot-${String(i + 1).padStart(2, "0")}`),
  );
}

async function show(ctx: UiContext, picks: readonly Pick[]): Promise<CardInfo[]> {
  await openWith(ctx, board(ctx, picks));
  return await cardsOf(ctx.page);
}

/** A full slot is a third of the area less its gaps; a half slot a sixth. */
function fullSlot(a: Area): number {
  return (a.bottom - a.top - 2 * GAP) / FULL_SLOTS;
}

function halfSlot(a: Area): number {
  return (a.bottom - a.top - 5 * GAP) / HALF_SLOTS;
}

async function setViewport(ctx: UiContext, height: number): Promise<void> {
  await ctx.page.setViewportSize({ width: 402, height });
  await settle(ctx);
}

/** Distance from a Card's hand to the nearest Card edge. */
function edgeOf(card: CardInfo | undefined): number {
  assert.ok(card?.handBox, "The Card draws a hand.");
  return Math.min(
    card.handBox.y - card.box.y,
    card.box.b - card.handBox.b,
    card.box.r - card.handBox.r,
  );
}

const slotCases: UiCase[] = [
  {
    ids: ["UX-141", "UX-027"],
    title:
      "The 3/6 grid: one to three slots are full, each a third of the area; four or more are half",
    async run(ctx) {
      for (const n of [1, 2, 3]) {
        // biome-ignore lint/performance/noAwaitInLoops: each count opens its own board in turn
        const cards = await show(ctx, quiet(n));
        const area = await areaOf(ctx.page);
        assert.equal(area.half, false, `${n} slots are full height.`);
        for (const c of cards) {
          near(c.box.h, fullSlot(area), 0.6, `${n} slots: a full slot is a third of the area`);
        }
        near(at(cards, 0).box.y, area.top, 0.5, "slots start at the top of the area");
        if (n < FULL_SLOTS) {
          assert.ok(
            at(cards, n - 1).box.b < area.bottom - 50,
            `${n} slots leave empty space below.`,
          );
        }
      }
      for (const n of [4, 5, 6]) {
        // biome-ignore lint/performance/noAwaitInLoops: each count opens its own board in turn
        const cards = await show(ctx, quiet(n));
        const area = await areaOf(ctx.page);
        assert.equal(area.half, true, `${n} slots are half height.`);
        assert.equal(
          new Set(cards.map((c) => c.box.h.toFixed(1))).size,
          1,
          "Every slot is as tall.",
        );
        near(
          at(cards, 0).box.h,
          halfSlot(area),
          0.6,
          `${n} slots: a half slot is a sixth of the area`,
        );
      }
    },
  },
  {
    ids: ["UX-143"],
    title: "GO TO KEYBOARD takes one slot and counts toward the four-slot threshold",
    async run(ctx) {
      const red = pick("red", "needs-you", { needs_me: "An ask" });
      await show(ctx, [red, ...quiet(2)]);
      assert.equal(
        (await areaOf(ctx.page)).half,
        false,
        "GO TO KEYBOARD and two Cards are three slots.",
      );
      const cards = await show(ctx, [red, ...quiet(3)]);
      assert.equal((await areaOf(ctx.page)).half, true, "GO TO KEYBOARD and three Cards are four.");
      assert.equal(cards.length, 4);
      const two = await show(ctx, [
        pick("red", "needs-you", { needs_me: "An ask" }),
        pick("red", "needs-too", { needs_me: "Another ask" }),
        ...quiet(2),
      ]);
      assert.equal(two.length, 3, "Two red projects share the one slot.");
      assert.equal((await areaOf(ctx.page)).half, false);
    },
  },
  {
    ids: ["UX-142", "UX-144"],
    title:
      "More than six slots scroll; slot height follows the measured area, so six half slots fit a 625 px area",
    async run(ctx) {
      const seven = await show(ctx, quiet(7));
      const sevenArea = await areaOf(ctx.page);
      assert.equal(sevenArea.overflowY, "auto");
      assert.ok(sevenArea.scrollHeight > sevenArea.clientHeight, "Seven slots scroll.");
      assert.ok(
        at(seven, 0).box.h >= HALF_SLOT_FLOOR - 0.1,
        "A slot never shrinks below its content.",
      );
      await show(ctx, quiet(6));
      const six = await areaOf(ctx.page);
      assert.ok(six.scrollHeight <= six.clientHeight + 1, "Six slots fit without scrolling.");
      // The page is the viewport less the Status line and the dots at this size.
      await setViewport(ctx, PHONE_AREA + STATUS_LINE + DOTS);
      const phone = await areaOf(ctx.page);
      near(phone.clientHeight, PHONE_AREA, 1, "the page's height after the resize");
      assert.ok(phone.scrollHeight <= phone.clientHeight + 1, "Six half slots fit in 625 px.");
      near(at(await cardsOf(ctx.page), 0).box.h, halfSlot(phone), 0.6, "slots follow the area");
      await setViewport(ctx, 500);
      await openWith(ctx, board(ctx, quiet(7)));
      const small = await areaOf(ctx.page);
      near(
        at(await cardsOf(ctx.page), 0).box.h,
        HALF_SLOT_FLOOR,
        0.3,
        "On a short screen a half slot holds at its content minimum",
      );
      assert.ok(small.scrollHeight > small.clientHeight);
    },
  },
  {
    ids: ["UX-145"],
    title: "RTR weight 900, 52 px in a full slot and about 33.4 px in a half slot",
    async run(ctx) {
      const full = at(await show(ctx, quiet(3)), 0);
      assert.equal(full.rtrWeight, "900");
      near(full.rtrSize ?? 0, 52, 0.1, "RTR size in a full slot");
      const half = at(await show(ctx, quiet(4)), 0);
      assert.equal(half.rtrWeight, "900");
      near(half.rtrSize ?? 0, 33.4, 0.6, "RTR size in a half slot");
    },
  },
  {
    ids: ["UX-146"],
    title: "The clock hand stays at least 16 px from the Card edge: about 56 px full, 16 px half",
    async run(ctx) {
      const hands = [withBin("tracked", "sharp_up"), withBin("tracking", "sharp_down")];
      const full = await show(ctx, hands);
      near(edgeOf(at(full, 0)), 56, 2, "hand to Card edge, full slot, 12 o'clock");
      near(edgeOf(at(full, 1)), 56, 2, "hand to Card edge, full slot, 6 o'clock");
      const half = await show(ctx, [...hands, ...quiet(2)]);
      assert.ok(edgeOf(at(half, 0)) >= 15.5, `Half slot, 12 o'clock: ${edgeOf(at(half, 0))} px.`);
      assert.ok(edgeOf(at(half, 1)) >= 15.5, `Half slot, 6 o'clock: ${edgeOf(at(half, 1))} px.`);
    },
  },
  {
    ids: ["UX-029"],
    title:
      "The Health box sits 13 px below the top and the Card display area starts 24 px below it",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const health = await boxOf(ctx.page, "#health");
      const cards = await boxOf(ctx.page, "#pages .cards");
      near(health.y, 13, 1, "Health box from the top");
      near(cards.y - health.b, 24, 1, "Health box to the Card display area");
    },
  },
  {
    ids: ["UX-170"],
    title:
      "Inside a Card at the content minimum: 18 px below the last blurb line, and 15.4 px above the Title line's box",
    async run(ctx) {
      await setViewport(ctx, 420);
      const asks = ["alpha", "bravo"].map((p) =>
        pick("red", `${p}-payments-platform-migration`, { needs_me: "An ask" }),
      );
      const [kbd] = await show(ctx, [...asks, ...quiet(2)]);
      assert.ok(kbd?.detailBox, "GO TO KEYBOARD has a blurb.");
      assert.equal(kbd.name, "GO TO KEYBOARD");
      near(kbd.box.h, 101.7, 0.4, "a full slot at the content minimum");
      near(kbd.box.b - kbd.detailBox.b, 18, 1, "room below the last blurb line");
      // Measured 2026-11-14 in WebKit at 402 x 874 on mocks/index.html and on the page: both put the
      // Title line's box 15.39 px below the Card's top edge (capitals about 19 px by WebKit's font
      // metrics). UX-170 records this; it supersedes UX-070's "18 px above the Title line".
      near(kbd.nameBox.y - kbd.box.y, 15.4, 0.5, "room above the Title line's box");
    },
  },
  {
    ids: ["UX-153"],
    title:
      "On a desktop browser the page is a centered 402 x 874 column with no bezel and no side panel",
    async run(ctx) {
      await ctx.page.setViewportSize({ width: 1280, height: 960 });
      await openWith(ctx, ctx.example("afternoon"));
      const phone = await boxOf(ctx.page, "#phone");
      near(phone.w, 402, 0.5, "column width");
      near(phone.h, 874, 0.5, "column height");
      near(phone.cx, 640, 14, "the column is centered");
      assert.equal(await styleOf(ctx.page, "#phone", "borderTopWidth"), "0px");
      assert.equal(await styleOf(ctx.page, "#phone", "boxShadow"), "none");
      const siblings = await probe<number>(
        ctx.page,
        "qa('body > *').filter((e) => cs(e).display !== 'none' && !['SCRIPT', 'STYLE'].includes(e.tagName)).length",
      );
      assert.equal(siblings, 1, "Nothing but the column is on the page.");
      assert.equal((await cardsOf(ctx.page)).length, 6);
    },
  },
];

export { slotCases };
