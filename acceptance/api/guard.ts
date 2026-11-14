// Production safety for the clock-free suite (t4-interfaces.md, MVP-09 "Production safety"). The
// clock-free tier MAY run against the real board, which Terry's phone shows, so it writes only
// projects named "zz acceptance ...", never sends needs_me, and never reports a Needs Terry card
// (a red card chimes and jumps his phone). The guard checks every write before it leaves.
import { isRecord, parseJson } from "./json.ts";
import type { Send } from "./types.ts";

/** Every project the suite creates starts with this, so nothing real shares a card with it. */
const PROJECT_PREFIX = "zz acceptance";
const TEST_CLOCK_HEADER = "swimcoach-test-now";
const UPPER_ASCII = /[A-Z]/gu;
const ASCII_CASE_OFFSET = 32;

/** ASCII-only lowercasing, the contract's comparison (api.md 4.3). */
function asciiLower(text: string): string {
  return text.replace(UPPER_ASCII, (letter) =>
    String.fromCharCode(letter.charCodeAt(0) + ASCII_CASE_OFFSET),
  );
}

function hasPrefix(project: string): boolean {
  return asciiLower(project).startsWith(PROJECT_PREFIX);
}

/** The JSON a write will carry, when it carries any that parses. */
function sentJson(send: Send): unknown {
  if (send.raw === undefined) {
    return send.body;
  }
  if (typeof send.raw === "string") {
    return parseJson(send.raw);
  }
  return parseJson(new TextDecoder().decode(send.raw));
}

/** Throws when one report or stop body breaks the production rules. */
function checkWriteBody(value: unknown): void {
  if (Array.isArray(value)) {
    for (const element of value) {
      checkWriteBody(element);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const { project, needs_me, lanes } = value;
  if (typeof project === "string" && !hasPrefix(project)) {
    throw new Error(
      `The clock-free suite refuses to write project "${project}": production names MUST start with "${PROJECT_PREFIX}".`,
    );
  }
  if (needs_me !== undefined) {
    throw new Error(
      "The clock-free suite refuses to send needs_me: a red card would chime on Terry's phone.",
    );
  }
  if (isRecord(lanes) && typeof lanes.needs_terry === "number" && lanes.needs_terry > 0) {
    throw new Error(
      "The clock-free suite refuses a needs_terry count above 0: a red card would chime on Terry's phone.",
    );
  }
}

/**
 * The clock-free tier's pre-flight on ANY request that carries a body. It keys on neither the
 * method nor the path: fetch upper-cases a method and the Worker ignores query strings, so
 * neither is a safe thing to hang a guard on.
 */
function checkClockFreeWrite(send: Send): void {
  checkWriteBody(sentJson(send));
}

/** Whether a request carries the test clock header by hand; header names compare ignoring case. */
function hasTestClockHeader(send: Send): boolean {
  return Object.keys(send.headers ?? {}).some((name) => name.toLowerCase() === TEST_CLOCK_HEADER);
}

export { checkClockFreeWrite, hasPrefix, hasTestClockHeader, PROJECT_PREFIX };
