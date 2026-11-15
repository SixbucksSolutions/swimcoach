// Overview checks, area C (card colors, order, contents) and the card rows of M (MVP-11 A). What a
// viewer sees: computed colors as palette tokens, text, order and boxes.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import {
  board,
  COLOR,
  named,
  near,
  openWith,
  overviewOf,
  type Pick,
  pick,
  pollOnce,
  titleOf,
} from "./overview-kit.ts";
import { cardsOf, contrast, healthOf, styleOf } from "./overview-probe.ts";

const SILENT_SECONDS = 1920;
const STALLED_SECONDS = 3000;

/** The fill each card level paints with (docs/brand.md section 5). */
const FILL = {
  done: COLOR.board,
  red: COLOR.badFill,
  gray: COLOR.stack1,
  yellow: COLOR.risk,
  green: COLOR.okFill,
} as const;

interface Row {
  readonly name: string;
  readonly want: "done" | "red" | "gray" | "yellow" | "green";
  readonly blurb: string | null;
  readonly pick: Pick;
}

/** Cards that stay put whatever the first one's color: green before, yellow or green after. */
function flipBoard(color: string, reason: string): Pick[] {
  return [
    pick("green", "alpha"),
    pick("yellow", "bravo", { color, reason }),
    pick("green", "charlie"),
  ];
}

/** One milestone for every rule of the precedence table, each holding fields that tempt a later rule. */
function precedenceRows(now: number): Row[] {
  const stalled = { reason: "stalled", stalled: true, last_move_at: now - STALLED_SECONDS };
  const silent = {
    reason: "silent",
    stale: true,
    stalled: true,
    updated_at: now - SILENT_SECONDS,
  };
  return [
    { name: "p1", want: "done", blurb: "Done", pick: pick("done", "p1", { needs_me: "An ask" }) },
    {
      name: "p2",
      want: "red",
      blurb: null,
      pick: pick("red", "p2", { stale: true, stalled: true }),
    },
    { name: "p3", want: "gray", blurb: "Agent silent for 32m", pick: pick("gray", "p3", silent) },
    {
      name: "p4",
      want: "yellow",
      blurb: "Running late",
      pick: pick("late", "p4", { stalled: true }),
    },
    {
      name: "p5",
      want: "yellow",
      blurb: "No ticket moved in 50m",
      pick: pick("yellow", "p5", stalled),
    },
    { name: "p6", want: "yellow", blurb: "Toss-up", pick: pick("yellow", "p6") },
    { name: "p7", want: "gray", blurb: "Too early to call", pick: pick("gray", "p7") },
    { name: "p8", want: "green", blurb: null, pick: pick("green", "p8") },
  ];
}

const cardCases: UiCase[] = [
  {
    ids: ["UX-031"],
    title: "Cards keep the server's order, and the Title line is project, a space, milestone",
    async run(ctx) {
      const picks = [
        pick("gray"),
        pick("yellow"),
        pick("green"),
        pick("done"),
        pick("late"),
        pick("red"),
      ];
      const cards = await overviewOf(ctx, picks);
      // Red leaves for GO TO KEYBOARD and done for the GO CODE REVIEW line (UX-173).
      const wanted = [
        "GO TO KEYBOARD",
        ...picks.filter((p) => p.kind !== "red" && p.kind !== "done").map((p) => titleOf(ctx, p)),
      ];
      assert.deepEqual(
        cards.map((c) => c.name),
        wanted,
      );
      assert.deepEqual(wanted.slice(1, 4), ["auth-refresh M3", "docs-site T02", "FGA T04"]);
    },
  },
  {
    ids: ["UX-032"],
    title: "A Card never changes position when its color changes",
    async run(ctx) {
      const before = await overviewOf(ctx, flipBoard("yellow", "toss_up"));
      assert.equal(named(before, "bravo T02").bg, COLOR.risk);
      ctx.answer({ body: board(ctx, flipBoard("green", "on_time")) });
      await pollOnce(ctx);
      const after = await cardsOf(ctx.page);
      assert.equal(named(after, "bravo T02").bg, COLOR.okFill);
      assert.deepEqual(
        after.map((c) => c.name),
        before.map((c) => c.name),
      );
      assert.deepEqual(
        after.map((c) => c.box.y),
        before.map((c) => c.box.y),
      );
    },
  },
  {
    ids: ["UX-038", "UX-040", "UX-039"],
    title:
      "Yellow Cards: Running late, Toss-up and No ticket moved each name their reason on yellow",
    async run(ctx) {
      const now = Number(ctx.example("afternoon").now);
      const cards = await overviewOf(ctx, [
        pick("yellow", "alpha"),
        pick("late", "bravo"),
        pick("yellow", "charlie", {
          reason: "stalled",
          stalled: true,
          last_move_at: now - STALLED_SECONDS,
        }),
      ]);
      const expected: ReadonlyArray<readonly [string, string]> = [
        ["alpha T02", "Toss-up"],
        ["bravo M12", "Running late"],
        ["charlie T02", "No ticket moved in 50m"],
      ];
      for (const [name, words] of expected) {
        const card = named(cards, name);
        assert.equal(card.bg, COLOR.risk);
        assert.equal(card.fg, COLOR.riskText);
        assert.equal(card.detail, words);
        assert.ok(card.rtr, "A yellow Card shows its RTR.");
        assert.ok(card.handBox, "A yellow Card shows its hand.");
      }
    },
  },
  {
    ids: ["UX-041", "UX-063"],
    title: "Gray (too early): Too early to call, the RTR, and no arrow",
    async run(ctx) {
      const card = named(await overviewOf(ctx, [pick("gray")]), "auth-refresh M3");
      assert.equal(card.bg, COLOR.stack1);
      assert.equal(card.fg, COLOR.grayText);
      assert.equal(card.detail, "Too early to call");
      assert.equal(card.rtr, "2.02");
      assert.equal(card.handBox, null, "A gray Card draws no clock hand.");
    },
  },
  {
    ids: ["UX-042"],
    title: "Green: the name, the RTR and the arrow, and no blurb",
    async run(ctx) {
      const card = named(await overviewOf(ctx, [pick("green")]), "FGA T04");
      assert.equal(card.bg, COLOR.okFill);
      assert.equal(card.detail, null);
      assert.equal(card.rtr, "1.25");
      assert.equal(card.handLabel, "Sharp up");
    },
  },
  {
    ids: ["UX-043"],
    title:
      "Green fill is --ok-fill with pure white text, contrast 7:1 or better, and no second green",
    async run(ctx) {
      await openWith(ctx, ctx.example("allgreen"));
      const cards = await cardsOf(ctx.page);
      assert.equal(cards.length, 3);
      for (const c of cards) {
        assert.equal(c.bg, COLOR.okFill);
        assert.equal(c.fg, COLOR.white);
        assert.ok(contrast(c.bg, c.fg) >= 7, `Contrast ${contrast(c.bg, c.fg)} is below 7:1.`);
      }
      near(contrast(COLOR.okFill, COLOR.white), 7.11, 0.02, "the measured contrast");
      assert.equal(
        (await healthOf(ctx.page)).bg,
        COLOR.okFill,
        "The LIVE box uses the same green.",
      );
      assert.equal(await styleOf(ctx.page, "#pages .pc .rt", "opacity"), "1");
    },
  },
  {
    ids: ["UX-044"],
    title: "Backlog and Blocked never appear on a Card or a display",
    async run(ctx) {
      await openWith(ctx, ctx.example("afternoon"));
      const text = await ctx.page.locator("#phone").textContent();
      assert.doesNotMatch(text ?? "", /backlog|blocked/iu);
    },
  },
  {
    ids: ["UX-046"],
    title: "A board that mixes all five looks reads at a glance: five distinct fills",
    async run(ctx) {
      const cards = await overviewOf(ctx, [
        pick("gray"),
        pick("yellow"),
        pick("green"),
        pick("done"),
        pick("red"),
      ]);
      // The done look is now the GO CODE REVIEW line's slate (UX-175), not a Card.
      const doneLine = await styleOf(ctx.page, ".doneline", "backgroundColor");
      const fills = [...new Set([...cards.map((c) => c.bg), doneLine])].sort((a, b) =>
        a.localeCompare(b),
      );
      const expected = [COLOR.badFill, COLOR.board, COLOR.okFill, COLOR.risk, COLOR.stack1].sort(
        (a, b) => a.localeCompare(b),
      );
      assert.deepEqual(fills, expected);
    },
  },
  {
    ids: ["UX-148", "UX-152"],
    title:
      "A silent agent alone keeps the box LIVE and makes its Card gray with Agent silent for, the RTR, and no arrow",
    async run(ctx) {
      await openWith(ctx, ctx.example("silent"));
      const cards = await cardsOf(ctx.page);
      const silent = named(cards, "mobile-onboarding M12");
      assert.equal(silent.bg, COLOR.stack1);
      assert.equal(silent.detail, "Agent silent for 32m");
      assert.equal(silent.rtr, "0.89");
      assert.equal(silent.handBox, null);
      assert.equal(named(cards, "FGA T04").bg, COLOR.okFill);
      assert.equal(
        (await healthOf(ctx.page)).label,
        "LIVE",
        "One silent agent leaves the box LIVE.",
      );
    },
  },
  {
    ids: ["UX-149"],
    title:
      "Precedence: the Card paints what the first matching rule says, whatever the other fields hold",
    async run(ctx) {
      const rows = precedenceRows(Number(ctx.example("afternoon").now));
      const cards = await overviewOf(
        ctx,
        rows.map((r) => r.pick),
      );
      assert.equal(cards[0]?.name, "GO TO KEYBOARD");
      assert.equal(
        cards[0]?.detail?.startsWith("p2 T03"),
        true,
        "The red row opens GO TO KEYBOARD.",
      );
      // Done ranks first, so p1, despite its ask, has no Card and no GO TO KEYBOARD: it is counted on
      // the GO CODE REVIEW line (UX-173, UX-174).
      assert.equal(
        cards.some((c) => c.name.startsWith("p1 ")),
        false,
        "The done row has no Card.",
      );
      assert.equal(
        (await ctx.page.locator(".doneline").textContent())?.trim(),
        "GO CODE REVIEW · 1",
      );
      for (const row of rows.filter((r) => r.want !== "red" && r.want !== "done")) {
        const card = cards.find((c) => c.name.startsWith(`${row.name} `));
        assert.ok(card, `${row.name} has a Card.`);
        assert.equal(card.bg, FILL[row.want], `${row.name} fill`);
        assert.equal(card.detail, row.blurb, `${row.name} blurb`);
      }
    },
  },
];

export { cardCases };
