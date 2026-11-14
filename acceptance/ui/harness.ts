// The UI suite's harness (MVP-11; docs/planning/t5-interfaces.md). Black box: it loads the page from
// a deployment over HTTP and answers the page's own state polls through Playwright's request routing,
// so the suite never writes to the server and is safe against production. Every body it hands the
// page MUST match contract/schemas/state.schema.json, which is the contract the API suite proves the
// server keeps. It imports nothing from the MVP.
import { readFileSync } from "node:fs";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  type Route,
  webkit,
} from "playwright";
import { expectSchema } from "../api/schema.ts";
import { STATE_PATH } from "../api/transport.ts";
import type { Answer, UiContext } from "./types.ts";

const EXAMPLES = new URL("../../contract/schemas/examples/", import.meta.url);
const VIEWPORT = { width: 402, height: 874 } as const;
const DEVICE_SCALE = 3;
const REVEAL_STEP_MS = 100;
const REVEAL_STEPS = 60;
const MS_PER_SECOND = 1000;
const HTTP_OK = 200;
const HTTP_FOUND = 302;

type BrowserName = "webkit" | "chrome";

interface Target {
  /** The page's origin, such as https://swimcoach-test.example.workers.dev. */
  readonly url: string;
  /** The Access service-token headers, or none for a local server. */
  readonly headers: Readonly<Record<string, string>>;
}

/** A case's context plus what run.ts needs after the case: closing it, and any route failure. */
type CaseContext = UiContext & {
  /** Errors the page's state route met while answering (a refused fulfill, for one). */
  failures: () => readonly unknown[];
  close: () => Promise<void>;
};

interface UiRun {
  newContext: () => Promise<CaseContext>;
  close: () => Promise<void>;
}

type Json = Record<string, unknown>;

/** One case's mutable state: what the next poll gets, page time moved so far, route failures. */
interface CaseState {
  answer: Answer;
  advancedMs: number;
  readonly startMs: number;
  readonly failures: unknown[];
}

/** A contract example with every time moved by the same amount, so its `now` is `nowSeconds`. */
function shifted(body: Json, nowSeconds: number): Json {
  const out = structuredClone(body);
  const shift = nowSeconds - Number(body.now);
  out.now = nowSeconds;
  if (typeof out.last_report_at === "number") {
    out.last_report_at += shift;
  }
  for (const m of out.milestones as Json[]) {
    for (const key of ["first_report_at", "updated_at", "last_move_at"]) {
      m[key] = Number(m[key]) + shift;
    }
    m.spark = (m.spark as [number, number][]).map(([t, v]) => [Math.round(t + shift), v]);
  }
  return out;
}

function exampleBody(name: string): Json {
  return JSON.parse(readFileSync(new URL(`state.${name}.json`, EXAMPLES), "utf8")) as Json;
}

async function launch(name: BrowserName): Promise<Browser> {
  if (name === "chrome") {
    return await chromium.launch({ channel: "chrome" });
  }
  return await webkit.launch();
}

async function contextFor(browser: Browser, target: Target): Promise<BrowserContext> {
  return await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    isMobile: true,
    hasTouch: true,
    // biome-ignore lint/style/useNamingConvention: Playwright's own option name.
    extraHTTPHeaders: { ...target.headers },
  });
}

/** Gives one intercepted state poll the case's current answer. */
async function giveAnswer(route: Route, answer: Answer): Promise<void> {
  if ("body" in answer) {
    await route.fulfill({
      status: HTTP_OK,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify(answer.body),
    });
  } else if (answer.fail === "abort") {
    await route.abort("failed");
  } else if (answer.fail === "redirect") {
    await route.fulfill({
      status: HTTP_FOUND,
      // biome-ignore lint/style/useNamingConvention: an HTTP header name.
      headers: { Location: "/cdn-cgi/access/login" },
    });
  } else {
    await route.fulfill({ status: answer.fail, contentType: "application/json", body: "{}" });
  }
}

/** Answers the page's own state poll, and only it: the exact URL on the target's origin. */
async function routeStatePolls(page: Page, target: Target, state: CaseState): Promise<void> {
  const { origin } = new URL(target.url);
  await page.route(`${origin}${STATE_PATH}`, async (route) => {
    try {
      await giveAnswer(route, state.answer);
    } catch (error) {
      // A refused answer MUST fail the case, never vanish as an unhandled rejection.
      state.failures.push(error);
    }
  });
}

/** Loads "/" and moves the paused page clock on until the page has revealed itself. */
async function openPage(page: Page, target: Target, state: CaseState): Promise<void> {
  await page.goto(`${target.url}/`);
  for (let step = 0; step < REVEAL_STEPS; step += 1) {
    // The page drops the `loading` class from <html> once it has revealed itself.
    // biome-ignore lint/performance/noAwaitInLoops: each step looks, then moves the page clock on; the steps are ordered in time
    if ((await page.locator("html.loading").count()) === 0) {
      return;
    }
    await page.clock.runFor(REVEAL_STEP_MS);
    state.advancedMs += REVEAL_STEP_MS;
  }
  throw new Error("The page did not reveal itself within 6 s of page time.");
}

/** Checks an answer before any poll gets it. */
function checkAnswer(next: Answer, browserName: BrowserName): void {
  if ("body" in next) {
    expectSchema("state.schema.json", next.body);
  } else if (next.fail === "redirect" && browserName === "webkit") {
    throw new Error(
      "WebKit refuses a scripted redirect; run this case with --browser chrome (401 and 403 are the WebKit sign-in answers).",
    );
  }
}

/** One case's fresh context: a new browser context, a paused clock, and the state route. */
async function newCaseContext(
  browser: Browser,
  target: Target,
  browserName: BrowserName,
): Promise<CaseContext> {
  const context = await contextFor(browser, target);
  const page = await context.newPage();
  const state: CaseState = {
    answer: { fail: "abort" },
    advancedMs: 0,
    startMs: Date.now(),
    failures: [],
  };
  // Paused, so page time moves only through open() and advance(), and now() always matches it.
  await page.clock.install({ time: state.startMs });
  await page.clock.pauseAt(state.startMs);
  await routeStatePolls(page, target, state);
  return {
    page,
    answer(next) {
      checkAnswer(next, browserName);
      state.answer = next;
    },
    open: () => openPage(page, target, state),
    async advance(ms) {
      await page.clock.runFor(ms);
      state.advancedMs += ms;
    },
    example(name) {
      return shifted(exampleBody(name), (state.startMs + state.advancedMs) / MS_PER_SECOND);
    },
    now() {
      return (state.startMs + state.advancedMs) / MS_PER_SECOND;
    },
    failures: () => state.failures,
    close: () => context.close(),
  };
}

/** Starts one browser for a run; each case gets its own context, page and clock. */
async function startUi(target: Target, browserName: BrowserName): Promise<UiRun> {
  const browser = await launch(browserName);
  return {
    newContext: () => newCaseContext(browser, target, browserName),
    close: () => browser.close(),
  };
}

export type { BrowserName, CaseContext, Target, UiRun };
export { shifted, startUi };
