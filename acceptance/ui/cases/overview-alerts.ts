// Overview checks, area K (alerts, as far as a browser can prove them) (MVP-11 A). The arrival fade
// of M (UX-135) is superseded; its motion cases are in overview-motion.ts. The chime's sound is not provable here: Web Audio is replaced by a recorder, so these
// cases prove WHEN the page asks the audio system for two tones, and the manual checklist proves it is
// heard. The recorder takes a pitch however the page sets it: `.value`, `setValueAtTime` or a ramp.
import assert from "node:assert/strict";
import type { UiCase, UiContext } from "../types.ts";
import {
  board,
  COLOR,
  type Json,
  openWith,
  pageErrors,
  pause,
  pick,
  pollOnce,
} from "./overview-kit.ts";
import { tapCard, viewing } from "./overview-nav.ts";
import { contrast, probe } from "./overview-probe.ts";

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

async function followToProject(ctx: UiContext, title: string): Promise<void> {
  await tapCard(ctx, title);
  assert.ok(await viewing(ctx, title), "The display slid to the project.");
}

/** Taps the bell, the page's one tap that turns Alerts on or off. */
async function tapBell(ctx: UiContext): Promise<void> {
  await ctx.page.locator("#snd").click();
}

function bellOf(ctx: UiContext): Promise<{
  text: string;
  paths: number;
  label: string | null;
  fill: string;
  ink: string;
  ring: string;
  weight: number;
}> {
  return probe(ctx.page, "bellInfo()");
}

const alertCases: UiCase[] = [
  {
    ids: ["UX-191"],
    title:
      "The bell is a slashed gray icon on a dark disc while Alerts are off, and a bold dark bell on a light disc when on, with no text",
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
      assert.equal(off.fill, COLOR.panel, "Off: the disc is --panel.");
      assert.equal(off.ring, COLOR.line, "Off: the ring is --line.");
      assert.equal(off.ink, COLOR.dim, "Off: the bell is --dim.");
      assert.equal(on.fill, COLOR.text, "On: the disc is --text.");
      assert.equal(on.ring, COLOR.text, "On: the ring matches the disc.");
      assert.equal(on.ink, COLOR.bg, "On: the bell is --bg.");
      assert.ok(
        contrast(on.fill, off.fill) >= 7,
        `On and off discs differ at a glance (${contrast(on.fill, off.fill).toFixed(2)}:1).`,
      );
      assert.ok(
        contrast(on.ink, on.fill) >= 7,
        `The on bell clears AAA on its disc (${contrast(on.ink, on.fill).toFixed(2)}:1).`,
      );
      assert.ok(on.weight > off.weight, `On: the bell is bolder (${on.weight} > ${off.weight}).`);
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
];

export { alertCases };
