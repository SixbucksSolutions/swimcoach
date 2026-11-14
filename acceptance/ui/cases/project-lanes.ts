// Project display checks, part 3: Swimlanes (MVP-11 B; ledger area H, UX-093 to UX-101). The
// decision the cases follow is Terry's, 2026-11-13 (concept.md 3.3 part 7): Completed is never a row,
// an empty Needs Terry row is hidden, and Backlog and Blocked never show.
import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";
import type { UiCase } from "../types.ts";
import {
  boxOf,
  displayOf,
  edit,
  find,
  type Json,
  mapAll,
  plain,
  showProject,
  style,
  textOf,
  token,
} from "./project-support.ts";

const SHARE_SLACK = 0.015;
const MS_GAP_PX = 2;

interface LaneRow {
  readonly name: string;
  readonly count: number;
  readonly share: string;
  readonly swatch: string;
  readonly bar: number;
}

/** One lane row as the viewer sees it: name, count, share, swatch color, and how full its own bar is. */
async function rowOf(li: Locator): Promise<LaneRow> {
  const count = await plain(li.locator(".lt b"));
  const share = await plain(li.locator(".lt span"));
  const whole = await plain(li.locator(".lt"));
  const bar = li.locator(".lbar");
  return {
    name: whole.slice(0, whole.length - count.length - share.length).trim(),
    count: Number(count),
    share,
    swatch: await style(li.locator(".lt i"), "backgroundColor"),
    bar: (await boxOf(bar.locator("i"))).width / (await boxOf(bar)).width,
  };
}

async function rowsOf(display: Locator): Promise<LaneRow[]> {
  return await mapAll(display.locator(".lanes li"), rowOf);
}

/** The colors of the 100% bar's segments, left to right. */
async function stackColors(display: Locator): Promise<string[]> {
  return await mapAll(display.locator(".stack i"), (segment) => style(segment, "backgroundColor"));
}

async function colorsOf(page: Page, names: readonly string[]): Promise<string[]> {
  return await Promise.all(names.map((name) => token(page, name)));
}

/** The afternoon board with Completed holding tickets, as a long-running block would. */
function withCompleted(body: Json): Json {
  return edit(body, "FGA T04", (m) => {
    (m.lanes as Json).completed = 12;
    m.total = (m.total as number) + 12;
    m.finished = (m.finished as number) + 12;
  });
}

function percent(count: number, total: number): string {
  return `${Math.round((count / total) * 100)}%`;
}

export const laneCases: UiCase[] = [
  {
    ids: ["UX-093", "UX-094", "UX-096"],
    title:
      "Swimlanes: Ready For Work, In progress and Ready for review, each with count, share and its own bar",
    async run(ctx) {
      const body = withCompleted(ctx.example("afternoon"));
      const display = await showProject(ctx, body, "FGA T04");
      assert.equal(await display.locator("h4", { hasText: "Swimlanes" }).count(), 1);
      const rows = await rowsOf(display);
      assert.deepEqual(
        rows.map((row) => row.name),
        ["Ready For Work", "In progress", "Ready for review"],
        "Completed is never a row, even when it holds tickets; Backlog and Blocked never show.",
      );
      const total = find(body, "FGA T04").total as number;
      const counts = [2, 1, 4];
      rows.forEach((row, i) => {
        assert.equal(row.count, counts[i], `${row.name}: count`);
        assert.equal(row.share, percent(counts[i] as number, total), `${row.name}: share`);
        assert.ok(
          Math.abs(row.bar - (counts[i] as number) / total) < SHARE_SLACK,
          `${row.name}: its own bar`,
        );
      });
      assert.doesNotMatch(await textOf(display.locator(".lanes")), /Completed|Backlog|Blocked/u);
    },
  },
  {
    ids: ["UX-095"],
    title: "The 100% bar sits below the lane rows and is split into those lanes",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const stack = display.locator(".stack");
      const rows = await rowsOf(display);
      const last = await boxOf(display.locator(".lanes li").last());
      assert.ok(
        (await boxOf(stack)).y >= last.y + last.height - 1,
        "The 100% bar is below the rows.",
      );
      assert.deepEqual(
        await stackColors(display),
        rows.map((row) => row.swatch),
        "One segment per lane, in the row colors.",
      );
      const widths = await mapAll(
        display.locator(".stack i"),
        async (segment) => (await boxOf(segment)).width,
      );
      const whole = widths.reduce((a, b) => a + b, 0);
      const counts = rows.map((row) => row.count);
      const countSum = counts.reduce((a, b) => a + b, 0);
      counts.forEach((count, i) => {
        const gaps = MS_GAP_PX * (counts.length - 1);
        const expected = (count / countSum) * whole;
        assert.ok(
          Math.abs((widths[i] as number) - expected) <= gaps + 1,
          `Segment ${i} is its lane's share.`,
        );
      });
    },
  },
  {
    ids: ["UX-097"],
    title: "An empty Needs Terry lane is not shown",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "FGA T04");
      const titles = ["FGA T04", "docs-site T02", "auth-refresh M3", "localswim V2 T06"];
      await Promise.all(
        titles.map(async (title) => {
          const names = (await rowsOf(displayOf(ctx.page, title, body))).map((row) => row.name);
          assert.ok(!names.includes("Needs Terry"), `${title}: no Needs Terry row`);
        }),
      );
    },
  },
  {
    ids: ["UX-098"],
    title: "Needs Terry is red only when it holds a ticket",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "search-index T03");
      const rows = await rowsOf(display);
      assert.deepEqual(
        rows.map((row) => row.name),
        ["Ready For Work", "In progress", "Needs Terry", "Ready for review"],
      );
      const red = await token(ctx.page, "--bad");
      const [needs] = rows.filter((row) => row.name === "Needs Terry");
      assert.equal(needs?.count, 1);
      assert.equal(needs?.swatch, red);
      for (const row of rows.filter((r) => r.name !== "Needs Terry")) {
        assert.notEqual(row.swatch, red, `${row.name} is never red.`);
      }
      assert.ok((await stackColors(display)).includes(red));
    },
  },
  {
    ids: ["UX-099"],
    title: "On a green display the done lane takes the display's color",
    async run(ctx) {
      const body = ctx.example("afternoon");
      const display = await showProject(ctx, body, "FGA T04");
      const rows = await rowsOf(display);
      const done = rows.find((row) => row.name === "Ready for review");
      assert.equal(done?.swatch, await token(ctx.page, "--ok"));
      assert.equal(
        await style(display.locator(".lanes li").nth(2).locator(".lbar i"), "backgroundColor"),
        done?.swatch,
      );
    },
  },
  {
    ids: ["UX-100"],
    title: "On a yellow display the done lane is yellow, so a yellow display never shows green",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "docs-site T02");
      const [green, yellow] = await colorsOf(ctx.page, ["--ok", "--risk"]);
      await Promise.all(
        ["docs-site T02", "mobile-onboarding M12"].map(async (title) => {
          const display = displayOf(ctx.page, title, body);
          const rows = await rowsOf(display);
          assert.equal(rows.find((row) => row.name === "Ready for review")?.swatch, yellow);
          const painted = [...rows.map((row) => row.swatch), ...(await stackColors(display))];
          assert.ok(
            !painted.includes(green as string),
            `${title}: no green anywhere in its swimlanes`,
          );
        }),
      );
    },
  },
  {
    ids: ["UX-101"],
    title: "On a red, gray and done display the done lane is the lightest neutral, never red",
    async run(ctx) {
      const body = ctx.example("afternoon");
      await showProject(ctx, body, "search-index T03");
      const [light, red] = await colorsOf(ctx.page, ["--text", "--bad"]);
      await Promise.all(
        ["search-index T03", "auth-refresh M3", "localswim V2 T06"].map(async (title) => {
          const done = (await rowsOf(displayOf(ctx.page, title, body))).find(
            (row) => row.name === "Ready for review",
          );
          assert.equal(done?.swatch, light, `${title}: done lane color`);
          assert.notEqual(done?.swatch, red, `${title}: never red`);
        }),
      );
    },
  },
];
