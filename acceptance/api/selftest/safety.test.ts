// The clock-free guard, the test clock rules, the opening reset and the cleanup, against a stub.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LANES, RECENT, REPORT, reportBody, withStub } from "./support.ts";

const FOREIGN_WRITE = {
  body: reportBody("FGA", { needs_me: "x", lanes: { ...LANES, needs_terry: 3 } }),
};
describe("the clock-free guard inspects every request that carries a body", () => {
  it("refuses a lowercase method, a query string and another method, sending nothing", async () => {
    await withStub(false, "clock-free", async (stub, h) => {
      await assert.rejects(h.request("post", REPORT, FOREIGN_WRITE), /MUST start with/u);
      await assert.rejects(h.request("POST", `${REPORT}?x=1`, FOREIGN_WRITE), /MUST start with/u);
      await assert.rejects(h.request("PUT", REPORT, FOREIGN_WRITE), /MUST start with/u);
      await assert.rejects(h.request("PATCH", "/anything", FOREIGN_WRITE), /MUST start with/u);
      assert.equal(stub.requests.length, 0);
    });
  });
});

describe("a clock-free request that carries the test clock header", () => {
  it("passes when the deployment answers 400 test_clock_disabled, whatever the header's case", async () => {
    await withStub(false, "clock-free", async (stub, h) => {
      const reply = await h.request("GET", "/healthz", { headers: { "SWIMCOACH-test-now": "1" } });
      assert.equal(reply.status, 400);
      assert.equal(stub.requests.length, 1);
    });
  });

  it("fails the run when the deployment answers anything else", async () => {
    await withStub(true, "clock-free", async (_stub, h) => {
      await assert.rejects(
        h.request("GET", "/healthz", { headers: { "swimcoach-test-now": String(RECENT) } }),
        /not 400 test_clock_disabled/u,
      );
    });
  });
});

describe("production safety on the clock-free suite", () => {
  it("refuses a test time, a foreign project, needs_me and a Needs Terry card", async () => {
    await withStub(false, "clock-free", async (stub, h) => {
      await assert.rejects(h.report(reportBody(h.project()), RECENT), /Swimcoach-Test-Now/u);
      await assert.rejects(h.report(reportBody("FGA")), /MUST start with/u);
      await assert.rejects(h.stop("FGA", "M1"), /MUST start with/u);
      await assert.rejects(h.report(reportBody(h.project(), { needs_me: "Look" })), /needs_me/u);
      await assert.rejects(
        h.report(reportBody(h.project(), { lanes: { ...LANES, needs_terry: 1 } })),
        /needs_terry/u,
      );
      await assert.rejects(
        h.request("POST", "/api/2026-11-13/report", { raw: JSON.stringify(reportBody("FGA")) }),
        /MUST start with/u,
      );
      assert.equal(stub.requests.length, 0);
    });
  });

  it("lets a zz acceptance project through, whatever its case", async () => {
    await withStub(false, "clock-free", async (_stub, h) => {
      assert.equal((await h.report(reportBody(h.project()))).status, 200);
      assert.equal((await h.report(reportBody("ZZ ACCEPTANCE other"))).status, 200);
    });
  });

  it("never runs the opening reset, and cleanup stops only its own projects", async () => {
    const seeded = [
      ["FGA", "T04"],
      ["zz acceptance old", "S1"],
    ] as const;
    await withStub(
      false,
      "clock-free",
      async (stub, h) => {
        await assert.rejects(h.reset(), /MUST NOT run/u);
        await h.cleanup();
        assert.deepEqual(
          [...stub.tracked.values()].map((entry) => entry.project),
          ["FGA"],
        );
      },
      { seeded },
    );
  });
});

describe("the full suite's reset", () => {
  it("stops every listed milestone, then cleanup finds nothing left", async () => {
    await withStub(
      true,
      "full",
      async (stub, h) => {
        await h.reset();
        assert.equal(stub.tracked.size, 0);
        await h.report(reportBody(h.project()));
        await h.cleanup();
        assert.equal(stub.tracked.size, 0);
      },
      {
        seeded: [
          ["FGA", "T04"],
          ["localswim V2", "T06"],
        ],
      },
    );
  });
});

describe("the full suite's reset against a deployment without the test clock", () => {
  it("sends zero stop requests and leaves the seeded milestone alone", async () => {
    await withStub(
      false,
      "full",
      async (stub, h) => {
        await assert.rejects(h.reset(), /test_clock_disabled/u);
        assert.equal(stub.requests.filter((entry) => entry.path.endsWith("/stop")).length, 0);
        assert.deepEqual(
          [...stub.tracked.values()].map((entry) => entry.project),
          ["FGA"],
        );
      },
      { seeded: [["FGA", "T04"]] },
    );
  });
});

describe("cleanup", () => {
  it("attempts every stop even when one fails, then reports the failure", async () => {
    await withStub(
      true,
      "full",
      async (stub, h) => {
        await assert.rejects(h.cleanup(), /zz acceptance bad/u);
        assert.deepEqual(
          [...stub.tracked.values()].map((entry) => entry.project),
          ["zz acceptance bad"],
        );
      },
      {
        seeded: [
          ["zz acceptance bad", "S1"],
          ["zz acceptance good", "S1"],
        ],
        failStopFor: "zz acceptance bad",
      },
    );
  });
});
