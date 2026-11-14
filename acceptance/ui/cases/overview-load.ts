// Overview checks, area I: no flicker on load, and steady polling (MVP-11 A). A recorder installed
// before the page's own scripts watches the moment the page reveals itself.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { near, openWith, pollOnce, settle } from "./overview-kit.ts";
import { probe } from "./overview-probe.ts";

const REVEAL_STEPS = 60;
const REVEAL_STEP_MS = 100;

/** Records, from before any page script, the moment `html.loading` goes away, and every later return. */
const RECORDER = `
(() => {
  const t0 = performance.now();
  window.__rev = null;
  window.__loadingAgain = 0;
  window.__started = null;
  window.__muts = [];
  new MutationObserver(() => {
    const clock = document.querySelector('#clock');
    if (window.__started === null && clock && clock.textContent) { window.__started = performance.now() - t0; }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  window.__rects = () => [...document.querySelectorAll('header > *, #pages .pc')].map((e) => {
    const b = e.getBoundingClientRect();
    return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100);
  });
  window.__now = () => {
    const cards = document.querySelector('#pages .cards');
    return {
      t: performance.now() - t0,
      started: window.__started,
      cards: document.querySelectorAll('#pages .pc').length,
      fonts: document.fonts.status,
      clock: document.querySelector('#clock')?.textContent ?? '',
      health: document.querySelector('#health b')?.textContent ?? '',
      cardsClass: cards ? cards.className : null,
      slot: cards ? cards.style.getPropertyValue('--slot') : null,
      rects: window.__rects(),
      again: window.__loadingAgain,
      muts: window.__muts,
    };
  };
  new MutationObserver(() => {
    const loading = document.documentElement.classList.contains('loading');
    if (!loading && window.__rev === null) { window.__rev = window.__now(); }
    else if (loading && window.__rev !== null) { window.__loadingAgain += 1; }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.__watch = () => {
    new MutationObserver((records) => {
      for (const r of records) {
        if (!document.querySelector('#clock').contains(r.target)) {
          window.__muts.push(r.type + ':' + (r.target.id || r.target.className || r.target.nodeName));
        }
      }
    }).observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    return true;
  };
})();
`;

interface Snapshot {
  readonly t: number;
  readonly started: number | null;
  readonly cards: number;
  readonly fonts: string;
  readonly clock: string;
  readonly health: string;
  readonly cardsClass: string | null;
  readonly slot: string | null;
  readonly rects: number[][];
  readonly again: number;
  readonly muts: string[];
}

function revealOf(ctx: UiContext): Promise<Snapshot | null> {
  return probe<Snapshot | null>(ctx.page, "window.__rev");
}

/** Moves page time on in steps until the recorder has seen the reveal. */
async function untilRevealed(ctx: UiContext): Promise<Snapshot> {
  for (let step = 0; step < REVEAL_STEPS; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each step moves page time on, then looks
    await ctx.advance(REVEAL_STEP_MS);
    const rev = await revealOf(ctx).catch(() => null);
    if (rev !== null) {
      await settle(ctx);
      return rev;
    }
  }
  throw new Error("The page never revealed itself.");
}

const loadCases: UiCase[] = [
  {
    ids: ["UX-103", "UX-104", "UX-105", "UX-106", "UX-147"],
    title:
      "The page stays hidden until the cards are drawn and the font is ready, fades in once, and then never shifts",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("afternoon"));
      await ctx.page.reload();
      const hidden = await probe<{ loading: boolean; opacity: string }>(
        ctx.page,
        "({ loading: document.documentElement.classList.contains('loading'), opacity: cs(document.body).opacity })",
      );
      assert.equal(hidden.loading, true, "The page is hidden while the clock is paused.");
      assert.equal(hidden.opacity, "0");
      const rev = await untilRevealed(ctx);
      assert.equal(rev.cards, 6, "Every Card was drawn before the reveal.");
      assert.equal(rev.fonts, "loaded", "The font was ready at the reveal.");
      assert.ok(
        rev.clock !== "" && rev.health === "LIVE",
        "The Status line was filled at the reveal.",
      );
      const face = await probe<string[]>(
        ctx.page,
        "[...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r.constructor.name === 'CSSFontFaceRule').map((r) => r.style.getPropertyValue('font-display'))",
      );
      assert.deepEqual(face, ["block"], "Inter uses font-display: block.");
      const fade = await probe<string[]>(
        ctx.page,
        "['transitionProperty', 'transitionDuration', 'transitionTimingFunction'].map((p) => cs(document.body)[p])",
      );
      assert.deepEqual(fade, ["opacity", "0.2s", "ease-in"]);
      await pollOnce(ctx);
      await pollOnce(ctx);
      const later = await probe<Snapshot>(ctx.page, "window.__now()");
      assert.deepEqual(later.rects, rev.rects, "Nothing moved after the reveal.");
      assert.equal(later.cardsClass, rev.cardsClass, "The slot mode was chosen by the reveal.");
      assert.equal(later.slot, rev.slot);
      assert.equal(later.again, 0, "The page fades in once per load.");
      assert.equal(await probe<string>(ctx.page, "cs(document.body).opacity"), "1");
    },
  },
  {
    ids: ["UX-107"],
    title: "If the font is not ready within 3 s, the page reveals anyway",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("afternoon"));
      const home = ctx.page.url();
      // The font is inline in the page; serve the page with its font swapped for a file that never
      // arrives. The load event waits for it, so navigate only as far as the page's first bytes.
      await ctx.page.route(
        "**/font-that-never-arrives.woff2",
        () => new Promise<void>(() => undefined),
      );
      await ctx.page.route("**/", async (route) => {
        const response = await route.fetch();
        const html = (await response.text()).replace(
          /url\(data:font\/woff2;[^)]*\)/gu,
          "url(/font-that-never-arrives.woff2)",
        );
        await route.fulfill({ response, body: html });
      });
      await ctx.page.goto(home, { waitUntil: "commit" });
      const rev = await untilRevealed(ctx);
      assert.ok(rev.started !== null, "The page's script started.");
      near(rev.t - rev.started, 3000, 300, "The reveal comes 3 s after the page's script starts");
      assert.notEqual(rev.fonts, "loaded", "The font really was stuck.");
      assert.equal(rev.cards, 6, "The page is complete, in the fallback font.");
      assert.equal(await probe<string>(ctx.page, "document.documentElement.className"), "");
    },
  },
  {
    ids: ["UX-108"],
    title: "Under reduced motion the fade is skipped",
    async run(ctx) {
      await ctx.page.emulateMedia({ reducedMotion: "reduce" });
      await openWith(ctx, ctx.example("afternoon"));
      assert.equal(await probe<string>(ctx.page, "cs(document.body).transitionDuration"), "0s");
    },
  },
  {
    ids: ["UX-109", "UX-110"],
    title: "Steady polls never fade, blank or flash the page and change nothing but the clock",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("afternoon"));
      await probe<boolean>(ctx.page, "window.__watch()");
      for (let poll = 0; poll < 3; poll += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each poll is answered before the next starts
        await pollOnce(ctx);
        const opacity = await probe<string>(ctx.page, "cs(document.body).opacity");
        assert.equal(opacity, "1", "The page never blanks.");
      }
      const seen = await probe<Snapshot>(ctx.page, "window.__now()");
      assert.deepEqual(seen.muts, [], "Three unchanged polls touch no node outside the clock.");
      assert.equal(seen.again, 0, "The loading state never returns.");
    },
  },
];

export { loadCases };
