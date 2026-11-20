// Stand-ins for the wake-lock tests (wakelock.test.ts, wakelock-idle.test.ts): a document whose
// visibility the test sets, and a wake lock service that grants, refuses or holds each request.
import { vi } from "vitest";
import { keepAwake } from "../../public/js/wakelock.js";

type Visibility = "visible" | "hidden";

class FakeLock extends EventTarget {
  released = false;

  release(): Promise<void> {
    this.drop();
    return Promise.resolve();
  }

  /** The browser drops the lock, as it does when the page leaves view. */
  drop(): void {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

/** A request the test settles by hand: grant or refuse. */
interface Held {
  grant: () => void;
  refuse: () => void;
}

/** The browser's wake lock service: grants every request unless told to refuse or to hold one. */
function fakeWakeLock() {
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
  return {
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
  };
}

export function stage(visibility: Visibility = "visible") {
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
  const service = fakeWakeLock();
  const nav = { wakeLock: { request: service.request } };
  return {
    ...service,
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
    swipe() {
      doc.dispatchEvent(new Event("pointerdown"));
    },
    /** The browser drops every lock, as it does when the page leaves view. */
    dropLocks() {
      for (const lock of service.locks) {
        lock.drop();
      }
    },
    /** A browser that says it dropped the locks but never sets `released`. */
    dropLocksQuietly() {
      for (const lock of service.locks) {
        lock.dispatchEvent(new Event("release"));
      }
    },
  };
}

/** Lets the request's promise settle. */
export function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
