// Overview display checks (MVP-11 A owns this file; t5-interfaces.md). The Lead's one case proves
// the harness end to end; MVP-11 A keeps or reworks it.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";

export const overviewCases: UiCase[] = [
  {
    ids: ["UX-162"],
    title: "An empty board reads LIVE with no age, over the empty-state line",
    async run(ctx) {
      ctx.answer({ body: ctx.example("empty") });
      await ctx.open();
      const health = ctx.page.locator("#health");
      assert.equal(await health.getAttribute("class"), "live");
      assert.equal((await ctx.page.locator("#health b").textContent())?.trim(), "LIVE");
      assert.equal((await ctx.page.locator("#health span").textContent())?.trim(), "");
      assert.equal(
        (await ctx.page.locator("#pages .empty").textContent())?.trim(),
        "No reports yet today.",
      );
    },
  },
];
