// @ts-check
// Keeping the screen on (localswim #0059, #0060; UX-213): while the page is in view and has been
// touched in the last 30 minutes, it holds a screen wake lock, so the phone does not dim or lock
// however short its Auto-Lock is. After 30 minutes with no touch it lets the lock go, so an OLED
// screen is not left lit for hours by a page nobody is looking at; the phone then locks on its own
// schedule. A touch or a return to view starts the 30 minutes again.
//
// The browser drops the lock whenever the page leaves view, so the page takes it again each time it
// returns, and on a tap, which covers a browser that grants it only after a tap. A browser that lacks
// wake locks or refuses one (iOS Low Power Mode, for one) gets the page unchanged and no message.

/** How long the page keeps the screen on with no touch (the agent's call, delegated by Terry, #0060). */
const IDLE_MS = 30 * 60 * 1000;

/** The lock, the request in flight, and the 30 minutes. */
class ScreenHold {
  /**
   * @param {WakeLock} locks
   * @param {Document} doc
   */
  constructor(locks, doc) {
    this.locks = locks;
    this.doc = doc;
    /** @type {WakeLockSentinel|null} */
    this.held = null;
    this.asking = false;
    // A nudge that came while a request was pending. A request made just before the page left view
    // is refused, and the return to view that followed found it still pending, so ask once more.
    this.missed = false;
    // True from 30 minutes after the last touch until the next touch or return to view.
    this.resting = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    this.idle = undefined;
  }

  /** A touch or a return to view: start the 30 minutes again and hold the screen on. */
  nudge() {
    this.resting = false;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.rest();
    }, IDLE_MS);
    this.take();
  }

  /** 30 minutes with no touch: let the lock go and let the phone lock on its own. */
  rest() {
    this.resting = true;
    const lock = this.held;
    this.held = null;
    lock?.release().catch(() => undefined);
  }

  take() {
    const { held } = this;
    if (
      this.resting ||
      this.doc.visibilityState !== "visible" ||
      (held !== null && !held.released)
    ) {
      return;
    }
    if (this.asking) {
      this.missed = true;
      return;
    }
    this.asking = true;
    this.missed = false;
    this.locks
      .request("screen")
      .then(
        (lock) => {
          this.keep(lock);
        },
        () => {
          // Refused: the phone locks on its own schedule; the next return to view or tap asks again.
        },
      )
      .finally(() => {
        this.asking = false;
        if (this.missed) {
          this.missed = false;
          this.take();
        }
      });
  }

  /** @param {WakeLockSentinel} lock */
  keep(lock) {
    if (this.resting) {
      lock.release().catch(() => undefined);
      return;
    }
    this.held = lock;
    // The browser says when it drops the lock; `released` alone would leave a stale lock held if a
    // browser ever dropped one without setting it.
    lock.addEventListener("release", () => {
      if (this.held === lock) {
        this.held = null;
      }
    });
  }
}

/**
 * Holds a screen wake lock while the page is visible and recently touched, for the life of the page.
 * @param {Navigator} nav
 * @param {Document} doc
 * @returns {boolean}   whether the browser offers wake locks at all
 */
export function keepAwake(nav, doc) {
  const locks = /** @type {WakeLock|undefined} */ (nav.wakeLock);
  if (locks === undefined) {
    return false;
  }
  const hold = new ScreenHold(locks, doc);
  function nudge() {
    hold.nudge();
  }
  const quietly = { capture: true, passive: true };
  doc.addEventListener("visibilitychange", nudge);
  doc.addEventListener("pointerdown", nudge, quietly); // a swipe is a touch too
  doc.addEventListener("click", nudge, quietly); // a tap grants the browser's user activation
  nudge();
  return true;
}

export { IDLE_MS };
