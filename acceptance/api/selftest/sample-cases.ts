// Three sample cases in the frozen format, written to prove the harness and nothing else. They are
// NOT the suite: MVP-09 B's cases live in ../cases/ and cover the contract. Ids start with
// SELFTEST so they can never be mistaken for an API-nnn ledger id.
import assert from "node:assert/strict";
import { loadFixture } from "../fixtures.ts";
import type { Case } from "../types.ts";

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
// Within the 7-day window the harness enforces, and early enough that the fixture ends before now.
const STARTED_AT = Math.floor(Date.now() / 1000) - 3 * SECONDS_PER_DAY;

const cases: Case[] = [
  {
    id: "SELFTEST-1",
    title: "healthz answers ok with no-store",
    tier: "clock-free",
    cites: "api.md 7",
    async run(h) {
      const reply = await h.request("GET", "/healthz");
      assert.equal(reply.status, 200);
      assert.match(reply.headers.get("cache-control") ?? "", /no-store/u);
      assert.deepEqual(reply.body, { ok: true });
    },
  },
  {
    id: "SELFTEST-2",
    title: "a report adds, a repeat does not, a stop removes",
    tier: "clock-free",
    cites: "api.md 4.4, 5",
    async run(h) {
      const body = {
        agent: "claude",
        project: h.project(),
        milestone: "S2",
        active_hours: 1,
        cap_hours: 4,
        lanes: {
          ready_for_work: 1,
          in_progress: 1,
          needs_terry: 0,
          ready_for_review: 0,
          completed: 1,
        },
      };
      try {
        const first = await h.report(body);
        assert.equal(first.status, 200);
        h.expectSchema("report.schema.json#/$defs/reportResponse", first.body);
        assert.equal((first.body as { added: boolean }).added, true);
        const second = await h.report(body);
        assert.equal((second.body as { added: boolean }).added, false);
      } finally {
        const stopped = await h.stop(h.project(), "S2");
        assert.equal(stopped.status, 200);
        h.expectSchema("report.schema.json#/$defs/stopResponse", stopped.body);
      }
      const again = await h.stop(h.project(), "S2");
      assert.equal(again.status, 404);
      h.expectSchema("report.schema.json#/$defs/errorResponse", again.body);
      await h.state();
    },
  },
  {
    id: "SELFTEST-3",
    title: "a fixture replays at its timed offsets",
    tier: "timed",
    cites: "contract/fixtures/README.md",
    async run(h) {
      const fixture = loadFixture("one-story");
      try {
        const last = await h.replay(fixture, h.project(), "S3", STARTED_AT);
        const lastSample = fixture.samples.at(-1);
        assert.ok(lastSample !== undefined);
        assert.ok(Math.abs(last - (STARTED_AT + lastSample.at_hours * SECONDS_PER_HOUR)) < 1e-6);
        await h.state(last);
      } finally {
        await h.stop(h.project(), "S3");
      }
    },
  },
];

export { cases };
