// The harness against a local node:http stub: header stamping, redirect handling, the production
// refusals, the reset and cleanup, the replay engine and the assertion helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectClose } from "../compare.ts";
import { loadFixture } from "../fixtures.ts";
import { createHarness } from "../harness.ts";
import { formatAt } from "../transport.ts";
import { startStub } from "./stub.ts";
import { ID, RECENT, reportBody, SECRET, THREE_DAYS_AGO, withStub } from "./support.ts";

describe("request", () => {
  it("stamps the service token, the content type and the test clock", async () => {
    await withStub(true, "full", async (stub, h) => {
      await h.request("POST", "/api/2026-11-13/report", {
        body: reportBody(h.project()),
        at: RECENT + 0.25,
      });
      const [seen] = stub.requests;
      assert.equal(seen?.headers["cf-access-client-id"], ID);
      assert.equal(seen?.headers["cf-access-client-secret"], SECRET);
      assert.equal(seen?.headers["content-type"], "application/json");
      assert.equal(seen?.headers["swimcoach-test-now"], `${RECENT}.25`);
    });
  });

  it("sends no test clock header unless asked, and lets a header override a default", async () => {
    await withStub(true, "full", async (stub, h) => {
      await h.request("GET", "/healthz");
      await h.request("POST", "/api/2026-11-13/report", {
        body: reportBody(h.project()),
        headers: { "content-type": "text/plain" },
      });
      assert.equal(stub.requests[0]?.headers["swimcoach-test-now"], undefined);
      assert.equal(stub.requests[0]?.headers["content-type"], undefined);
      assert.equal(stub.requests[1]?.headers["content-type"], "text/plain");
    });
  });

  it("sends a raw body byte for byte, a byte order mark included", async () => {
    await withStub(true, "full", async (stub, h) => {
      const raw = new Uint8Array([
        0xef,
        0xbb,
        0xbf,
        ...new TextEncoder().encode(JSON.stringify(reportBody(h.project()))),
      ]);
      const reply = await h.request("POST", "/api/2026-11-13/report", { raw });
      assert.equal(reply.status, 200);
      assert.deepEqual([...(stub.requests[0]?.body ?? [])].slice(0, 3), [0xef, 0xbb, 0xbf]);
    });
  });

  it("never follows a redirect", async () => {
    await withStub(true, "full", async (stub, h) => {
      const reply = await h.request("GET", "/redirected");
      assert.equal(reply.status, 302);
      assert.equal(reply.headers.get("location"), "/followed");
      assert.deepEqual(
        stub.requests.map((entry) => entry.path),
        ["/redirected"],
      );
    });
  });

  it("sends no credentials for auth none and a wrong secret for bad-secret", async () => {
    await withStub(true, "full", async (stub, h) => {
      const none = await h.request("GET", "/healthz", { auth: "none" });
      assert.equal(none.status, 302);
      assert.equal(stub.requests[0]?.headers["cf-access-client-id"], undefined);
      const bad = await h.request("GET", "/healthz", { auth: "bad-secret" });
      assert.equal(bad.status, 403);
      assert.notEqual(stub.requests[1]?.headers["cf-access-client-secret"], SECRET);
      assert.equal(stub.requests[1]?.headers["cf-access-client-id"], ID);
    });
  });

  it("reports a connection failure without a header value", async () => {
    const h = createHarness({
      config: { url: "http://127.0.0.1:1", accessClientId: ID, accessClientSecret: SECRET },
      suite: "full",
    });
    await assert.rejects(h.request("GET", "/healthz"), (error: Error) => {
      assert.ok(!error.message.includes(SECRET));
      assert.match(error.message, /failed to complete/u);
      return true;
    });
  });

  it("fails, not skips, when a timed request meets test_clock_disabled", async () => {
    await withStub(false, "full", async (_stub, h) => {
      await assert.rejects(h.report(reportBody(h.project()), RECENT), /test_clock_disabled/u);
      await assert.rejects(h.reset(), /test_clock_disabled/u);
    });
  });

  it("refuses a test time older than 7 days or later than real time, sending nothing", async () => {
    await withStub(true, "full", async (stub, h) => {
      const now = Math.floor(Date.now() / 1000);
      await assert.rejects(
        h.report(reportBody(h.project()), now - 8 * 86_400),
        /outside the allowed/u,
      );
      await assert.rejects(h.report(reportBody(h.project()), now + 3600), /outside the allowed/u);
      assert.equal(stub.requests.length, 0);
      assert.equal((await h.report(reportBody(h.project()), now - 6 * 86_400)).status, 200);
    });
  });

  it("carries no raw error or header value when the secret is not a valid header value", async () => {
    const h = createHarness({
      config: {
        url: "http://127.0.0.1:1",
        accessClientId: ID,
        accessClientSecret: "bad\u0000secret",
      },
      suite: "full",
    });
    await assert.rejects(h.request("GET", "/healthz"), (error: Error) => {
      assert.equal(error.cause, undefined);
      assert.ok(!error.message.includes("bad"));
      return true;
    });
  });
});

describe("replay", () => {
  it("sends one report per sample, stamped startAt plus its offset, and returns the last", async () => {
    await withStub(true, "full", async (stub, h) => {
      const fixture = loadFixture("afternoon");
      const startAt = THREE_DAYS_AGO;
      const last = await h.replay(fixture, h.project(), "R1", startAt);
      const sent = stub.requests.filter((entry) => entry.path.endsWith("/report"));
      assert.equal(sent.length, fixture.samples.length);
      fixture.samples.forEach((sample, index) => {
        const body = JSON.parse(sent[index]?.body.toString("utf8") ?? "{}") as Record<
          string,
          unknown
        >;
        assert.equal(body.agent, "claude");
        assert.equal(body.cap_hours, fixture.cap_hours);
        assert.equal(body.active_hours, sample.active_hours);
        assert.deepEqual(body.lanes, sample.lanes);
        const stamp = Number(sent[index]?.headers["swimcoach-test-now"]);
        assert.ok(Math.abs(stamp - (startAt + sample.at_hours * 3600)) < 1e-6);
      });
      const lastSample = fixture.samples.at(-1);
      assert.ok(Math.abs(last - (startAt + (lastSample?.at_hours ?? 0) * 3600)) < 1e-9);
    });
  });
});

describe("state and the assertion helpers", () => {
  it("state returns a schema-valid body and rejects a reply that is not no-store", async () => {
    await withStub(true, "full", async (_stub, h) => {
      const body = (await h.state()) as { milestones: unknown[] };
      assert.deepEqual(body.milestones, []);
    });
    const stub = await startStub({ id: ID, secret: SECRET, testClock: true, noStore: false });
    try {
      const h = createHarness({
        config: { url: stub.url, accessClientId: ID, accessClientSecret: SECRET },
        suite: "full",
      });
      await assert.rejects(h.state(), /no-store/u);
    } finally {
      await stub.close();
    }
  });

  it("expectSchema accepts a valid body and names the failure of an invalid one", async () => {
    await withStub(true, "full", (_stub, h) => {
      h.expectSchema("report.schema.json#/$defs/stopRequest", { project: "a", milestone: "b" });
      assert.throws(() => {
        h.expectSchema("report.schema.json#/$defs/stopRequest", {
          project: " a",
          milestone: "b",
          extra: 1,
        });
      }, /stopRequest/u);
      assert.throws(() => {
        h.expectSchema("nothing.schema.json", {});
      }, /No schema/u);
      return Promise.resolve();
    });
  });

  it("expectClose allows 1e-9 on numbers and nothing on the rest", () => {
    expectClose(
      { a: 1, b: [0.5, null], c: "x", extra: true },
      { a: 1 + 5e-10, b: [0.5, null], c: "x" },
      "$",
    );
    assert.throws(() => {
      expectClose({ a: 1.000_001 }, { a: 1 }, "$");
    }, /\$\.a/u);
    assert.throws(() => {
      expectClose({ a: null }, { a: 0 }, "$");
    }, /\$\.a/u);
    assert.throws(() => {
      expectClose({ a: "1" }, { a: 1 }, "$");
    }, /\$\.a/u);
    assert.throws(() => {
      expectClose({}, { a: null }, "$");
    }, /missing/u);
  });

  it("formatAt keeps at most 6 fraction digits and refuses what the contract refuses", () => {
    assert.equal(formatAt(1_794_573_043), "1794573043");
    assert.equal(formatAt(1_794_573_043.1 + 0.2), "1794573043.3");
    assert.equal(formatAt(1_794_573_043.123_46), "1794573043.12346");
    assert.throws(() => formatAt(-1), RangeError);
    assert.throws(() => formatAt(Number.NaN), RangeError);
  });
});
