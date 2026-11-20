import { describe, expect, it, vi } from "vitest";
import { keepAwake } from "../../public/js/wakelock.js";

// Keeping the screen on (public/js/wakelock.js; localswim #0059; UX-212), against a stand-in
// navigator and document: whether a real phone grants the lock is a manual check on the phone.

type Visibility = "visible" | "hidden";

class FakeLock {
  released = false;
}

function stage(visibility: Visibility = "visible") {
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
  const locks: FakeLock[] = [];
  let refuse = false;
  const request = vi.fn(() => {
    if (refuse) {
      return Promise.reject(new DOMException("Refused", "NotAllowedError"));
    }
    const lock = new FakeLock();
    locks.push(lock);
    return Promise.resolve(lock);
  });
  const nav = { wakeLock: { request } };
  return {
    doc,
    request,
    locks,
    refuseFromNowOn(on: boolean) {
      refuse = on;
    },
    start() {
      return keepAwake(nav as unknown as Navigator, doc as unknown as Document);
    },
    show(state: Visibility) {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    tap() {
      doc.dispatchEvent(new Event("click"));
    },
    /** The browser drops every lock, as it does when the page leaves view. */
    dropLocks() {
      for (const lock of locks) {
        lock.released = true;
      }
    },
  };
}

/** Lets the request's promise settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

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

  it("asks once while a lock is held or a request is pending, however often it is nudged", async () => {
    const s = stage();
    s.start();
    s.tap(); // the first request is still pending
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
});
