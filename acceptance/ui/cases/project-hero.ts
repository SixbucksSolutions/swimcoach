// Project display checks, part 1: the top of a display (MVP-11 B; ledger area G, UX-077 to UX-082
// and UX-092). The examples' afternoon board has one of each look: FGA T04 green and rising,
// docs-site T02 yellow and falling, auth-refresh M3 gray (too early), search-index T03 red (an ask),
// localswim V2 T06 done.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import {
  boxOf,
  displayOf,
  durText,
  edit,
  find,
  type Json,
  plain,
  showProject,
  style,
  tagOf,
  textOf,
  token,
} from "./project-support.ts";

const FONT_BLACK = "900";
const SILENT_SECONDS = 1800;
const OVERLAP_SLACK_PX = 1;
const CENTER_SLACK_PX = 2;

/** True when two boxes share any area, ignoring a pixel of rounding. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width - OVERLAP_SLACK_PX &&
    b.x < a.x + a.width - OVERLAP_SLACK_PX &&
    a.y < b.y + b.height - OVERLAP_SLACK_PX &&
    b.y < a.y + a.height - OVERLAP_SLACK_PX
  );
}

export const heroCases: UiCase[] = [
  {
    ids: ["UX-077"],
    title: "A project display starts with the All projects back link, then the project name",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const first = display.locator(":scope > *").nth(0);
      const second = display.locator(":scope > *").nth(1);
      assert.equal(await textOf(first), "‹ All projects");
      assert.equal(await textOf(second), "FGA T04");
      assert.equal(await tagOf(second), "H2");
      assert.ok((await boxOf(first)).y < (await boxOf(second)).y);
      assert.ok(await first.isVisible(), "The back link is on screen.");
    },
  },
  {
    ids: ["UX-078"],
    title: "The large RTR is weight 900, in the display's state color, with a clock-hand arrow",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const cases: [string, string, string, string][] = [
        ["FGA T04", "1.25", "--ok", "Sharp up"],
        ["docs-site T02", "1.00", "--risk", "Sharp down"],
        ["mobile-onboarding M12", "0.46", "--risk", "Down"],
      ];
      // One page load per display would be slow; the afternoon board is one load, three displays.
      await showProject(ctx, body, "FGA T04");
      await Promise.all(
        cases.map(async ([title, rtr, tone, hand]) => {
          const big = displayOf(ctx.page, title, body).locator(".hero .big");
          assert.equal(await plain(big), rtr, `${title}: the large RTR`);
          assert.equal(await style(big, "fontWeight"), FONT_BLACK, `${title}: weight`);
          assert.equal(await style(big, "color"), await token(ctx.page, tone), `${title}: color`);
          const arrow = big.locator("svg.hand");
          assert.equal(await arrow.count(), 1, `${title}: one clock hand`);
          assert.equal(await arrow.getAttribute("aria-label"), hand, `${title}: hand angle name`);
        }),
      );
    },
  },
  {
    ids: ["UX-079"],
    title: "The trend bin and the call are in words beside the large RTR",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "FGA T04");
      const cases: [string, string, string][] = [
        ["FGA T04", "RTR · sharp up", "On time"],
        ["docs-site T02", "RTR · sharp down", "Toss-up"],
        ["mobile-onboarding M12", "RTR · down", "Running late"],
      ];
      await Promise.all(
        cases.map(async ([title, trend, call]) => {
          const hero = displayOf(ctx.page, title, body).locator(".hero");
          assert.equal(await textOf(hero.locator(".lab")), `${trend} ${call}`, title);
          assert.equal(await textOf(hero.locator(".lab b")), call, `${title}: the call`);
          const big = await boxOf(hero.locator(".big"));
          const words = await boxOf(hero.locator(".lab"));
          assert.ok(words.x >= big.x + big.width - 1, `${title}: the words sit beside the number`);
        }),
      );
    },
  },
  {
    ids: ["UX-080"],
    title: "The large RTR reserves the hand's reach, and its label is centered on the number",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "FGA T04");
      const titles = ["FGA T04", "docs-site T02", "mobile-onboarding M12"];
      await Promise.all(
        titles.map(async (title) => {
          const display = displayOf(ctx.page, title, body);
          const name = await boxOf(display.locator("h2"));
          const label = await boxOf(display.locator(".hero .lab"));
          const big = await boxOf(display.locator(".hero .big"));
          const hand = await boxOf(display.locator(".hero .big svg.hand"));
          assert.ok(!overlaps(hand, name), `${title}: the hand never touches the name`);
          assert.ok(!overlaps(hand, label), `${title}: the hand never touches the label`);
          assert.ok(
            hand.y >= big.y - 1 && hand.y + hand.height <= big.y + big.height + 1,
            `${title}: hand inside the reserved height`,
          );
          assert.ok(
            hand.x + hand.width <= big.x + big.width + 1,
            `${title}: hand inside the reserved width`,
          );
          const offCenter = Math.abs(label.y + label.height / 2 - (big.y + big.height / 2));
          assert.ok(
            offCenter <= CENTER_SLACK_PX,
            `${title}: label centered on the number (off by ${offCenter} px)`,
          );
        }),
      );
    },
  },
  {
    ids: ["UX-081"],
    title: "A red project's display shows the Go to keyboard flag with the ask, under the hero",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "search-index T03");
      const ask = find(body, "search-index T03").needs_me as string;
      const flag = display.locator(".flag.me");
      assert.equal(await flag.count(), 1);
      assert.equal(await textOf(flag), `Go to keyboard: ${ask}`);
      assert.ok(await flag.isVisible());
      assert.ok(
        (await boxOf(flag)).y > (await boxOf(display.locator(".hero"))).y,
        "The flag is under the hero.",
      );
      assert.ok(
        (await boxOf(flag)).y < (await boxOf(display.locator("h4").first())).y,
        "The flag is above the first section.",
      );
      // The ask shows only here: the hero keeps the call, and a project with no ask has no flag.
      assert.equal(await textOf(display.locator(".hero .lab b")), "Running late");
      assert.equal(await displayOf(ctx.page, "FGA T04", body).locator(".flag").count(), 0);
    },
  },
  {
    ids: ["UX-082"],
    title: "A silent agent's display shows the stale-agent warning with how long it has been quiet",
    async run(ctx) {
      const body = ctx.example("silent");
      const display = await showProject(ctx, body, "mobile-onboarding M12");
      const quiet =
        (body.now as number) - (find(body, "mobile-onboarding M12").updated_at as number);
      const flag = display.locator(".flag.st");
      assert.equal(await flag.count(), 1);
      assert.equal(
        await textOf(flag),
        `No report for ${durText(quiet)}. The monitoring agent may have stopped.`,
      );
      assert.ok(await flag.isVisible());
      assert.equal(
        await displayOf(ctx.page, "FGA T04", body).locator(".flag").count(),
        0,
        "A fresh agent has no warning.",
      );
    },
  },
  {
    ids: ["UX-081", "UX-082"],
    title: "A red project whose agent is also silent shows both flags, the ask first",
    async run(ctx) {
      const base = ctx.example("afternoon");
      const body: Json = edit(base, "search-index T03", (m) => {
        m.stale = true;
        m.updated_at = (base.now as number) - SILENT_SECONDS;
      });
      const display = await showProject(ctx, body, "search-index T03");
      const flags = display.locator(".flag");
      assert.equal(await flags.count(), 2);
      assert.match(await textOf(flags.nth(0)), /^Go to keyboard: /u);
      assert.equal(await flags.nth(0).getAttribute("class"), "flag me");
      assert.equal(
        await textOf(flags.nth(1)),
        "No report for 30m. The monitoring agent may have stopped.",
      );
      assert.equal(await flags.nth(1).getAttribute("class"), "flag st");
    },
  },
  {
    ids: ["UX-092"],
    title:
      "A done project's display shows done styling: no state color, a done call, the lightest lanes",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "localswim V2 T06");
      assert.equal(await textOf(display.locator(".hero .lab b")), "Done");
      const big = display.locator(".hero .big");
      assert.equal(await style(big, "color"), await token(ctx.page, "--done"));
      const stateColors = await Promise.all(
        ["--ok", "--risk", "--bad"].map((name) => token(ctx.page, name)),
      );
      assert.ok(!stateColors.includes(await style(big, "color")), "The RTR wears no state color.");
      assert.equal(await display.locator(".flag").count(), 0);
      const tile = display.locator(".tiles .tile");
      assert.equal(await tile.count(), 1);
      assert.deepEqual(
        [
          await plain(tile.locator("small")),
          await plain(tile.locator("b")),
          await plain(tile.locator("span")),
        ],
        ["The call", "Done", "Every ticket in this block is finished."],
      );
      const swatch = display.locator(".lanes li", { hasText: "Ready for review" }).locator(".lt i");
      assert.equal(await style(swatch, "backgroundColor"), await token(ctx.page, "--text"));
    },
  },
];
