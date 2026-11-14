// The UI suite's harness (MVP-11; docs/planning/t5-interfaces.md). Black box: it loads the page from
// a deployment over HTTP and answers the page's own state polls through Playwright's request routing,
// so the suite never writes to the server and is safe against production. Every body it hands the
// page MUST match contract/schemas/state.schema.json, which is the contract the API suite proves the
// server keeps. It imports nothing from the MVP.
import { readFileSync } from "node:fs";
import { type Browser, type BrowserContext, chromium, webkit } from "playwright";
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

interface UiRun {
  newContext: () => Promise<UiContext & { close: () => Promise<void> }>;
  close: () => Promise<void>;
}

type Json = Record<string, unknown>;

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

/** Starts one browser for a run; each case gets its own context, page and clock. */
async function startUi(target: Target, browserName: BrowserName): Promise<UiRun> {
  const browser = await launch(browserName);
  return {
    async newContext() {
      const context = await contextFor(browser, target);
      const page = await context.newPage();
      const startMs = Date.now();
      let advancedMs = 0;
      await page.clock.install({ time: startMs });
      let current: Answer = { fail: "abort" };
      await page.route(`**${STATE_PATH}`, async (route) => {
        const now = current;
        if ("body" in now) {
          await route.fulfill({
            status: HTTP_OK,
            contentType: "application/json",
            headers: { "Cache-Control": "no-store" },
            body: JSON.stringify(now.body),
          });
        } else if (now.fail === "abort") {
          await route.abort("failed");
        } else if (now.fail === "redirect") {
          await route.fulfill({
            status: HTTP_FOUND,
            // biome-ignore lint/style/useNamingConvention: an HTTP header name.
            headers: { Location: "/cdn-cgi/access/login" },
          });
        } else {
          await route.fulfill({ status: now.fail, contentType: "application/json", body: "{}" });
        }
      });
      return {
        page,
        answer(next) {
          if ("body" in next) {
            expectSchema("state.schema.json", next.body);
          }
          current = next;
        },
        async open() {
          await page.goto(`${target.url}/`);
          for (let step = 0; step < REVEAL_STEPS; step += 1) {
            // The page drops the `loading` class from <html> once it has revealed itself.
            // biome-ignore lint/performance/noAwaitInLoops: each step looks, then moves the page clock on; the steps are ordered in time
            if ((await page.locator("html.loading").count()) === 0) {
              return;
            }
            await page.clock.runFor(REVEAL_STEP_MS);
            advancedMs += REVEAL_STEP_MS;
          }
          throw new Error("The page did not reveal itself within 6 s of page time.");
        },
        async advance(ms) {
          await page.clock.runFor(ms);
          advancedMs += ms;
        },
        example(name) {
          return shifted(exampleBody(name), (startMs + advancedMs) / MS_PER_SECOND);
        },
        now() {
          return (startMs + advancedMs) / MS_PER_SECOND;
        },
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
}

export type { BrowserName, Target, UiRun };
export { shifted, startUi };
