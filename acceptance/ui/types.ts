// The frozen case format of the black-box UI acceptance suite (MVP-11). Written by the Lead before
// dispatch, exactly as docs/planning/t5-interfaces.md gives it; a change is a re-freeze, not an edit.
// The suite MUST NOT import from src/, cli/, test/ or public/ (biome.jsonc enforces it).
import type { Page } from "playwright";

/** What the page's next state poll gets: a body (schema-checked), or a failure. */
export type Answer =
  | { readonly body: unknown } // 200 with this JSON body; it MUST match state.schema.json
  | { readonly fail: "abort" | 401 | 403 | "redirect" | 500 };

export interface UiContext {
  /** The page at 402 x 874 CSS px, device scale 3, mobile and touch on, Playwright's clock installed. */
  readonly page: Page;
  /** Answers every later state poll with this, until the next call. Call it before open(). */
  answer: (next: Answer) => void;
  /** Loads "/" and waits until the page has revealed itself (the first poll drawn). */
  open: () => Promise<void>;
  /** Moves the page's clock on by ms, running its timers (polls, the status clock, animations). */
  advance: (ms: number) => Promise<void>;
  /** A contract example (contract/schemas/examples/state.<name>.json) with every time moved so its
   * `now` is the page clock's now, as mocks/tools/render-page.py does. */
  example: (name: string) => Record<string, unknown>;
  /** The page clock's now, in epoch seconds. */
  now: () => number;
}

export interface UiCase {
  /** The UX ledger rows this case proves, such as ["UX-058", "UX-059"]. Every row MUST be live (its
   * V1 cell reads Pending). */
  readonly ids: readonly string[];
  readonly title: string;
  run: (ctx: UiContext) => Promise<void>; // throws (node:assert) on failure
}
