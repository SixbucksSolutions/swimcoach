// Helpers shared by the project display checks (MVP-11 B): reading and editing a state body, moving
// between displays the way Terry does (a tap on a dot, a swipe), and reading what the page shows.
// Every wait here is on real time (page.waitForTimeout), because the page's own clock is paused.
import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";
import type { UiContext } from "../types.ts";

type Json = Record<string, unknown>;

// The functions that take a PageElement run inside the page, which has these; the suite's own types
// have no DOM.
interface PageElement {
  readonly tagName: string;
}
declare function getComputedStyle(el: PageElement): Record<string, string>;

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
const HOURS_ON_CLOCK = 12;
const WAIT_STEP_MS = 50;
const WAIT_STEPS = 100;
const PAGE_WIDTH = 402;
const SWIPE_PX = 120;
const OVERVIEW_KEY = "*all*";

/** The page's `data-cur` for the overview. */
export const ALL_KEY = OVERVIEW_KEY;
export type { Json };

/** The milestones of a state body, in the server's order. */
export function milestones(body: Json): Json[] {
  return body.milestones as Json[];
}

/** The title line of a milestone: `project + " " + milestone` (api.md 6.2). */
export function titleOf(m: Json): string {
  return `${m.project as string} ${m.milestone as string}`;
}

/** The milestone with this title. */
export function find(body: Json, title: string): Json {
  const found = milestones(body).find((m) => titleOf(m) === title);
  assert.ok(found, `The state has no milestone "${title}".`);
  return found;
}

/** A copy of the body with the named milestone changed by `patch`. */
export function edit(body: Json, title: string, patch: (m: Json) => void): Json {
  const copy = structuredClone(body);
  patch(find(copy, title));
  return copy;
}

/** A copy of the body with these milestones only, in the order given. */
export function only(body: Json, titles: readonly string[]): Json {
  const copy = structuredClone(body);
  copy.milestones = titles.map((title) => find(copy, title));
  return copy;
}

/** The page's key for a milestone: JSON.stringify([project, milestone]), ASCII-lowercased. */
export function keyOf(title: string, body: Json): string {
  const m = find(body, title);
  return JSON.stringify([
    (m.project as string).toLowerCase(),
    (m.milestone as string).toLowerCase(),
  ]);
}

/** One project's display, found by its title. */
export function displayOf(page: Page, title: string, body: Json): Locator {
  return page.locator(`#pages > section.page[data-key='${keyOf(title, body)}']`);
}

/** A time as the page writes it: 12-hour, lowercase am or pm, no space (UX-006, UX-008). */
export function clockText(epochSeconds: number): string {
  const d = new Date(epochSeconds * MS_PER_SECOND);
  let half = "pm";
  if (d.getHours() < HOURS_ON_CLOCK) {
    half = "am";
  }
  const hour = d.getHours() % HOURS_ON_CLOCK || HOURS_ON_CLOCK;
  return `${hour}:${String(d.getMinutes()).padStart(2, "0")}${half}`;
}

/** A duration as "7m" or "1h 05m", to the nearest minute, never below "1m". */
export function durText(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours > 0) {
    return `${hours}h ${String(rest).padStart(2, "0")}m`;
  }
  return `${Math.max(rest, 1)}m`;
}

/** Collapses runs of white space, so a text compare ignores layout newlines. */
export function squash(text: string | null | undefined): string {
  return (text ?? "").replaceAll(/\s+/gu, " ").trim();
}

/** The text a locator shows, white space squashed. */
export async function textOf(loc: Locator): Promise<string> {
  // biome-ignore lint/performance/useDomNodeTextContent: innerText is the text as rendered, with the line breaks between blocks and any text-transform, which is what a viewer reads.
  return squash(await loc.innerText());
}

/** Reads every element a locator matches, in parallel, and returns the results in page order. */
export async function mapAll<T>(loc: Locator, read: (item: Locator) => Promise<T>): Promise<T[]> {
  const count = await loc.count();
  return await Promise.all(Array.from({ length: count }, (_, index) => read(loc.nth(index))));
}

/** The text nodes of a locator joined, white space squashed: for a flex box, where innerText breaks lines. */
export async function plain(loc: Locator): Promise<string> {
  return squash(await loc.textContent());
}

/** A computed style value of the element. */
export async function style(loc: Locator, property: string): Promise<string> {
  return await loc.evaluate(
    (el: PageElement, name: string) => getComputedStyle(el)[name] ?? "",
    property,
  );
}

/** The element's tag name, upper case. */
export async function tagOf(loc: Locator): Promise<string> {
  return await loc.evaluate((el: PageElement) => el.tagName);
}

/** What a palette token paints, as the browser writes it: "rgb(27, 100, 69)". */
export async function token(page: Page, name: string): Promise<string> {
  return await page.evaluate(
    `(() => { const s = document.createElement("span"); s.style.color = "var(${name})"; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; })()`,
  );
}

/** The box of an element that MUST be on the page. */
export async function boxOf(
  loc: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await loc.boundingBox();
  assert.ok(box, "The element has no box on the page.");
  return box;
}

/** Retries `check` on real time until it holds or about 5 s pass. */
export async function until(
  page: Page,
  what: string,
  check: () => Promise<boolean>,
  tries = WAIT_STEPS,
): Promise<void> {
  if (await check()) {
    return;
  }
  if (tries <= 0) {
    throw new Error(`Timed out waiting for: ${what}`);
  }
  await quiet(page, WAIT_STEP_MS);
  await until(page, what, check, tries - 1);
}

/** Lets real time pass: the page's clock is paused, so a scroll animation or a fetch needs this. */
export async function quiet(page: Page, ms: number): Promise<void> {
  // biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: the page clock is paused, so only real time moves a scroll or a fetch; there is no event to wait on.
  await page.waitForTimeout(ms);
}

/** The horizontal scroll of the displays strip, in px. */
export async function scrollLeft(page: Page): Promise<number> {
  return await page.evaluate(`document.querySelector("#pages").scrollLeft`);
}

/** Waits until the strip rests on display number `index` (0 is the overview). */
export async function settleOn(page: Page, index: number): Promise<void> {
  await until(
    page,
    `the strip at display ${index}`,
    async () => (await scrollLeft(page)) === index * PAGE_WIDTH,
  );
}

/** The key of the display in view, from the page's own `data-cur`. */
export async function currentKey(page: Page): Promise<string> {
  return await page.evaluate(`document.querySelector("#pages").dataset.cur`);
}

/** The Answer for this body, then the page open on it. */
export async function openOn(ctx: UiContext, body: Json): Promise<void> {
  ctx.answer({ body });
  await ctx.open();
}

/** Taps the dot of display number `index`, and waits for the display to come to rest. */
export async function tapDot(page: Page, index: number): Promise<void> {
  await page.locator("#dots button").nth(index).tap();
  await settleOn(page, index);
}

/** Opens the page on this body, then taps the dot of the milestone's display. Returns the display. */
export async function showProject(ctx: UiContext, body: Json, title: string): Promise<Locator> {
  await openOn(ctx, body);
  const index = milestones(body).findIndex((m) => titleOf(m) === title) + 1;
  assert.ok(index > 0, `The state has no milestone "${title}".`);
  await tapDot(ctx.page, index);
  return displayOf(ctx.page, title, body);
}

/**
 * A swipe: the finger goes down on the strip (`touchstart`), the strip moves one display, and the
 * finger lifts (`touchend`). WebKit on a phone cannot construct a Touch or inject a drag, so the two
 * events are plain events of those names and the move is a 120 px scroll, which scroll-snap settles
 * on the next display exactly as a short swipe does.
 */
export async function swipe(page: Page, direction: "left" | "right"): Promise<void> {
  let sign = -1;
  if (direction === "left") {
    sign = 1;
  }
  await page.evaluate(
    `(() => { const el = document.querySelector("#pages"); el.dispatchEvent(new Event("touchstart", { bubbles: true })); el.scrollBy({ left: ${sign * SWIPE_PX}, behavior: "smooth" }); el.dispatchEvent(new Event("touchend", { bubbles: true })); })()`,
  );
}
