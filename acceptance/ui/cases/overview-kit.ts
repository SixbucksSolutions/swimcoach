// Shared helpers for the overview cases (MVP-11 A): palette values as the browser reports them, state
// bodies built from the contract examples, and driving the page through its clock. What the page
// shows is read by overview-probe.ts.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { STATE_PATH } from "../../api/transport.ts";
import type { UiContext } from "../types.ts";
import { type CardInfo, cardsOf, probe } from "./overview-probe.ts";

type Json = Record<string, unknown>;

/** The palette tokens of docs/brand.md section 5, as `getComputedStyle` reports them. */
const COLOR = {
  okFill: "rgb(27, 100, 69)", // --ok-fill #1B6445, good news
  risk: "rgb(250, 204, 21)", // --risk #FACC15, yellow
  riskText: "rgb(35, 26, 0)", // #231A00, text on yellow
  badFill: "rgb(220, 38, 38)", // --bad-fill #DC2626, red
  stack1: "rgb(59, 69, 80)", // --stack-1 #3B4550, gray
  grayText: "rgb(226, 232, 240)", // #E2E8F0, text on gray
  board: "rgb(29, 33, 37)", // --board #1D2125, done slate
  dim: "rgb(147, 163, 179)", // --dim #93A3B3, text on done
  white: "rgb(255, 255, 255)",
  stale: "rgb(154, 52, 18)", // #9A3412, STALE box
  offline: "rgb(153, 27, 27)", // #991B1B, OFFLINE and SIGN IN box
  laneBlue: "rgb(133, 184, 255)", // --lane-blue #85B8FF, "swim"
  laneAmber: "rgb(226, 161, 0)", // --lane-amber #E2A100, "coach"
} as const;

const ALL_KEY = "*all*";
const POLL_MS = 30_000;
const MINUTE_MS = 60_000;
const SETTLE_REAL_MS = 80;
const SETTLE_PAGE_MS = 20;
const WAIT_STEP_MS = 50;
const WAIT_LIMIT_MS = 3000;

/** The kinds of milestone the afternoon and allgreen examples hold, by what they look like. */
type Kind = "gray" | "yellow" | "green" | "done" | "late" | "red" | "flat";

const SOURCE: Readonly<Record<Kind, readonly [example: string, project: string]>> = {
  gray: ["afternoon", "auth-refresh"],
  yellow: ["afternoon", "docs-site"],
  green: ["afternoon", "FGA"],
  done: ["afternoon", "localswim V2"],
  late: ["afternoon", "mobile-onboarding"],
  red: ["afternoon", "search-index"],
  flat: ["allgreen", "docs-site"],
};

/** One milestone of a board: a template kind, optionally renamed, with fields changed. */
interface Pick {
  readonly kind: Kind;
  readonly project?: string;
  /** Top-level fields of the milestone to replace. */
  readonly patch?: Json;
  /** Fields of the milestone's `metrics` to replace. */
  readonly metrics?: Json;
}

/** Asserts a number is within `tolerance` of `expected`. */
function near(actual: number, expected: number, tolerance: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: expected ${expected} within ${tolerance}, got ${actual}.`,
  );
}

/** The card at an index, failing with a clear message when the board has fewer. */
function at(cards: readonly CardInfo[], index: number): CardInfo {
  const found = cards[index];
  assert.ok(found, `Expected a card at index ${index}; the board has ${cards.length}.`);
  return found;
}

/** The card whose Title line is `name`. */
function named(cards: readonly CardInfo[], name: string): CardInfo {
  const found = cards.find((c) => c.name === name);
  assert.ok(found, `No card is titled "${name}"; titles: ${cards.map((c) => c.name).join(", ")}.`);
  return found;
}

// ---- state bodies ----

/** A pick of `kind`, the shortest way to write one. */
function pick(kind: Kind, project?: string, patch?: Json): Pick {
  const out: { kind: Kind; project?: string; patch?: Json } = { kind };
  if (project !== undefined) {
    out.project = project;
  }
  if (patch !== undefined) {
    out.patch = patch;
  }
  return out;
}

/** `n` quiet green Cards named after their index, in server order. */
function fillers(n: number): Pick[] {
  return Array.from({ length: n }, (_, i) =>
    pick("green", `filler-${String(i + 1).padStart(2, "0")}`),
  );
}

/** `n` red picks whose long names cannot all fit one line of GO TO KEYBOARD. */
function reds(n: number): Pick[] {
  return Array.from({ length: n }, (_, i) =>
    pick("red", `payments-platform-migration-${i + 1}`, { needs_me: `Ask number ${i + 1}` }),
  );
}

/** A green pick whose trend bin is set, so its clock hand points somewhere known. */
function withBin(project: string, bin: string): Pick {
  return { ...pick("green", project), metrics: { trend_bin: bin } };
}

function template(ctx: UiContext, kind: Kind): Json {
  const [example, project] = SOURCE[kind];
  const found = (ctx.example(example).milestones as Json[]).find((m) => m.project === project);
  assert.ok(found, `The ${example} example has no milestone for ${project}.`);
  return found;
}

/** A body built from picks, in the order given (the server's order, which the page keeps). */
function board(ctx: UiContext, picks: readonly Pick[]): Json {
  const body = ctx.example("afternoon");
  body.milestones = picks.map((p) => {
    const m = { ...template(ctx, p.kind), ...p.patch } as Json;
    if (p.project !== undefined) {
      m.project = p.project;
    }
    m.metrics = { ...(m.metrics as Json), ...p.metrics };
    return m;
  });
  return body;
}

/** The Title line a pick draws: project, a space, milestone. */
function titleOf(ctx: UiContext, p: Pick): string {
  const m = { ...template(ctx, p.kind), ...p.patch } as Json;
  return `${p.project ?? String(m.project)} ${String(m.milestone)}`;
}

/** The page's `data-go` key for a project and milestone: a JSON array, ASCII-lowercased. */
function keyOf(project: string, milestone: string): string {
  return JSON.stringify([asciiLower(project), asciiLower(milestone)]);
}

function asciiLower(text: string): string {
  return text.replace(/[A-Z]/gu, (c) => c.toLowerCase());
}

/** A copy of a body with every report time `seconds` older, `now` unchanged. */
function older(body: Json, seconds: number): Json {
  const out = structuredClone(body);
  if (typeof out.last_report_at === "number") {
    out.last_report_at -= seconds;
  }
  for (const m of out.milestones as Json[]) {
    for (const key of ["first_report_at", "updated_at", "last_move_at"]) {
      m[key] = Number(m[key]) - seconds;
    }
    m.spark = (m.spark as [number, number][]).map(([t, v]) => [Math.round(t - seconds), v]);
  }
  return out;
}

/** A copy of a body with `now` moved, and every other time with it. */
function retimed(body: Json, nowSeconds: number): Json {
  const out = older(body, -(nowSeconds - Number(body.now)));
  out.now = nowSeconds;
  return out;
}

// ---- driving the page ----

function isStatePoll(url: string): boolean {
  return url.endsWith(STATE_PATH);
}

/** Opens a board of picks and reads its Cards. */
async function overviewOf(ctx: UiContext, picks: readonly Pick[]): Promise<CardInfo[]> {
  await openWith(ctx, board(ctx, picks));
  return await cardsOf(ctx.page);
}

/** Waits in real time; the page clock is paused, so only real time lets the browser itself move. */
function pause(ms: number): Promise<void> {
  return sleep(ms);
}

/** Lets the page finish what a response started, then flushes its animation-frame work. */
async function settle(ctx: UiContext): Promise<void> {
  await sleep(SETTLE_REAL_MS);
  await ctx.advance(SETTLE_PAGE_MS);
}

/** Moves page time on by one poll interval and waits until that poll has been answered. */
async function pollOnce(ctx: UiContext, ms = POLL_MS): Promise<void> {
  const answered = Promise.race([
    ctx.page.waitForResponse((r) => isStatePoll(r.url())),
    ctx.page.waitForEvent("requestfailed", (r) => isStatePoll(r.url())),
  ]);
  await ctx.advance(ms);
  await answered;
  await settle(ctx);
}

/** Counts the page's state polls from now on. */
function countPolls(ctx: UiContext): { count: () => number } {
  let seen = 0;
  ctx.page.on("request", (r) => {
    if (isStatePoll(r.url())) {
      seen += 1;
    }
  });
  return { count: () => seen };
}

/** Opens the page with `body` answered, and settles. */
async function openWith(ctx: UiContext, body: Json): Promise<void> {
  ctx.answer({ body });
  await ctx.open();
  await settle(ctx);
}

/** Collects every uncaught page error, so a case can assert there were none. */
function pageErrors(ctx: UiContext): string[] {
  const errors: string[] = [];
  ctx.page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Waits in real time until a page expression is true; for the browser's own smooth scrolls. */
async function untilTrue(ctx: UiContext, expression: string): Promise<boolean> {
  for (let waited = 0; waited <= WAIT_LIMIT_MS; waited += WAIT_STEP_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows a real-time wait
    if (await probe<boolean>(ctx.page, expression)) {
      return true;
    }
    await sleep(WAIT_STEP_MS);
  }
  return false;
}

/** Taps a card (a click, the page's own tap handler) by its `data-go` key. */
async function tapCard(ctx: UiContext, key: string): Promise<void> {
  await ctx.page.locator(`#pages .pc[data-go='${key}']`).click();
}

/** The key of the display now in view. */
function currentKey(ctx: UiContext): Promise<string> {
  return probe<string>(ctx.page, "q('#pages').dataset.cur ?? ''");
}

export type { Json, Kind, Pick };
export {
  ALL_KEY,
  at,
  board,
  COLOR,
  countPolls,
  currentKey,
  fillers,
  keyOf,
  MINUTE_MS,
  named,
  near,
  older,
  openWith,
  overviewOf,
  POLL_MS,
  pageErrors,
  pause,
  pick,
  pollOnce,
  reds,
  retimed,
  settle,
  tapCard,
  titleOf,
  untilTrue,
  withBin,
};
