// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// Clock-free cases for authentication (api.md 2) and /healthz (api.md 7).
import assert from "node:assert/strict";
import type { Case, Harness, Send } from "../types.ts";
import {
  eachSeries,
  expectJson,
  expectNoStore,
  findMilestone,
  isAuthFailure,
  REPORT_PATH,
  reportBody,
  STATE_PATH,
  STOP_PATH,
  stateOf,
} from "./helpers.ts";

const NO_ACCESS = ["none", "bad-secret"] as const;

async function expectRefused(
  h: Harness,
  method: string,
  path: string,
  auth: "none" | "bad-secret",
): Promise<void> {
  const send: Send = { auth };
  if (method === "POST") {
    send.body = reportBody(h.project(), "auth probe");
  }
  const reply = await h.request(method, path, send);
  assert.ok(
    isAuthFailure(reply),
    `${method} ${path} with auth "${auth}": expected 401, 403 or a redirect with a Location, got ${reply.status}`,
  );
  assert.notEqual(reply.status, 200, `${method} ${path} with auth "${auth}" MUST NOT succeed`);
}

export const accessCases: Case[] = [
  {
    id: "API-001",
    title: "Without credentials, /healthz is an authentication failure, not a 200",
    tier: "clock-free",
    cites: "api.md 2, 7: no route is public, /healthz included",
    async run(h) {
      const reply = await h.request("GET", "/healthz", { auth: "none" });
      assert.ok(
        isAuthFailure(reply),
        `expected 401, 403 or a redirect with a Location, got ${reply.status}`,
      );
    },
  },
  {
    id: "API-002",
    title: "Without credentials, every route is refused: the page, the state, a report and a stop",
    tier: "clock-free",
    cites: "api.md 2: every request to the host MUST be authenticated",
    async run(h) {
      await expectRefused(h, "GET", "/", "none");
      await expectRefused(h, "GET", STATE_PATH, "none");
      await expectRefused(h, "POST", REPORT_PATH, "none");
      await expectRefused(h, "POST", STOP_PATH, "none");
    },
  },
  {
    id: "API-003",
    title: "Without credentials, an unknown path is refused before it can be a 404",
    tier: "clock-free",
    cites: "api.md 2: Access is in front of every path, so a 404 would mean the path leaked",
    async run(h) {
      await eachSeries(["/no-such-path", "/api/report", "/index.html"], async (path) => {
        await expectRefused(h, "GET", path, "none");
      });
    },
  },
  {
    id: "API-004",
    title:
      "With a wrong service-token secret, /healthz, the state, a report and a stop are refused",
    tier: "clock-free",
    cites: "api.md 2: a bad service token is an authentication failure",
    async run(h) {
      await expectRefused(h, "GET", "/healthz", "bad-secret");
      await expectRefused(h, "GET", STATE_PATH, "bad-secret");
      await expectRefused(h, "POST", REPORT_PATH, "bad-secret");
      await expectRefused(h, "POST", STOP_PATH, "bad-secret");
    },
  },
  {
    id: "API-005",
    title: "A report refused for its credentials stores nothing",
    tier: "clock-free",
    cites:
      "api.md 2, 4.2: authentication is the first check, and a refused request changes nothing",
    async run(h) {
      const project = h.project();
      try {
        await eachSeries(NO_ACCESS, async (auth) => {
          const refused = await h.request("POST", REPORT_PATH, {
            auth,
            body: reportBody(project, `refused ${auth}`),
          });
          assert.ok(isAuthFailure(refused), `auth "${auth}": got ${refused.status}`);
          const state = await stateOf(h);
          assert.equal(
            findMilestone(state, project, `refused ${auth}`),
            undefined,
            `auth "${auth}": a refused report left a milestone on the board`,
          );
        });
      } finally {
        // Only a defect leaves anything to stop here; the stop is harmless otherwise.
        await eachSeries(NO_ACCESS, async (auth) => {
          await h.stop(project, `refused ${auth}`);
        });
      }
    },
  },
  {
    id: "API-006",
    title: "GET /healthz answers 200 {ok: true}, JSON, no-store, and ignores a query string",
    tier: "clock-free",
    cites:
      "api.md 1, 7: liveness; responses MUST carry Cache-Control: no-store; query parameters MUST be ignored",
    async run(h) {
      // biome-ignore lint/security/noSecrets: a URL path with a query string, not a secret.
      await eachSeries(["/healthz", "/healthz?probe=1&since=0"], async (path) => {
        const reply = await h.request("GET", path);
        assert.equal(reply.status, 200, `${path}: status`);
        assert.deepEqual(reply.body, { ok: true }, `${path}: body`);
        expectJson(reply, path);
        expectNoStore(reply, path);
      });
    },
  },
];
