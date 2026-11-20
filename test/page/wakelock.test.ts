import { describe, expect, it, vi } from "vitest";
import { keepAwake } from "../../public/js/wakelock.js";

// Keeping the screen on (public/js/wakelock.js; localswim #0059; UX-212), against a stand-in
// navigator and document: whether a real phone grants the lock is a manual check on the phone.

type Visibility = "visible" | "hidden";

class FakeLock extends EventTarget {
  released = false;
}

/** A request the test settles by hand: grant or refuse. */
interface Held {
  grant: () => void;
  refuse: () => void;
}

function stage(visibility: Visibility = "visible") {
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
  const locks: FakeLock[] = [];
  let refuse = false;
  let holdNext: ((held: Held) => void) | null = null;
  const request = vi.fn(() => {
    const lock = new FakeLock();
    if (holdNext !== null) {
      const hand = holdNext;
      holdNext = null;
      return new Promise<FakeLock>((resolve, reject) => {
        hand({
          grant() {
            locks.push(lock);
            resolve(lock);
          },
          refuse() {
            reject(new DOMException("Refused", "NotAllowedError"));
          },
        });
      });
    }
    if (refuse) {
      return Promise.reject(new DOMException("Refused", "NotAllowedError"));
    }
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
    /** The next request stays pending until the test grants or refuses it. */
    holdNextRequest(): Held {
      const held: Held = { grant: () => undefined, refuse: () => undefined };
      holdNext = (h) => {
        held.grant = h.grant;
        held.refuse = h.refuse;
      };
      return held;
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
        lock.dispatchEvent(new Event("release"));
      }
    },
    /** A browser that says it dropped the locks but never sets `released`. */
    dropLocksQuietly() {
      for (const lock of locks) {
        lock.dispatchEvent(new Event("release"));
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

  it("asks once while a lock is held or a request is pending, however often it is nudged", async () => {
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
