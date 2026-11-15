import type { CardView, View } from "../../public/js/view.js";

// View literals for the renderOverview tests (overview.test.ts, overview-done.test.ts).

/** A green ratio-mode card, with any field overridden. */
export function card(over: Partial<CardView> = {}): CardView {
  return {
    key: '["fga","t04"]',
    title: "fga t04",
    agent: "claude",
    level: "green",
    reason: "on_time",
    why: "On time",
    callWhy: "On time",
    needsMe: null,
    stale: false,
    silentSeconds: 30,
    mode: "ratio",
    tooEarly: false,
    rtr: 1.23,
    dir: 0,
    trend: { delta: 0, minutes: 30, proj: 5, recentDone: 2, toGo: 4 },
    chance: 0.9,
    marginSeconds: 3600,
    work: 0.5,
    clock: 0.4,
    finished: 5,
    total: 10,
    activeHours: 2,
    capHours: 5,
    lanes: { ready_for_work: 1, in_progress: 2, needs_terry: 0, ready_for_review: 5, completed: 0 },
    spark: [],
    updatedAt: 1_000_000,
    lastMoveAt: 1_000_000,
    ...over,
  };
}

/** A View holding the given cards. */
export function view(cards: CardView[]): View {
  return {
    now: 1_000_030,
    lastReportAt: 1_000_000,
    feed: "live",
    thresholds: { staleMinutes: 25, stallMinutes: 45, minHistoryMinutes: 20, minBlockUsed: 0.1 },
    cards,
    asking: cards.filter((c) => c.needsMe !== null).length,
  };
}

/** A card key for a project name, as the server builds one, already escaped for an attribute. */
export function keyOf(name: string): string {
  return JSON.stringify([name, "m1"]);
}
