// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: one case that sends the same refusal five ways for each of seven header values.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// The one clock-free case that only a production deployment can pass (api.md 9).
import assert from "node:assert/strict";
import type { Case, Harness } from "../types.ts";
import {
  CLOCK_HEADER,
  eachSeries,
  expectError,
  findMilestone,
  REPORT_PATH,
  reportBody,
  STATE_PATH,
  STOP_PATH,
  stateOf,
} from "./helpers.ts";

/** Well-formed and malformed values alike: production refuses the header, whatever it holds. */
const VALUES = ["1794573043", "1794573043.25", "0", "abc", "-1", "1e9", "1794573043.1234567"];

interface Refusal {
  what: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  raw?: string;
}

async function expectRefused(h: Harness, refusal: Refusal): Promise<void> {
  const { what, method, path, ...send } = refusal;
  const reply = await h.request(method, path, send);
  expectError(h, reply, 400, "test_clock_disabled", what);
}

export const productionCases: Case[] = [
  {
    id: "API-080",
    title:
      "Without the test clock, Swimcoach-Test-Now is 400 test_clock_disabled and changes nothing",
    tier: "clock-free",
    cites:
      "api.md 9, 4.2: production MUST refuse the header; the check follows path and method, and precedes Content-Type and the body",
    async run(h) {
      if (h.suite === "full") {
        // The full tier runs against a deployment whose test clock is on, where this refusal is
        // exactly what MUST NOT happen. The harness fails the run, rather than skipping it, when
        // such a deployment answers 400 test_clock_disabled (t4-interfaces.md, "Tiers").
        return;
      }
      const project = h.project();
      const body = reportBody(project, "clock header");
      const stop = { project, milestone: "clock header" };
      try {
        await eachSeries(VALUES, async (value) => {
          const label = `${CLOCK_HEADER}: ${value}`;
          const header = { [CLOCK_HEADER]: value };
          await expectRefused(h, {
            what: `GET state, ${label}`,
            method: "GET",
            path: STATE_PATH,
            headers: header,
          });
          await expectRefused(h, {
            what: `POST report, ${label}`,
            method: "POST",
            path: REPORT_PATH,
            body,
            headers: header,
          });
          await expectRefused(h, {
            what: `POST stop, ${label}`,
            method: "POST",
            path: STOP_PATH,
            body: stop,
            headers: header,
          });
          await expectRefused(h, {
            what: `text/plain report (400 before 415), ${label}`,
            method: "POST",
            path: REPORT_PATH,
            body,
            headers: { ...header, "Content-Type": "text/plain" },
          });
          await expectRefused(h, {
            what: `unparseable report (400 before invalid_json), ${label}`,
            method: "POST",
            path: REPORT_PATH,
            raw: "{",
            headers: header,
          });
        });
        const headers = { [CLOCK_HEADER]: "1794573043" };
        expectError(
          h,
          await h.request("GET", "/api/2026-11-13/nope", { headers }),
          404,
          "not_found",
          "unknown path with the header (404 first)",
        );
        expectError(
          h,
          await h.request("GET", REPORT_PATH, { headers }),
          405,
          "method_not_allowed",
          "wrong method with the header (405 first)",
        );
        assert.equal(
          findMilestone(await stateOf(h), project, "clock header"),
          undefined,
          "a report carrying the header was stored anyway",
        );
      } finally {
        await h.stop(project, "clock header");
      }
    },
  },
];
