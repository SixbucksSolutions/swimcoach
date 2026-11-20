// @ts-check
// Keeping the screen on (localswim #0059; UX-212): while the page is in view it holds a screen wake
// lock, so the phone does not dim or lock however short its Auto-Lock is. The browser drops the lock
// whenever the page leaves view, so the page takes it again each time it returns, and on a tap, which
// covers a browser that grants it only after a tap. A browser that lacks wake locks or refuses one
// (iOS Low Power Mode, for one) gets the page unchanged and no message: the phone then locks on its
// own schedule, as before.

/**
 * Holds a screen wake lock while the page is visible, for the life of the page.
 * @param {Navigator} nav
 * @param {Document} doc
 * @returns {boolean}   whether the browser offers wake locks at all
 */
export function keepAwake(nav, doc) {
  const offered = /** @type {WakeLock|undefined} */ (nav.wakeLock);
  if (offered === undefined) {
    return false;
  }
  const locks = offered;
  /** @type {WakeLockSentinel|null} */
  let held = null;
  let asking = false;
  // A nudge that came while a request was pending. A request made just before the page left view is
  // refused, and the return to view that followed found it still pending, so ask once more.
  let missed = false;

  /** @param {WakeLockSentinel} lock */
  function keep(lock) {
    held = lock;
    // The browser says when it drops the lock; `released` alone would leave a stale lock held if a
    // browser ever dropped one without setting it.
    lock.addEventListener("release", () => {
      if (held === lock) {
        held = null;
      }
    });
  }

  function take() {
    if (doc.visibilityState !== "visible" || (held !== null && !held.released)) {
      return;
    }
    if (asking) {
      missed = true;
      return;
    }
    asking = true;
    missed = false;
    locks
      .request("screen")
      .then(keep, () => {
        // Refused: the phone locks on its own schedule; the next return to view or tap asks again.
      })
      .finally(() => {
        asking = false;
        if (missed) {
          missed = false;
          take();
        }
      });
  }

  doc.addEventListener("visibilitychange", take);
  doc.addEventListener("click", take, { capture: true, passive: true });
  take();
  return true;
}
