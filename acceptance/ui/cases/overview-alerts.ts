// Overview checks, area K (alerts, as far as a browser can prove them) and the arrival fade of M
// (MVP-11 A). The chime's sound is not provable here: Web Audio is replaced by a recorder, so these
// cases prove WHEN the page asks for a two-tone chime, and the manual checklist proves it is heard.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import {
  ALL_KEY,
  at,
  board,
  currentKey,
  type Json,
  keyOf,
  openWith,
  pageErrors,
  pause,
  pick,
  pollOnce,
  tapCard,
  untilTrue,
} from "./overview-kit.ts";
import { type AnimationInfo, type CardInfo, cardsOf, probe } from "./overview-probe.ts";

const ARRIVE_MS = 300;
const NOTE_HZ = [740, 990];
const LOOKS = 60;

/**
 * Replaces Web Audio with a recorder, so a chime can be observed: the test browser may have no audio
 * at all (Playwright's WebKit on Windows has no AudioContext), and a recorder behaves the same in
 * every browser. It counts the contexts the page makes and keeps every oscillator it asks for.
 */
const AUDIO_SPY = `
(() => {
  window.__audio = { contexts: 0, oscillators: [] };
  window.__audioInfo = () => ({
    contexts: window.__audio.contexts,
    hz: window.__audio.oscillators.map((o) => o.frequency.value),
  });
  class Param { constructor() { this.value = 0; } setValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } linearRampToValueAtTime() { return this; } }
  class Node { connect(next) { return next; } }
  class Recorder {
    constructor() { window.__audio.contexts += 1; this.currentTime = 0; this.state = 'suspended'; this.destination = new Node(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { const g = new Node(); g.gain = new Param(); return g; }
    createOscillator() {
      const o = new Node();
      o.frequency = new Param();
      o.start = () => undefined;
      o.stop = () => undefined;
      window.__audio.oscillators.push(o);
      return o;
    }
  }
  window.AudioContext = Recorder;
  window.webkitAudioContext = Recorder;
})();
`;

interface Heard {
  readonly contexts: number;
  readonly hz: number[];
}

function heard(ctx: UiContext): Promise<Heard> {
  return probe<Heard>(ctx.page, "window.__audioInfo()");
}

function calm(ctx: UiContext): Json {
  return board(ctx, [pick("flat", "alpha"), pick("green", "bravo"), pick("green", "charlie")]);
}

function asking(ctx: UiContext): Json {
  return board(ctx, [
    pick("flat", "alpha"),
    pick("green", "bravo"),
    pick("green", "charlie"),
    pick("red", "delta", { needs_me: "Choose a database" }),
  ]);
}

function fades(card: CardInfo): AnimationInfo[] {
  return card.animations.filter((a) => a.name !== "throb");
}

async function followToProject(ctx: UiContext, key: string): Promise<void> {
  await tapCard(ctx, key);
  assert.ok(
    await untilTrue(ctx, `q('#pages').dataset.cur === ${JSON.stringify(key)}`),
    "The display slid to the project.",
  );
}

/** A poll's arrival snapshot, taken as soon as `count` cards are on the page (the fade lasts 300 ms). */
async function arrivalAfterPoll(ctx: UiContext, count: number): Promise<CardInfo[]> {
  const answered = ctx.page.waitForResponse((r) => r.url().includes("/state"));
  await ctx.advance(30_000);
  await answered;
  for (let look = 0; look < LOOKS; look += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the last
    const cards = await cardsOf(ctx.page);
    if (cards.length === count) {
      return cards;
    }
  }
  throw new Error(`The page never drew ${count} cards.`);
}

/** Taps the bell, the page's one tap that turns Alerts on or off. */
async function tapBell(ctx: UiContext): Promise<void> {
  await ctx.page.locator("#snd").click();
}

function bellOf(ctx: UiContext): Promise<{
  text: string;
  paths: number;
  on: boolean;
  label: string | null;
}> {
  return probe(ctx.page, "bellInfo()");
}

const alertCases: UiCase[] = [
  {
    ids: ["UX-125"],
    title: "The bell is a slashed icon while Alerts are off, plain when on, with no text",
    async run(ctx) {
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, ctx.example("afternoon"));
      const off = await bellOf(ctx);
      assert.equal(off.text, "", "The bell has no text.");
      assert.equal(off.paths, 3, "Off: the bell and its slash.");
      assert.equal(off.on, false);
      assert.equal(off.label, "Alerts off");
      await tapBell(ctx);
      const on = await bellOf(ctx);
      assert.equal(on.paths, 2, "On: the plain bell.");
      assert.equal(on.on, true);
      assert.equal(on.label, "Alerts on");
    },
  },
  {
    ids: ["UX-126", "UX-128"],
    title: "Alerts on: a new needs-you item plays a two-tone chime, with no script error",
    async run(ctx) {
      const errors = pageErrors(ctx);
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      await tapBell(ctx);
      const tapped = await heard(ctx);
      assert.equal(tapped.contexts, 1, "The bell tap makes the audio context.");
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      const after = await heard(ctx);
      assert.deepEqual(after.hz.slice(tapped.hz.length), NOTE_HZ, "A two-tone chime plays.");
      assert.deepEqual(
        errors,
        [],
        "The chime raises no script error (no vibration API in WebKit).",
      );
    },
  },
  {
    ids: ["UX-127"],
    title: "Alerts on: the page jumps to the overview when the new needs-you item arrives",
    async run(ctx) {
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      await tapBell(ctx);
      await followToProject(ctx, keyOf("alpha", "T02"));
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      assert.ok(
        await untilTrue(ctx, `q('#pages').dataset.cur === ${JSON.stringify(ALL_KEY)}`),
        "The page came back to the overview.",
      );
      assert.equal(await currentKey(ctx), ALL_KEY);
    },
  },
  {
    ids: ["UX-129"],
    title: "Sound needs one tap first: nothing plays before the bell is tapped",
    async run(ctx) {
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      assert.deepEqual(await heard(ctx), { contexts: 0, hz: [] }, "No sound before the tap.");
      await tapBell(ctx);
      assert.equal((await heard(ctx)).contexts, 1, "The bell tap provides the audio context.");
    },
  },
  {
    ids: ["UX-130"],
    title: "Alerts off: a new needs-you item plays no chime and does not move the viewer",
    async run(ctx) {
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      const key = keyOf("alpha", "T02");
      await followToProject(ctx, key);
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      await pause(800);
      assert.deepEqual(await heard(ctx), { contexts: 0, hz: [] });
      assert.equal(await currentKey(ctx), key, "The viewer stays on the project display.");
    },
  },
  {
    ids: ["UX-135"],
    title:
      "A card that arrives after the first render fades in over 0.3 s ease-in; the others are untouched",
    async run(ctx) {
      await openWith(ctx, calm(ctx));
      const before = await cardsOf(ctx.page);
      assert.ok(
        before.every((c) => fades(c).length === 0),
        "Nothing animates in steady state.",
      );
      ctx.answer({
        body: board(ctx, [
          pick("flat", "alpha"),
          pick("green", "bravo"),
          pick("green", "charlie"),
          pick("green", "delta"),
        ]),
      });
      const cards = await arrivalAfterPoll(ctx, 4);
      const fresh = fades(at(cards, 3));
      assert.equal(fresh.length, 1, "The new card animates.");
      assert.equal(fresh[0]?.duration, ARRIVE_MS);
      assert.equal(fresh[0]?.easing, "ease-in");
      assert.ok(
        cards.slice(0, 3).every((c) => fades(c).length === 0),
        "Cards already on screen are untouched.",
      );
      // GO TO KEYBOARD arriving fades in too.
      ctx.answer({ body: asking(ctx) });
      const withSlot = await arrivalAfterPoll(ctx, 4);
      const slot = withSlot.find((c) => c.cls.includes("kbd"));
      assert.ok(slot, "GO TO KEYBOARD arrived.");
      assert.equal(fades(slot).filter((a) => a.duration === ARRIVE_MS).length, 1);
    },
  },
  {
    ids: ["UX-135"],
    title: "Under reduced motion no card fades in",
    async run(ctx) {
      await ctx.page.emulateMedia({ reducedMotion: "reduce" });
      await openWith(ctx, calm(ctx));
      ctx.answer({ body: asking(ctx) });
      const cards = await arrivalAfterPoll(ctx, 4);
      assert.ok(
        cards.every((c) => fades(c).length === 0),
        "No animation runs.",
      );
    },
  },
];

export { alertCases };
