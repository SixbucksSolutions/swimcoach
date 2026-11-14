// Project display checks, part 5: small blocks and the gray silent hero (MVP-11 B; ledger area L and
// the project display rows of M: UX-139, UX-140, UX-151, UX-152, UX-155). The small-blocks example
// has dotfiles M1 (green, under budget) and flickr-sync T01 (yellow, over budget).
import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";
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
  squash,
  style,
  textOf,
  token,
} from "./project-support.ts";

const GAP_SLACK_PX = 1;
const BARE_EXTRA_PX = 10;
const SILENT_SECONDS = 1800;
const FOOTER =
  /^Last ticket move \d{1,2}:\d{2}[ap]m · reported \d{1,2}:\d{2}[ap]m by (?:claude|codex)$/u;

/** The hero's call words, which wear the display's color. */
function words(page: Page, body: Json, title: string): Locator {
  return displayOf(page, title, body).locator(".hero .lab b");
}

/** The gap between the title and the hero below it, as the viewer sees it. */
async function gapUnderTitle(display: Locator): Promise<number> {
  const title = await boxOf(display.locator("h2"));
  return (await boxOf(display.locator(".hero"))).y - (title.y + title.height);
}

export const smallCases: UiCase[] = [
  {
    ids: ["UX-139"],
    title: "A small block says Under budget or Over budget in its hero",
    async run(ctx) {
      const body = ctx.example("small-blocks");
      await showProject(ctx, body, "dotfiles M1");
      assert.equal(
        await plain(displayOf(ctx.page, "dotfiles M1", body).locator(".hero .lab b")),
        "Under budget",
      );
      assert.equal(
        await plain(displayOf(ctx.page, "flickr-sync T01", body).locator(".hero .lab b")),
        "Over budget",
      );
    },
  },
  {
    ids: ["UX-140"],
    title:
      "A small block's display drops the RTR, the chart and the tiles, keeping work, lanes and footer",
    async run(ctx) {
      const body = ctx.example("small-blocks");
      await showProject(ctx, body, "dotfiles M1");
      await Promise.all(
        ["dotfiles M1", "flickr-sync T01"].map(async (title) => {
          const display = displayOf(ctx.page, title, body);
          assert.equal(await display.locator(".hero .big").count(), 0, `${title}: no big RTR`);
          assert.equal(
            await display.locator(".hero svg.hand").count(),
            0,
            `${title}: no clock hand`,
          );
          assert.equal(await display.locator(".chart").count(), 0, `${title}: no RTR chart`);
          assert.equal(await display.locator(".tiles").count(), 0, `${title}: no projection tiles`);
          assert.deepEqual(
            await display.locator("h4").allTextContents(),
            ["Work against time", "Swimlanes"],
            title,
          );
          assert.equal(await display.locator(".meter").count(), 1, `${title}: Work against time`);
          assert.ok((await display.locator(".lanes li").count()) > 0, `${title}: swimlanes`);
          assert.match(await textOf(display.locator(".foot")), FOOTER);
        }),
      );
      const dotfiles = displayOf(ctx.page, "dotfiles M1", body);
      assert.deepEqual(
        (await dotfiles.locator(".meter .cap").allTextContents()).map((text) => squash(text)),
        ["0 of 1 tickets · 0%", "0.75 of 2.0 hrs · 38%"],
      );
      const flickr = displayOf(ctx.page, "flickr-sync T01", body);
      assert.deepEqual(
        (await flickr.locator(".meter .cap").allTextContents()).map((text) => squash(text)),
        ["1 of 2 tickets · 50%", "2.6 of 2.0 hrs · 130%"],
      );
    },
  },
  {
    ids: ["UX-151"],
    title:
      "A small block is green under budget, yellow over budget, red on an ask and gray when silent",
    async run(ctx) {
      const base = ctx.example("small-blocks");
      await showProject(ctx, base, "dotfiles M1");
      assert.equal(
        await style(words(ctx.page, base, "dotfiles M1"), "color"),
        await token(ctx.page, "--ok"),
      );
      assert.equal(
        await style(words(ctx.page, base, "flickr-sync T01"), "color"),
        await token(ctx.page, "--risk"),
      );
      const cards = ctx.page.locator("#pages > section.page").first();
      assert.match((await cards.locator(".pc.green").allTextContents()).join(" "), /dotfiles M1/u);
      assert.match(
        (await cards.locator(".pc.yellow").allTextContents()).join(" "),
        /flickr-sync T01/u,
      );
    },
  },
  {
    ids: ["UX-151"],
    title: "A small block with an ask is red and shows the flag; a silent one is gray and says so",
    async run(ctx) {
      const base = ctx.example("small-blocks");
      const body = edit(
        edit(base, "dotfiles M1", (m) => {
          m.color = "red";
          m.reason = "needs_terry";
          m.needs_me = "Review the dotfiles layout";
        }),
        "flickr-sync T01",
        (m) => {
          m.color = "gray";
          m.reason = "silent";
          m.stale = true;
          m.updated_at = (base.now as number) - SILENT_SECONDS;
        },
      );
      const red = await showProject(ctx, body, "dotfiles M1");
      assert.equal(
        await textOf(red.locator(".flag.me")),
        "Go to keyboard: Review the dotfiles layout",
      );
      assert.equal(await plain(red.locator(".hero .lab b")), "Under budget");
      assert.equal(
        await style(red.locator(".hero .lab b"), "color"),
        await token(ctx.page, "--bad"),
      );
      const gray = displayOf(ctx.page, "flickr-sync T01", body);
      assert.equal(
        await plain(gray.locator(".hero .lab b")),
        `Agent silent for ${durText(SILENT_SECONDS)}`,
      );
      assert.equal(
        await style(gray.locator(".hero .lab b"), "color"),
        await token(ctx.page, "--dim"),
      );
      assert.equal(await gray.locator(".flag.st").count(), 1);
    },
  },
  {
    ids: ["UX-155"],
    title: "A hero with no big RTR sits 10 px lower below the title than one with an RTR",
    async run(ctx) {
      const small = ctx.example("small-blocks");
      const ratio = ctx.example("afternoon");
      const bare = await gapUnderTitle(await showProject(ctx, small, "dotfiles M1"));
      const normal = await gapUnderTitle(await showProject(ctx, ratio, "FGA T04"));
      assert.ok(
        Math.abs(bare - normal - BARE_EXTRA_PX) <= GAP_SLACK_PX,
        `A hero with no RTR starts ${bare} px below the title, one with an RTR ${normal} px: 10 px apart.`,
      );
    },
  },
  {
    ids: ["UX-152"],
    title:
      "A silent agent's display keeps the RTR, draws no clock hand, and says how long it has been silent",
    async run(ctx) {
      const body = ctx.example("silent");
      const display = await showProject(ctx, body, "mobile-onboarding M12");
      const quiet =
        (body.now as number) - (find(body, "mobile-onboarding M12").updated_at as number);
      const hero = display.locator(".hero");
      assert.equal(await plain(hero.locator(".big")), "0.89");
      assert.equal(await hero.locator("svg.hand").count(), 0, "A gray card draws no arrow.");
      assert.equal(await textOf(hero.locator(".lab")), `RTR Agent silent for ${durText(quiet)}`);
      assert.equal(await style(hero.locator(".big"), "color"), await token(ctx.page, "--dim"));
      assert.equal(await style(hero.locator(".lab b"), "color"), await token(ctx.page, "--dim"));
      // Fresh agents on the same board keep their hand.
      assert.equal(await displayOf(ctx.page, "FGA T04", body).locator(".hero svg.hand").count(), 1);
    },
  },
];
