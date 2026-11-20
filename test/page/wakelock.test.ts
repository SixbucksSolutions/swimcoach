import { describe, expect, it, vi } from "vitest";
import { keepAwake } from "../../public/js/wakelock.js";
import { settle, stage } from "./wakelock-stand-ins.ts";

// Keeping the screen on (public/js/wakelock.js; localswim #0059; UX-212, carried into UX-213), against
// a stand-in navigator and document: whether a real phone grants the lock is a manual check on the phone.

describe("the page keeps the screen on while it is in view (UX-212)", () => {
  it("does nothing, and says so, in a browser with no wake locks", () => {
    const doc = new EventTarget();
    const listen = vi.spyOn(doc, "addEventListener");
    expect(keepAwake({} as Navigator, doc as unknown as Document)).toBe(false);
    expect(listen).not.toHaveBeenCalled();
  });

  it("asks for a screen lock as soon as it starts in view", async () => {
    const s = stage();
    expect(s.start()).toBe(true);
    await settle();
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(s.request).toHaveBeenCalledWith("screen");
  });

  it("waits for the page to come into view when it starts hidden", async () => {
    const s = stage("hidden");
    s.start();
    await settle();
    expect(s.request).not.toHaveBeenCalled();
    s.show("visible");
    await settle();
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("asks once while a lock is held, however often it is nudged", async () => {
    const s = stage();
    s.start();
    await settle();
    s.tap();
    s.show("visible");
    await settle();
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("shrugs off a refusal and asks again on the next tap", async () => {
    const s = stage();
    s.refuseFromNowOn(true);
    s.start();
    await settle();
    expect(s.locks).toHaveLength(0);
    s.refuseFromNowOn(false);
    s.tap();
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.locks).toHaveLength(1);
  });
});

describe("the page takes the screen lock again when it has lost it (UX-212)", () => {
  it("takes the lock again each time the page returns to view after the browser dropped it", async () => {
    const s = stage();
    s.start();
    await settle();
    s.show("hidden");
    s.dropLocks();
    s.show("visible");
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
  });

  it("asks again when the page left and returned while a request was pending, and it was refused", async () => {
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    s.show("hidden");
    s.show("visible"); // the request is still pending, so this return to view is noted, not acted on
    first.refuse(); // refused, because the page was hidden when it was made
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.locks).toHaveLength(1);
  });

  it("asks once more at most after a pending request, so a phone that always refuses is not hammered", async () => {
    const s = stage();
    s.refuseFromNowOn(true);
    const first = s.holdNextRequest();
    s.start();
    s.tap();
    s.tap();
    first.refuse();
    await settle();
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
  });

  it("asks once when nudged during a pending request that is then granted", async () => {
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    s.tap();
    first.grant();
    await settle();
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("forgets a lock the browser says it dropped, even if it never marks it released", async () => {
    const s = stage();
    s.start();
    await settle();
    s.dropLocksQuietly();
    s.tap();
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
  });
});

describe("the page holds the screen lock only while it is in view (UX-212)", () => {
  it("does not ask while the page is hidden, even on a tap", async () => {
    const s = stage();
    s.start();
    await settle();
    s.show("hidden");
    s.dropLocks();
    s.tap();
    await settle();
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("forgets a lock granted after the page left view, once the browser drops it", async () => {
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    s.show("hidden");
    first.grant();
    await settle();
    s.dropLocks(); // the browser drops a lock the page no longer has a right to
    s.show("visible");
    await settle();
    expect(s.request).toHaveBeenCalledTimes(2);
  });
});
