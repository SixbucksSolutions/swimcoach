// biome-ignore-all lint/suspicious/noMisplacedAssertion: the cases' run() bodies assert, and the harness registers each run() as a node:test test.
// Clock-free cases for routing (api.md 1, 3, 8): 404, 405 with Allow, query strings, no-store.
import assert from "node:assert/strict";
import type { Case, Harness, Send } from "../types.ts";
import {
  eachSeries,
  expectError,
  expectJson,
  expectNoStore,
  expectReported,
  findMilestone,
  REPORT_PATH,
  reportBody,
  SCHEMA,
  STATE_PATH,
  STOP_PATH,
  stateOf,
  tracker,
} from "./helpers.ts";

/** A GET carries no body; any other method carries an empty object, so it is refused on its path alone. */
function sendFor(method: string): Send {
  if (method === "GET") {
    return {};
  }
  return { body: {} };
}

async function expectNotFound(h: Harness, method: string, paths: readonly string[]): Promise<void> {
  await eachSeries(paths, async (path) => {
    const reply = await h.request(method, path, sendFor(method));
    expectError(h, reply, 404, "not_found", `${method} ${path}`);
    if (path.startsWith("/api/")) {
      expectNoStore(reply, `${method} ${path}`);
    }
  });
}

function allowed(reply: { headers: Headers }): string[] {
  return (reply.headers.get("allow") ?? "")
    .split(",")
    .map((method) => method.trim().toUpperCase())
    .filter((method) => method !== "");
}

async function expectMethodNotAllowed(
  h: Harness,
  path: string,
  methods: readonly string[],
  mustAllow: string,
): Promise<void> {
  await eachSeries(methods, async (method) => {
    const reply = await h.request(method, path, sendFor(method));
    const label = `${method} ${path}`;
    expectError(h, reply, 405, "method_not_allowed", label);
    assert.ok(
      allowed(reply).includes(mustAllow),
      `${label}: Allow is "${reply.headers.get("allow")}", want ${mustAllow}`,
    );
    assert.ok(!allowed(reply).includes(method), `${label}: Allow lists the refused method`);
    if (path.startsWith("/api/")) {
      expectNoStore(reply, label);
    }
  });
}

export const routingCases: Case[] = [
  {
    id: "API-010",
    title: "Unversioned /api paths are not aliases: 404 not_found",
    tier: "clock-free",
    cites: "api.md 3 Versioning: /api/report, /api/stop and /api/state MUST get 404",
    async run(h) {
      await expectNotFound(h, "GET", ["/api/state", "/api/report", "/api/stop", "/api", "/api/"]);
      await expectNotFound(h, "POST", ["/api/report", "/api/stop"]);
    },
  },
  {
    id: "API-011",
    title:
      "A date the server does not serve, and an unknown name under the served date, are 404 not_found",
    tier: "clock-free",
    cites:
      "api.md 3 Versioning: any date the server does not serve MUST get 404; any other path 404",
    async run(h) {
      await expectNotFound(h, "GET", [
        "/api/2026-11-13/state",
        "/api/2026-11-15/state",
        "/api/2025-11-14/state",
        "/api/v1/state",
        "/api/2026-11-14",
        "/api/2026-11-14/",
        "/api/2026-11-14/nope",
        "/api/2026-11-14/state/extra",
        "/nope",
        "/healthz/extra",
      ]);
      await expectNotFound(h, "POST", [
        "/api/2026-11-13/report",
        "/api/2026-11-13/stop",
        "/api/2026-11-15/report",
        "/api/2026-11-14/create",
      ]);
    },
  },
  {
    id: "API-012",
    title: "Paths are exact: no trailing-slash variant of a route",
    tier: "clock-free",
    cites: "api.md 1: no trailing-slash variants",
    async run(h) {
      await expectNotFound(h, "GET", ["/api/2026-11-14/state/", "/healthz/"]);
      await expectNotFound(h, "POST", ["/api/2026-11-14/report/", "/api/2026-11-14/stop/"]);
    },
  },
  {
    id: "API-013",
    title: "Paths are exact: /index.html is not an alias of the page",
    tier: "clock-free",
    cites: "api.md 1: no /index.html alias",
    async run(h) {
      await expectNotFound(h, "GET", ["/index.html"]);
    },
  },
  {
    id: "API-014",
    title: "A known path with the wrong method is 405 method_not_allowed with an Allow header",
    tier: "clock-free",
    cites: "api.md 3, 8: any other method on these paths MUST get 405 with an Allow header",
    async run(h) {
      await expectMethodNotAllowed(h, REPORT_PATH, ["GET", "PUT", "DELETE", "PATCH"], "POST");
      await expectMethodNotAllowed(h, STOP_PATH, ["GET", "PUT", "DELETE", "PATCH"], "POST");
      await expectMethodNotAllowed(h, STATE_PATH, ["POST", "PUT", "DELETE", "PATCH"], "GET");
      await expectMethodNotAllowed(h, "/healthz", ["POST", "PUT", "DELETE"], "GET");
    },
  },
  {
    id: "API-015",
    title: "Query parameters are ignored on every route, including the old ?since=",
    tier: "clock-free",
    cites: "api.md 1, 6.9: query parameters MUST be ignored; ?since= filters nothing",
    async run(h) {
      const project = h.project();
      try {
        const added = await h.request("POST", `${REPORT_PATH}?since=0&dry_run=1&project=other`, {
          body: reportBody(project, "query ignored"),
        });
        const response = expectReported(h, added, "report with a query string");
        assert.equal(response.added, true, "the query string changed what the report did");
        assert.equal(response.project, project, "a project= parameter replaced the body's project");
        const future = await h.request("GET", `${STATE_PATH}?since=9999999999999&x=1`);
        assert.equal(future.status, 200, "state with ?since= in the far future");
        h.expectSchema("state.schema.json", future.body);
        const listed = (future.body as { milestones: { project: string; milestone: string }[] })
          .milestones;
        assert.ok(
          listed.some((entry) => entry.project === project && entry.milestone === "query ignored"),
          "?since= filtered the milestone out",
        );
        const stopped = await h.request("POST", `${STOP_PATH}?force=0`, {
          body: { project, milestone: "query ignored" },
        });
        assert.equal(stopped.status, 200, "stop with a query string");
        h.expectSchema(SCHEMA.stop, stopped.body);
        assert.equal(
          findMilestone(await stateOf(h), project, "query ignored"),
          undefined,
          "stop left the milestone",
        );
      } finally {
        await h.stop(project, "query ignored");
      }
    },
  },
  {
    id: "API-016",
    title:
      "Every /api reply carries Cache-Control: no-store: success, 400, 404, 405, 413 and 415 alike",
    tier: "clock-free",
    cites: "api.md 1: responses from /api/* and /healthz MUST carry Cache-Control: no-store",
    async run(h) {
      const t = tracker(h);
      const project = h.project();
      const body = reportBody(project, "no-store");
      try {
        const replies = [
          ["POST report 200", await t.send(body)],
          ["POST report 400 invalid_json", await h.request("POST", REPORT_PATH, { raw: "{" })],
          ["POST report 400 invalid_report", await h.request("POST", REPORT_PATH, { body: {} })],
          [
            "POST report 415",
            await h.request("POST", REPORT_PATH, {
              body,
              headers: { "Content-Type": "text/plain" },
            }),
          ],
          ["POST report 413", await h.request("POST", REPORT_PATH, { raw: "x".repeat(20_000) })],
          ["GET state 200", await h.request("GET", STATE_PATH)],
          [
            "POST stop 200",
            await h.request("POST", STOP_PATH, { body: { project, milestone: "no-store" } }),
          ],
          [
            "POST stop 404 not_tracked",
            await h.request("POST", STOP_PATH, { body: { project, milestone: "no-store" } }),
          ],
          ["POST stop 400 invalid_stop", await h.request("POST", STOP_PATH, { body: {} })],
          ["GET report 405", await h.request("GET", REPORT_PATH)],
          ["GET unversioned 404", await h.request("GET", "/api/state")],
        ] as const;
        const expected = [200, 400, 400, 415, 413, 200, 200, 404, 400, 405, 404];
        replies.forEach(([label, reply], index) => {
          assert.equal(reply.status, expected[index], `${label}: status`);
          expectNoStore(reply, label);
          expectJson(reply, label);
        });
      } finally {
        await t.cleanup();
      }
    },
  },
];
