// Overview checks, area K (alerts, as far as a browser can prove them) and the arrival fade of M
// (MVP-11 A). The chime's sound is not provable here: Web Audio is replaced by a recorder, so these
// cases prove WHEN the page asks the audio system for two tones, and the manual checklist proves it is
// heard. The recorder takes a pitch however the page sets it: `.value`, `setValueAtTime` or a ramp.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import {
  at,
  board,
  type Json,
  openWith,
  pageErrors,
  pause,
  pick,
  pollOnce,
} from "./overview-kit.ts";
import { tapCard, viewing } from "./overview-nav.ts";
import { type AnimationInfo, type CardInfo, cardsOf, probe } from "./overview-probe.ts";

const ARRIVE_MS = 300;
const LOOKS = 400;
const GTK = "GO TO KEYBOARD";

const AUDIO_SPY = `
(() => {
  window.__audio = { contexts: 0, tones: [] };
  window.__audioInfo = () => ({
    contexts: window.__audio.contexts,
    tones: window.__audio.tones.filter((t) => t.started).map((t) => t.pitches.filter((p) => p > 0)),
  });
  class Plain { constructor() { this.value = 0; } setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } cancelScheduledValues() { return this; } }
  class Pitch {
    constructor(tone) { this.tone = tone; this.now = 0; }
    get value() { return this.now; }
    set value(v) { this.set(v); }
    set(v) { this.now = v; this.tone.pitches.push(v); return this; }
    setValueAtTime(v) { return this.set(v); }
    linearRampToValueAtTime(v) { return this.set(v); }
    exponentialRampToValueAtTime(v) { return this.set(v); }
    setTargetAtTime(v) { return this.set(v); }
    cancelScheduledValues() { return this; }
  }
  class Node { connect(next) { return next; } disconnect() { return undefined; } }
  class Recorder {
    constructor() { window.__audio.contexts += 1; this.currentTime = 0; this.state = 'suspended'; this.destination = new Node(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { const g = new Node(); g.gain = new Plain(); return g; }
    createOscillator() {
      const tone = { pitches: [], started: false };
      const o = new Node();
      o.frequency = new Pitch(tone);
      o.detune = new Plain();
      o.start = () => { tone.started = true; };
      o.stop = () => undefined;
      window.__audio.tones.push(tone);
      return o;
    }
  }
  window.AudioContext = Recorder;
  window.webkitAudioContext = Recorder;
})();
`;

interface Heard {
  readonly contexts: number;
  /** The pitches (Hz) each started oscillator was given, in the order the page started them. */
  readonly tones: number[][];
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

/** The animations on a Card that are not its breath: a fade is a single short run. */
function fades(card: CardInfo): AnimationInfo[] {
  return card.animations.filter((a) => !(a.duration === 2000 && a.iterations === 20));
}

async function followToProject(ctx: UiContext, title: string): Promise<void> {
  await tapCard(ctx, title);
  assert.ok(await viewing(ctx, title), "The display slid to the project.");
}

/** A poll's arrival snapshot, taken as soon as the Card titled `title` is on the page (the fade lasts 300 ms). */
async function arrivalAfterPoll(ctx: UiContext, title: string): Promise<CardInfo[]> {
  const answered = ctx.page.waitForResponse((r) => r.url().includes("/state"));
  await ctx.advance(30_000);
  await answered;
  for (let look = 0; look < LOOKS; look += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the last
    const cards = await cardsOf(ctx.page);
    if (cards.some((c) => c.name === title)) {
      return cards;
    }
  }
  throw new Error(`The page never drew "${title}".`);
}

/** Taps the bell, the page's one tap that turns Alerts on or off. */
async function tapBell(ctx: UiContext): Promise<void> {
  await ctx.page.locator("#snd").click();
}

function bellOf(ctx: UiContext): Promise<{
  text: string;
  paths: number;
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
      assert.equal(off.label, "Alerts off");
      await tapBell(ctx);
      const on = await bellOf(ctx);
      assert.equal(on.paths, 2, "On: the plain bell.");
      assert.equal(on.label, "Alerts on");
    },
  },
  {
    ids: ["UX-126", "UX-128"],
    title: "Alerts on: a new needs-you item asks for two tones, with no script error",
    async run(ctx) {
      const errors = pageErrors(ctx);
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      await tapBell(ctx);
      const tapped = await heard(ctx);
      assert.ok(tapped.contexts >= 1, "The bell tap makes an audio context.");
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      const chime = (await heard(ctx)).tones.slice(tapped.tones.length);
      const pitches = new Set(chime.flat());
      assert.ok(chime.length > 0, "The arrival starts a tone.");
      assert.ok(
        pitches.size >= 2,
        `Two distinct tones play (pitches: ${[...pitches].join(", ")}).`,
      );
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
      await followToProject(ctx, "alpha T02");
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      assert.ok(await viewing(ctx, ""), "The page came back to the overview.");
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
      assert.deepEqual(await heard(ctx), { contexts: 0, tones: [] }, "No sound before the tap.");
      await tapBell(ctx);
      assert.ok((await heard(ctx)).contexts >= 1, "The bell tap provides the audio context.");
    },
  },
  {
    ids: ["UX-130"],
    title: "Alerts off: a new needs-you item plays no chime and does not move the viewer",
    async run(ctx) {
      await ctx.page.addInitScript(AUDIO_SPY);
      await openWith(ctx, calm(ctx));
      await followToProject(ctx, "alpha T02");
      ctx.answer({ body: asking(ctx) });
      await pollOnce(ctx);
      await pause(800);
      assert.deepEqual(await heard(ctx), { contexts: 0, tones: [] });
      assert.ok(await viewing(ctx, "alpha T02"), "The viewer stays on the project display.");
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
      const cards = await arrivalAfterPoll(ctx, "delta T04");
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
      const withSlot = await arrivalAfterPoll(ctx, GTK);
      const slot = withSlot.find((c) => c.name === GTK);
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
      const cards = await arrivalAfterPoll(ctx, GTK);
      assert.ok(
        cards.every((c) => fades(c).length === 0),
        "No animation runs.",
      );
    },
  },
];

export { alertCases };
