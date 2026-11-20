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
  function take() {
    if (asking || doc.visibilityState !== "visible" || (held !== null && !held.released)) {
      return;
    }
    asking = true;
    locks
      .request("screen")
      .then(
        (lock) => {
          held = lock;
        },
        () => {
          // Refused: the phone locks on its own schedule; the next return to view or tap asks again.
        },
      )
      .finally(() => {
        asking = false;
      });
  }
  doc.addEventListener("visibilitychange", take);
  doc.addEventListener("click", take, { capture: true, passive: true });
  take();
  return true;
}
