// Status line motion (localswim swimcoach #0036; UX-183 to UX-186): a change of Health box state fades
// the old state out and the new one in, the warning line with it, while the displays ease into or out
// of their gray. A recorder installed before the page's own scripts wraps Element.prototype.animate (a
// platform API, not page code) and notes each call on the Health box, the warning line and the
// displays, with what the box showed at that moment and when, on the browser's own animation clock.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { COLOR, MINUTE_MS, near, older, openWith, pollOnce, settle } from "./overview-kit.ts";
import { healthOf, probe, runningBreaths } from "./overview-probe.ts";

const FADE_MS = 300;
/** How late, on the browser's clock, the fade-in MAY start after the fade-out: a few frames. */
const FRAME_SLACK_MS = 120;
const LIVE_TO_OFFLINE_MS = 55_000;
const STALE_SECONDS = 26 * 60;
const STALE_WARNING = /^No agent has reported for 3\dm\. Everything below is old\.$/u;
const OFFLINE_WARNING = /^Can't reach the board for 1m\. Everything below is old\.$/u;

const RECORDER = `
(() => {
  window.__fades = [];
  const real = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    if (['health', 'warn', 'pages'].includes(this.id)) {
      window.__fades.push({
        id: this.id, frames: JSON.parse(JSON.stringify(frames)), duration: options.duration,
        easing: options.easing, t: document.timeline.currentTime,
        label: document.querySelector('#health b').textContent,
        warn: document.querySelector('#warn').textContent,
      });
    }
    return real.call(this, frames, options);
  };
})();
`;

interface Fade {
  readonly id: string;
  readonly frames: Record<string, number | string>[];
  readonly duration: number;
  readonly easing: string;
  readonly t: number;
  readonly label: string;
  readonly warn: string;
}

const OUT = [{ opacity: 1 }, { opacity: 0 }];
const IN = [{ opacity: 0 }, { opacity: 1 }];
const GRAY = { opacity: 0.4, filter: "grayscale(1)" };
const CLEAR = { opacity: 1, filter: "grayscale(0)" };

function fadesOf(ctx: UiContext): Promise<Fade[]> {
  return probe<Fade[]>(ctx.page, "window.__fades");
}

/** A fade's id, keyframes, easing and duration, the parts a case compares exactly. */
function shape(f: Fade): [string, unknown, string, number] {
  return [f.id, f.frames, f.easing, f.duration];
}

/** The calls that start at the same instant as `first`: one phase of the motion. */
function phase(fades: readonly Fade[], first: Fade | undefined): Fade[] {
  assert.ok(first, "A phase of the motion was recorded.");
  return fades.filter((f) => Math.abs(f.t - first.t) < 1);
}

/** Asserts the fade-in started once the fade-out had run its 0.3 s, and not much later. */
function inAfterOut(out: Fade | undefined, inn: Fade | undefined): void {
  assert.ok(out && inn, "Both a fade-out and a fade-in were recorded.");
  const gap = inn.t - out.t;
  assert.ok(gap >= FADE_MS - 20, `The new state fades in after the old one is gone (${gap} ms).`);
  assert.ok(gap <= FADE_MS + FRAME_SLACK_MS, `And right after it (${gap} ms).`);
}

/** Opens LIVE and loses the board until the box turns OFFLINE (UX-159). */
async function liveToOffline(ctx: UiContext): Promise<void> {
  await openWith(ctx, ctx.example("afternoon"));
  ctx.answer({ fail: "abort" });
  await ctx.advance(LIVE_TO_OFFLINE_MS);
  await settle(ctx);
  await ctx.advance(10_000);
  await settle(ctx);
}

const statusMotionCases: UiCase[] = [
  {
    ids: ["UX-183", "UX-185"],
    title:
      "LIVE to STALE: LIVE fades out over 0.3 s ease-in, then STALE fades in over 0.3 s ease-out as the displays ease into their gray",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("afternoon"));
      ctx.answer({ body: older(ctx.example("afternoon"), STALE_SECONDS) });
      await pollOnce(ctx);
      const fades = await fadesOf(ctx);
      const [out] = fades;
      const outs = phase(fades, out);
      assert.deepEqual(outs.map(shape), [["health", OUT, "ease-in", FADE_MS]]);
      assert.equal(out?.label, "LIVE", "The old state is what fades out.");
      const ins = phase(fades, fades[outs.length]);
      assert.deepEqual(ins.map(shape), [
        ["health", IN, "ease-out", FADE_MS],
        ["warn", IN, "ease-out", FADE_MS],
        ["pages", [CLEAR, GRAY], "ease-out", FADE_MS],
      ]);
      assert.equal(ins[0]?.label, "STALE", "The new state is written before it fades in.");
      assert.equal(ins[0]?.warn, "No agent has reported for 26m. Everything below is old.");
      inAfterOut(out, ins[0]);
      assert.equal(fades.length, outs.length + ins.length, "Nothing else moved.");
      const h = await healthOf(ctx.page);
      assert.deepEqual(
        [h.label, h.bg, h.pagesOpacity, h.pagesFilter],
        ["STALE", COLOR.stale, 0.4, "grayscale(1)"],
      );
    },
  },
  {
    ids: ["UX-184", "UX-185"],
    title:
      "STALE to LIVE: the warning line fades out with STALE, the displays ease out of their gray, and both breaths run in step",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("stale"));
      ctx.answer({ body: ctx.example("afternoon") });
      await pollOnce(ctx);
      const fades = await fadesOf(ctx);
      const outs = phase(fades, fades[0]);
      assert.deepEqual(outs.map(shape), [
        ["health", OUT, "ease-in", FADE_MS],
        ["warn", OUT, "ease-in", FADE_MS],
      ]);
      assert.match(outs[1]?.warn ?? "", STALE_WARNING, "The STALE warning is what fades out.");
      const ins = phase(fades, fades[outs.length]);
      assert.deepEqual(ins.map(shape), [
        ["health", IN, "ease-out", FADE_MS],
        ["pages", [GRAY, CLEAR], "ease-out", FADE_MS],
      ]);
      assert.equal(ins[0]?.label, "LIVE");
      inAfterOut(outs[0], ins[0]);
      const h = await healthOf(ctx.page);
      assert.deepEqual(
        [h.label, h.bg, h.warnShown, h.pagesOpacity, h.pagesFilter],
        ["LIVE", COLOR.okFill, false, 1, "none"],
      );
      // The dot breathes again, and GO TO KEYBOARD with it, on one clock (UX-074, UX-198).
      assert.equal(runningBreaths(h.dot).length, 1, "The LIVE dot breathes.");
      const [dot, slot] = await probe<[number, number]>(ctx.page, "breaths()");
      near(dot, slot, 1, "The dot and GO TO KEYBOARD agree after the fade");
    },
  },
  {
    ids: ["UX-183", "UX-184"],
    title:
      "LIVE to OFFLINE: the box and its warning line fade in together, and a new duration alone moves nothing",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await liveToOffline(ctx);
      const fades = await fadesOf(ctx);
      const outs = phase(fades, fades[0]);
      assert.deepEqual(outs.map(shape), [["health", OUT, "ease-in", FADE_MS]]);
      const ins = phase(fades, fades[outs.length]);
      assert.deepEqual(
        ins.map((f) => f.id),
        ["health", "warn", "pages"],
      );
      assert.equal(ins[0]?.label, "OFFLINE");
      assert.match(ins[0]?.warn ?? "", OFFLINE_WARNING);
      const before = (await healthOf(ctx.page)).warn;
      await ctx.advance(2 * MINUTE_MS);
      await settle(ctx);
      const after = await healthOf(ctx.page);
      assert.notEqual(after.warn, before, "The outage's duration moved on.");
      assert.equal(
        (await fadesOf(ctx)).length,
        fades.length,
        "A new duration alone fades nothing.",
      );
    },
  },
  {
    ids: ["UX-186"],
    title:
      "Nothing in the Status line moves on the first render, on a steady poll, or under reduced motion",
    async run(ctx) {
      await ctx.page.addInitScript(RECORDER);
      await openWith(ctx, ctx.example("stale"));
      assert.equal((await healthOf(ctx.page)).label, "STALE");
      for (let poll = 0; poll < 2; poll += 1) {
        ctx.answer({ body: ctx.example("stale") });
        // biome-ignore lint/performance/noAwaitInLoops: each poll is answered before the next starts
        await pollOnce(ctx);
      }
      assert.deepEqual(
        await fadesOf(ctx),
        [],
        "The first render and two steady polls fade nothing.",
      );
      await ctx.page.emulateMedia({ reducedMotion: "reduce" });
      await openWith(ctx, ctx.example("afternoon"));
      ctx.answer({ body: older(ctx.example("afternoon"), STALE_SECONDS) });
      await pollOnce(ctx);
      const h = await healthOf(ctx.page);
      assert.deepEqual([h.label, h.pagesOpacity], ["STALE", 0.4], "The change lands at once.");
      assert.deepEqual(await fadesOf(ctx), [], "Under reduced motion nothing fades.");
    },
  },
];

export { statusMotionCases };
