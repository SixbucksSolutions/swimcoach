// What a viewer sees, read from the page: computed styles, boxes, text and animations (MVP-11 A).
// Black box: it reads the rendered page, never its code. The acceptance package has no DOM types, so
// the page-side code is source text, run in the page by `probe`.
import assert from "node:assert/strict";
import type { Page } from "playwright";

/** --text #E8EEF4: what a lit page dot is filled with. */
const TEXT_COLOR = "rgb(232, 238, 244)";

/** A box in CSS px, with the derived edges. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
  readonly b: number;
  readonly cx: number;
  readonly cy: number;
}

interface AnimationInfo {
  readonly name: string | null;
  readonly time: number;
  readonly state: string;
  readonly end: number;
  readonly duration: number;
  readonly iterations: number;
  readonly easing: string;
}

/** The animation properties a style sheet gives an element, as computed. */
interface CssAnimation {
  readonly name: string;
  readonly duration: string;
  readonly timing: string;
  readonly iterations: string;
}

interface CardInfo {
  readonly bg: string;
  readonly fg: string;
  readonly box: Box;
  readonly name: string;
  readonly nameBox: Box;
  readonly nameSize: number;
  readonly nameWeight: string;
  readonly nameClipped: boolean;
  readonly nameOverflow: string;
  readonly detail: string | null;
  readonly detailBox: Box | null;
  readonly detailSize: number | null;
  readonly detailWeight: string | null;
  readonly detailClamp: string | null;
  readonly detailClipped: boolean;
  readonly rtr: string | null;
  readonly rtrBox: Box | null;
  readonly rtrSize: number | null;
  readonly rtrWeight: string | null;
  readonly pivotBox: Box | null;
  readonly handBox: Box | null;
  readonly handLabel: string | null;
  readonly animations: readonly AnimationInfo[];
  readonly css: CssAnimation;
}

interface HealthInfo {
  readonly label: string;
  readonly age: string;
  readonly bg: string;
  readonly fg: string;
  readonly weight: string;
  readonly box: Box;
  readonly dot: readonly AnimationInfo[];
  readonly dotCss: CssAnimation;
  readonly warn: string;
  readonly warnShown: boolean;
  readonly pagesOpacity: number;
  readonly pagesFilter: string;
}

/** The parts of the Status line, as boxes. */
interface StatusBoxes {
  readonly header: Box;
  readonly brand: Box;
  readonly wordmark: Box;
  readonly clock: Box;
  readonly health: Box;
  readonly bell: Box;
  readonly clockText: string;
}

/** The Card display area: from the first slot's top to the page's bottom padding edge. */
interface Area {
  readonly top: number;
  readonly bottom: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly half: boolean;
  readonly overflowY: string;
}

/** The page-side helpers. Every probe expression runs after this source, in one scope. */
const HELPERS = `
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const cs = (e) => getComputedStyle(e);
const num = (v) => Number.parseFloat(v);
const box = (e) => {
  if (!e) { return null; }
  const b = e.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
};
const anims = (e) => e.getAnimations().map((a) => {
  const t = a.effect.getComputedTiming();
  return { name: a.animationName ?? null, time: a.currentTime, state: a.playState, end: t.endTime, duration: t.duration, iterations: t.iterations, easing: a.effect.getTiming().easing };
});
const css = (e) => {
  const s = cs(e);
  return { name: s.animationName, duration: s.animationDuration, timing: s.animationTimingFunction, iterations: s.animationIterationCount };
};
const card = (c) => {
  const b = q('.nm b', c);
  const s = q('.nm span', c);
  const rt = q('.rt', c);
  const hand = q('.hand', c);
  return {
    bg: cs(c).backgroundColor, fg: cs(c).color, box: box(c),
    name: b.textContent, nameBox: box(b), nameSize: num(cs(b).fontSize), nameWeight: cs(b).fontWeight,
    nameClipped: b.scrollWidth > b.clientWidth + 1, nameOverflow: cs(b).textOverflow,
    detail: s ? s.textContent : null, detailBox: box(s), detailSize: s ? num(cs(s).fontSize) : null,
    detailWeight: s ? cs(s).fontWeight : null, detailClamp: s ? cs(s).webkitLineClamp : null,
    detailClipped: s ? s.scrollHeight > s.clientHeight + 1 : false,
    rtr: rt ? rt.textContent : null, rtrBox: box(rt), rtrSize: rt ? num(cs(rt).fontSize) : null,
    rtrWeight: rt ? cs(rt).fontWeight : null, pivotBox: box(q('.pivot', c)), handBox: box(hand),
    handLabel: hand ? hand.getAttribute('aria-label') : null, animations: anims(c), css: css(c),
  };
};
const cards = () => qa('#pages .cards .pc').map(card);
const health = () => {
  const h = q('#health');
  const w = q('#warn');
  return {
    label: q('#health b').textContent, age: q('#health span').textContent,
    bg: cs(h).backgroundColor, fg: cs(h).color, weight: cs(q('#health b')).fontWeight, box: box(h),
    dot: anims(q('#health i')), dotCss: css(q('#health i')), warn: w.textContent, warnShown: cs(w).display !== 'none',
    pagesOpacity: num(cs(q('#pages')).opacity), pagesFilter: cs(q('#pages')).filter,
  };
};
const statusBoxes = () => ({
  header: box(q('header')), brand: box(q('#brand')), wordmark: box(q('header h1')), clock: box(q('#clock')),
  health: box(q('#health')), bell: box(q('#snd')), clockText: q('#clock').textContent,
});
const gtk = () => qa('#pages .cards .pc').find((c) => q('.nm b', c).textContent === 'GO TO KEYBOARD');
const breath = (e) => e.getAnimations().find((a) => {
  const t = a.effect.getComputedTiming();
  return t.duration === 2000 && t.iterations === 20;
});
const breaths = () => [breath(q('#health i')).currentTime, breath(gtk()).currentTime];
const inView = () => qa('#pages > section.page').find((s) => Math.abs(s.getBoundingClientRect().left) < 2);
const litDot =(lit) => qa('#dots button i').findIndex((i) => cs(i).backgroundColor === lit);
const wordmark = () => ({
  text: q('header h1').textContent, swim: cs(q('header h1 .word')).color, coach: cs(q('header h1 .word span')).color,
});
const texts = () => ({
  clock: q('#clock').textContent, foot: qa('.foot').map((e) => e.textContent).join('|'),
  axis: qa('.xax span').map((e) => e.textContent),
});
const bellInfo = () => ({
  text: q('#snd').textContent, paths: qa('#snd svg path').length,
  label: q('#snd').getAttribute('aria-label'),
});
const area = () => {
  const p = q('#pages .page');
  const c = q('#pages .cards');
  const top = box(c).y;
  const bottom = box(p).y + p.clientHeight - num(cs(p).paddingBottom);
  return {
    top, bottom, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight,
    half: box(q('#pages .cards .pc')).h < (bottom - top) / 4, overflowY: cs(p).overflowY,
  };
};
`;

/** Runs a probe expression in the page, after the helper source, and returns its JSON value. */
async function probe<T>(page: Page, expression: string): Promise<T> {
  return await page.evaluate<T>(`(() => { ${HELPERS}\nreturn (${expression}); })()`);
}

function cardsOf(page: Page): Promise<CardInfo[]> {
  return probe<CardInfo[]>(page, "cards()");
}

function healthOf(page: Page): Promise<HealthInfo> {
  return probe<HealthInfo>(page, "health()");
}

function statusBoxesOf(page: Page): Promise<StatusBoxes> {
  return probe<StatusBoxes>(page, "statusBoxes()");
}

function areaOf(page: Page): Promise<Area> {
  return probe<Area>(page, "area()");
}

/** The box of the first element a selector finds. */
function boxOf(page: Page, selector: string): Promise<Box> {
  return probe<Box>(page, `box(q(${JSON.stringify(selector)}))`);
}

/** One computed style property of the first element a selector finds. */
function styleOf(page: Page, selector: string, property: string): Promise<string> {
  return probe<string>(page, `cs(q(${JSON.stringify(selector)}))[${JSON.stringify(property)}]`);
}

/** The animations that are a breath: a 2 s cycle run 20 times, still running. Found by timing, not by name. */
function runningBreaths(list: readonly AnimationInfo[]): AnimationInfo[] {
  return list.filter((a) => a.duration === 2000 && a.iterations === 20 && a.state === "running");
}

/** Which page dot is lit, by paint: the one filled with the text color (--text #E8EEF4); -1 if none. */
function litDotOf(page: Page): Promise<number> {
  return probe<number>(page, `litDot(${JSON.stringify(TEXT_COLOR)})`);
}

function luminance(rgb: string): number {
  const match = /^rgb\((?<r>\d+), (?<g>\d+), (?<b>\d+)\)$/u.exec(rgb);
  assert.ok(match?.groups, `"${rgb}" is not an opaque rgb() color.`);
  const { r = "0", g = "0", b = "0" } = match.groups;
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => {
    const s = Number(c) / 255;
    if (s <= 0.039_28) {
      return s / 12.92;
    }
    return ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** The WCAG contrast ratio of two opaque rgb() colors, as `getComputedStyle` reports them. */
function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type { AnimationInfo, Area, Box, CardInfo, CssAnimation, HealthInfo, StatusBoxes };
export {
  areaOf,
  boxOf,
  cardsOf,
  contrast,
  healthOf,
  litDotOf,
  probe,
  runningBreaths,
  statusBoxesOf,
  styleOf,
};
