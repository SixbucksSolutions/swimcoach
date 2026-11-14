// Moving between displays and waiting for what Terry would wait for (MVP-11 A). Every look is on what
// is drawn: a Card's Title line, a display's heading, the lit dot by paint. No page key or attribute.
import { setTimeout as sleep } from "node:timers/promises";
import type { UiContext } from "../types.ts";
import { healthOf, litDotOf } from "./overview-probe.ts";
import { shown } from "./project-support.ts";

const STEP_MS = 50;
const STEP_PAGE_MS = 100;
const STAY_MS = 150;
const LIMIT_MS = 10_000;

/** Retries a look in real time until it holds; false if it never does within the limit. */
async function waitFor(look: () => Promise<boolean>, limitMs = LIMIT_MS): Promise<boolean> {
  for (let waited = 0; waited <= limitMs; waited += STEP_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows a real-time wait
    if (await look()) {
      return true;
    }
    await sleep(STEP_MS);
  }
  return false;
}

/**
 * Steps page time on until the Health box reads `label`. A page that is reloading or still loading has
 * nothing to read yet, so a failed look just means "not yet".
 */
async function untilLabel(ctx: UiContext, label: string): Promise<boolean> {
  return await waitFor(async () => {
    try {
      if ((await healthOf(ctx.page)).label === label) {
        return true;
      }
      await ctx.advance(STEP_PAGE_MS);
    } catch {
      // The page is between documents.
    }
    return false;
  });
}

/** The pattern for a text exactly. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}$`, "u");
}

/** Taps the Card whose Title line reads exactly `title`, as Terry would. */
async function tapCard(ctx: UiContext, title: string): Promise<void> {
  await ctx.page
    .locator("#pages .cards .pc")
    .filter({ has: ctx.page.locator(".nm b", { hasText: exactly(title) }) })
    .click();
}

/**
 * Waits until the display in view is this one and has stayed there: its heading reads `title` ("" for
 * the overview, which has none) and the lit dot, by paint, agrees. False if it never settles.
 */
async function viewing(ctx: UiContext, title: string): Promise<boolean> {
  return await waitFor(async () => {
    if (!(await viewingNow(ctx, title))) {
      return false;
    }
    await sleep(STAY_MS);
    return await viewingNow(ctx, title);
  });
}

/** One look: the heading in view reads `title`, and the lit dot is the overview's (first) or another. */
async function viewingNow(ctx: UiContext, title: string): Promise<boolean> {
  const lit = await litDotOf(ctx.page);
  if ((await shown(ctx.page)) !== title) {
    return false;
  }
  if (title === "") {
    return lit === 0;
  }
  return lit > 0;
}

export { exactly, tapCard, untilLabel, viewing, waitFor };
