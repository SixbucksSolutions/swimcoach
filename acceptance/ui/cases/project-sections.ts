// Project display checks, part 2: the sections between the hero and the swimlanes (MVP-11 B; ledger
// area G, UX-084 to UX-091): the RTR chart, the Projection tiles, Work against time, the footer.
import assert from "node:assert/strict";
import type { Locator } from "playwright";
import type { UiCase } from "../types.ts";
import {
  boxOf,
  clockText,
  displayOf,
  find,
  plain,
  showProject,
  style,
  textOf,
  token,
} from "./project-support.ts";

const CHART_HEIGHT_PX = 150;
const BAR_SLACK = 0.015;

/** What one Projection tile shows: its label, its big value and its caption. */
async function tileOf(tile: Locator): Promise<[string, string, string]> {
  return [
    await plain(tile.locator("small")),
    await plain(tile.locator("b")),
    await plain(tile.locator("span")),
  ];
}

/** The fill of the tickets bar and of the hours bar in Work against time. */
function workBar(display: Locator): Locator {
  return display.locator(".meter .bar:not(.t) i");
}

function timeBar(display: Locator): Locator {
  return display.locator(".meter .bar.t i");
}

/** How full a bar is, 0 to 1, from the boxes the viewer sees. */
async function fill(bar: Locator): Promise<number> {
  return (await boxOf(bar.locator("i"))).width / (await boxOf(bar)).width;
}

/** The text of the last few caption lines: every caption on the page whose last line is one word. */
const STRANDED_SCRIPT = `(() => {
  const found = [];
  for (const span of document.querySelectorAll("#pages .tile span")) {
    const node = span.firstChild;
    const words = (node?.textContent ?? "").split(" ");
    if (node === null || words.length < 2) continue;
    const tops = [];
    let at = 0;
    for (const word of words) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + word.length);
      tops.push(Math.round(range.getBoundingClientRect().top));
      at += word.length + 1;
    }
    const last = Math.max(...tops);
    if (tops.filter((top) => top === last).length === 1 && new Set(tops).size > 1) found.push(node.textContent);
  }
  return found;
})()`;

export const sectionCases: UiCase[] = [
  {
    ids: ["UX-084"],
    title:
      "RTR today is a line chart across the day with a dashed line at 1.00 and its start and end times",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const heading = display.locator("h4", { hasText: "RTR today" });
      assert.equal(await heading.count(), 1);
      const chart = display.locator(".chart");
      assert.ok(await chart.isVisible());
      assert.ok(Math.abs((await boxOf(chart)).height - CHART_HEIGHT_PX) <= 1);
      const spark = find(body, "FGA T04").spark as [number, number][];
      const points = (await display.locator(".chart polyline").getAttribute("points")) ?? "";
      assert.equal(points.trim().split(/\s+/u).length, spark.length, "One point per sample.");
      const dashes = (await display.locator(".chart line").getAttribute("stroke-dasharray")) ?? "";
      assert.ok(dashes.length > 0, "The 1.00 line is dashed.");
      assert.equal(await plain(display.locator(".chart span.one")), "1.00");
      const times = await display.locator(".xax span").allTextContents();
      assert.deepEqual(times, [clockText(spark[0]?.[0] ?? 0), clockText(spark.at(-1)?.[0] ?? 0)]);
      assert.equal(
        await style(display.locator(".chart polyline"), "stroke"),
        await token(ctx.page, "--ok"),
      );
    },
  },
  {
    ids: ["UX-085"],
    title:
      "A projection tile gives the chance on time, with how many landed lately and how many are to go",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      assert.equal(await display.locator("h4", { hasText: "Projection" }).count(), 1);
      assert.deepEqual(await tileOf(display.locator(".tiles .tile").nth(0)), [
        "Chance on time",
        "88%",
        "3 landed in last 60m, 3 to go",
      ]);
      const falling = displayOf(ctx.page, "docs-site T02", body);
      assert.deepEqual(await tileOf(falling.locator(".tiles .tile").nth(0)), [
        "Chance on time",
        "38%",
        "1 landed in last 60m, 2 to go",
      ]);
    },
  },
  {
    ids: ["UX-086"],
    title: "A projection tile says where the block lands: how early or how late",
    async run(ctx) {
      const base = ctx.example("afternoon");
      const display = await showProject(ctx, base, "FGA T04");
      assert.deepEqual(await tileOf(display.locator(".tiles .tile").nth(1)), [
        "Lands",
        "1h 10m early",
        "projected landing",
      ]);
      const late = displayOf(ctx.page, "docs-site T02", base);
      assert.deepEqual(await tileOf(late.locator(".tiles .tile").nth(1)), [
        "Lands",
        "1h 00m late",
        "projected landing",
      ]);
    },
  },
  {
    ids: ["UX-087"],
    title:
      "Projection tiles give the RTR at the end of the block and the RTR trend as a signed change",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      assert.deepEqual(await tileOf(display.locator(".tiles .tile").nth(2)), [
        "RTR at end of block",
        "1.50",
        "if the recent pace holds",
      ]);
      assert.deepEqual(await tileOf(display.locator(".tiles .tile").nth(3)), [
        "RTR trend",
        "+0.56",
        "over the last 60m",
      ]);
      const falling = displayOf(ctx.page, "docs-site T02", body);
      assert.deepEqual(await tileOf(falling.locator(".tiles .tile").nth(2)), [
        "RTR at end of block",
        "0.83",
        "if the recent pace holds",
      ]);
      assert.deepEqual(await tileOf(falling.locator(".tiles .tile").nth(3)), [
        "RTR trend",
        "−0.50",
        "over the last 60m",
      ]);
    },
  },
  {
    ids: ["UX-088"],
    title: "Too early to call: one tile says so and states the gates",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "auth-refresh M3");
      const tiles = display.locator(".tiles .tile");
      assert.equal(await tiles.count(), 1);
      assert.deepEqual(await tileOf(tiles), [
        "The call",
        "Too early to call",
        "Needs 45m of history and 15% of the time block used.",
      ]);
    },
  },
  {
    ids: ["UX-089"],
    title: "Work against time has two bars: tickets done of total, and hours used of allocated",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      assert.equal(await display.locator("h4", { hasText: "Work against time" }).count(), 1);
      assert.deepEqual(await display.locator(".meter label").allTextContents(), ["Work", "Time"]);
      assert.deepEqual(
        (await display.locator(".meter .cap").allTextContents()).map((text) =>
          text.replaceAll(/\s+/gu, " "),
        ),
        ["4 of 7 tickets · 57%", "1.83 of 4.0 hrs · 46%"],
      );
      const bars = display.locator(".meter .bar");
      assert.ok(
        Math.abs((await fill(bars.nth(0))) - 4 / 7) < BAR_SLACK,
        "The tickets bar is 4 of 7 full.",
      );
      assert.ok(
        Math.abs((await fill(bars.nth(1))) - 1.83 / 4) < BAR_SLACK,
        "The hours bar is 1.83 of 4 full.",
      );
      const yellow = displayOf(ctx.page, "docs-site T02", body);
      assert.deepEqual(
        (await yellow.locator(".meter .cap").allTextContents()).map((text) =>
          text.replaceAll(/\s+/gu, " "),
        ),
        ["4 of 6 tickets · 67%", "2 of 3.0 hrs · 67%"],
      );
    },
  },
  {
    ids: ["UX-090"],
    title: "The Work bar takes the display's color on a green and on a yellow display",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const green = await showProject(ctx, body, "FGA T04");
      const yellow = displayOf(ctx.page, "docs-site T02", body);
      const [ok, risk, dim] = await Promise.all(
        ["--ok", "--risk", "--dim"].map((name) => token(ctx.page, name)),
      );
      assert.equal(await style(workBar(green), "backgroundColor"), ok);
      assert.equal(await style(workBar(yellow), "backgroundColor"), risk);
      // The Time bar is the same neutral on both.
      assert.equal(await style(timeBar(green), "backgroundColor"), dim);
      assert.equal(await style(timeBar(yellow), "backgroundColor"), dim);
    },
  },
  {
    ids: ["UX-091"],
    title: "The footer gives the last ticket move, the last report time and the reporting agent",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const fga = find(body, "FGA T04");
      assert.equal(
        await textOf(display.locator(".foot")),
        `Last ticket move ${clockText(fga.last_move_at as number)} · reported ${clockText(fga.updated_at as number)} by claude`,
      );
      const codex = find(body, "auth-refresh M3");
      assert.equal(
        await textOf(displayOf(ctx.page, "auth-refresh M3", body).locator(".foot")),
        `Last ticket move ${clockText(codex.last_move_at as number)} · reported ${clockText(codex.updated_at as number)} by codex`,
      );
    },
  },
  {
    ids: ["UX-102"],
    title: "A tile caption never strands a single word on its last line",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "FGA T04");
      assert.deepEqual(await ctx.page.evaluate(STRANDED_SCRIPT), []);
    },
  },
];
