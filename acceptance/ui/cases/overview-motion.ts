// Overview motion in V1 (localswim swimcoach #0035; UX-177 to UX-182). Sideways means a project did
// it, vertical means swimcoach did it. A recorder installed before the page loads wraps the browser's
// Element.prototype.animate, so a case reads exactly what the page asked the browser to move, when and
// how, without racing the real-time animations it starts. It reads the page through the platform only.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import { board, type Json, openWith, pause, pick, pollOnce, titleOf } from "./overview-kit.ts";
import { tapDot } from "./project-support.ts";

const PHASE_MS = 300;
const GHOST_GONE_MS = 900;

const RECORDER = `
(() => {
  window.__moves = [];
  const real = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    let who = this.className;
    if (this.matches('b')) { who = 'title:' + this.textContent; }
    else if (this.classList.contains('donebar')) { who = 'GO CODE REVIEW'; }
    else if (this.querySelector('.nm b')) { who = this.querySelector('.nm b').textContent; }
    const first = frames[0] ?? {};
    const last = frames[frames.length - 1] ?? {};
    window.__moves.push({
      who, from: String(first.transform ?? ''), to: String(last.transform ?? ''),
      fromHeight: first.height ?? null, toHeight: last.height ?? null,
      fromFont: first.fontSize ?? null, toFont: last.fontSize ?? null,
      delay: options?.delay ?? 0, duration: options?.duration ?? 0, easing: options?.easing ?? '',
    });
    return real.call(this, frames, options);
  };
})();
`;

/** One animate() call the page made. */
interface Move {
  readonly who: string;
  readonly from: string;
  readonly to: string;
  readonly fromHeight: string | null;
  readonly toHeight: string | null;
  readonly fromFont: string | null;
  readonly toFont: string | null;
  readonly delay: number;
  readonly duration: number;
  readonly easing: string;
}

/** Every animate() call since the last read, and clears the record. */
async function movesOf(ctx: UiContext): Promise<Move[]> {
  return await ctx.page.evaluate<Move[]>("window.__moves.splice(0)");
}

/** The one move of `who`, failing clearly when there is none or more than one. */
function moveOf(moves: readonly Move[], who: string): Move {
  const found = moves.filter((m) => m.who === who);
  assert.equal(
    found.length,
    1,
    `One move of ${who}; moves: ${moves.map((m) => m.who).join(", ")}.`,
  );
  const [move] = found;
  assert.ok(move);
  return move;
}

/** Opens `first` with the recorder installed, then answers `next` and polls once. */
async function changeTo(ctx: UiContext, first: Json, next: Json): Promise<Move[]> {
  await ctx.page.addInitScript(RECORDER);
  await openWith(ctx, first);
  await movesOf(ctx);
  ctx.answer({ body: next });
  await pollOnce(ctx);
  return await movesOf(ctx);
}

function greens(ctx: UiContext, names: readonly string[]): Json {
  return board(
    ctx,
    names.map((n) => pick("green", n)),
  );
}

/** The Title line of a green card for project `name`. */
function named(ctx: UiContext, name: string): string {
  return titleOf(ctx, pick("green", name));
}

export const motionCases: UiCase[] = [
  {
    ids: ["UX-177"],
    title:
      "A project card that joins the grid slides in from off the left edge, after the cards below glide down",
    async run(ctx) {
      const moves = await changeTo(
        ctx,
        greens(ctx, ["alpha", "bravo", "delta", "echo"]),
        greens(ctx, ["alpha", "bravo", "charlie", "delta", "echo"]),
      );
      const arrival = moveOf(moves, named(ctx, "charlie"));
      assert.match(arrival.from, /^translateX\(-/u, "From off the left edge.");
      assert.equal(arrival.to, "none");
      assert.deepEqual(
        [arrival.easing, arrival.duration, arrival.delay],
        ["ease-out", PHASE_MS, PHASE_MS],
      );
      for (const below of [named(ctx, "delta"), named(ctx, "echo")]) {
        const glide = moveOf(moves, below);
        assert.match(
          glide.from,
          /^translateY\(-/u,
          `${below} starts one slot higher and glides down.`,
        );
        assert.deepEqual([glide.easing, glide.delay], ["ease-in-out", 0]);
      }
      assert.ok(
        moves.every((m) => m.who !== named(ctx, "alpha") && m.who !== named(ctx, "bravo")),
        "Cards above the new one do not move.",
      );
    },
  },
  {
    ids: ["UX-178"],
    title:
      "A project card that leaves the grid accelerates off the right edge, then the cards below glide up",
    async run(ctx) {
      const moves = await changeTo(
        ctx,
        greens(ctx, ["alpha", "bravo", "charlie", "delta", "echo"]),
        greens(ctx, ["alpha", "charlie", "delta", "echo"]),
      );
      const exit = moveOf(moves, named(ctx, "bravo"));
      assert.equal(exit.from, "none");
      assert.match(exit.to, /^translateX\(\d/u, "Off the right edge.");
      assert.deepEqual([exit.easing, exit.duration, exit.delay], ["ease-in", PHASE_MS, 0]);
      for (const below of [named(ctx, "charlie"), named(ctx, "delta"), named(ctx, "echo")]) {
        const glide = moveOf(moves, below);
        assert.match(
          glide.from,
          /^translateY\(\d/u,
          `${below} starts one slot lower and glides up.`,
        );
        assert.deepEqual([glide.easing, glide.delay], ["ease-in-out", PHASE_MS]);
      }
      await pause(GHOST_GONE_MS);
      assert.equal(
        await ctx.page.locator(".ghost").count(),
        0,
        "The ghost goes when its exit ends.",
      );
    },
  },
  {
    ids: ["UX-179"],
    title: "GO TO KEYBOARD drops in from above the card area and retracts up out of it",
    async run(ctx) {
      const calm = greens(ctx, ["alpha", "bravo", "charlie", "delta"]);
      const asking = board(ctx, [
        pick("green", "alpha"),
        pick("green", "bravo"),
        pick("green", "charlie"),
        pick("green", "delta"),
        pick("red", "echo", { needs_me: "Choose a database" }),
      ]);
      const arrive = moveOf(await changeTo(ctx, calm, asking), "GO TO KEYBOARD");
      assert.match(arrive.from, /^translateY\(-/u, "From above.");
      assert.deepEqual([arrive.easing, arrive.duration], ["ease-out", PHASE_MS]);
      ctx.answer({ body: calm });
      await pollOnce(ctx);
      const leave = moveOf(await movesOf(ctx), "GO TO KEYBOARD");
      assert.match(leave.to, /^translateY\(-/u, "Back up.");
      assert.deepEqual([leave.easing, leave.delay], ["ease-in", 0]);
    },
  },
  {
    ids: ["UX-180"],
    title: "The GO CODE REVIEW line rises from under the dots and sinks back under them",
    async run(ctx) {
      const two = [pick("green", "alpha"), pick("green", "bravo")];
      const rise = moveOf(
        await changeTo(ctx, board(ctx, two), board(ctx, [...two, pick("done", "charlie")])),
        "GO CODE REVIEW",
      );
      assert.match(rise.from, /^translateY\(\d/u, "From below.");
      assert.deepEqual([rise.easing, rise.duration], ["ease-out", PHASE_MS]);
      ctx.answer({ body: board(ctx, [...two, pick("done", "charlie"), pick("done", "delta")]) });
      await pollOnce(ctx);
      assert.deepEqual(await movesOf(ctx), [], "A count change alone moves nothing.");
      ctx.answer({ body: board(ctx, two) });
      await pollOnce(ctx);
      const sink = moveOf(await movesOf(ctx), "GO CODE REVIEW");
      assert.match(sink.to, /^translateY\(\d/u, "Back down.");
      assert.equal(sink.easing, "ease-in");
    },
  },
  {
    ids: ["UX-181"],
    title:
      "Exits, then one glide that resizes cards across the 3/6 boundary, then arrivals, 0.3 s each",
    async run(ctx) {
      const moves = await changeTo(
        ctx,
        greens(ctx, ["alpha", "bravo", "charlie", "delta"]),
        greens(ctx, ["alpha", "delta", "echo"]),
      );
      for (const gone of [named(ctx, "bravo"), named(ctx, "charlie")]) {
        assert.equal(moveOf(moves, gone).delay, 0, `${gone} leaves in phase 1.`);
      }
      const grow = moveOf(moves, named(ctx, "delta"));
      assert.equal(grow.delay, PHASE_MS, "The glide is phase 2.");
      assert.ok(
        grow.fromHeight !== null && grow.toHeight !== null,
        "Crossing to three slots resizes the cards during the glide.",
      );
      assert.ok(
        Number.parseFloat(grow.toHeight ?? "0") > Number.parseFloat(grow.fromHeight ?? "0"),
        "Half slots grow to full.",
      );
      const font = moveOf(moves, `title:${named(ctx, "delta")}`);
      assert.deepEqual([font.fromFont, font.toFont, font.delay], ["20px", "24px", PHASE_MS]);
      assert.equal(moveOf(moves, named(ctx, "echo")).delay, 2 * PHASE_MS, "Arrivals are phase 3.");
      assert.ok(
        moves.every((m) => m.duration === PHASE_MS),
        "Every phase lasts 0.3 s.",
      );
    },
  },
  {
    ids: ["UX-182"],
    title: "Nothing moves under reduced motion, on a project display, or on a steady poll",
    async run(ctx) {
      const before = greens(ctx, ["alpha", "bravo", "delta"]);
      const after = greens(ctx, ["alpha", "bravo", "charlie", "delta"]);
      // A steady poll: the same body again.
      const steady = await changeTo(ctx, before, before);
      assert.deepEqual(steady, [], "A steady poll moves nothing.");
      // A project display on screen: the change happens off screen.
      await tapDot(ctx.page, 1);
      await movesOf(ctx);
      ctx.answer({ body: after });
      await pollOnce(ctx);
      assert.deepEqual(
        await movesOf(ctx),
        [],
        "Nothing moves while a project display is on screen.",
      );
      // Reduced motion, back on the overview.
      await tapDot(ctx.page, 0);
      await ctx.page.emulateMedia({ reducedMotion: "reduce" });
      await movesOf(ctx);
      ctx.answer({ body: before });
      await pollOnce(ctx);
      assert.deepEqual(await movesOf(ctx), [], "Nothing moves under reduced motion.");
    },
  },
];
