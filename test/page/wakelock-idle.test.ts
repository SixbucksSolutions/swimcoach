import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_MS } from "../../public/js/wakelock.js";
import { stage } from "./wakelock-stand-ins.ts";

// The 30-minute cap on keeping the screen on (public/js/wakelock.js; localswim #0060; UX-213): a page
// nobody touches lets the phone lock, so an OLED screen is not lit for hours.

const MINUTE = 60 * 1000;

describe("the page lets the screen lock after 30 minutes with no touch (UX-213)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the lock for 30 minutes untouched, then lets it go and does not ask again", async () => {
    vi.useFakeTimers();
    const s = stage();
    s.start();
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(s.locks[0]?.released).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.locks[0]?.released).toBe(true);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(s.request).toHaveBeenCalledTimes(1);
  });

  it("starts the 30 minutes again on a tap, a swipe, a key press or a return to view", async () => {
    vi.useFakeTimers();
    const s = stage();
    s.start();
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    s.tap();
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    s.swipe();
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    s.press();
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    s.show("visible");
    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    expect(s.locks[0]?.released).toBe(false);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(s.locks[0]?.released).toBe(true);
  });
});

describe("the page takes the screen lock again only on a touch after it let go (UX-213)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes the lock again on the first touch after it let go", async () => {
    vi.useFakeTimers();
    const s = stage();
    s.start();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    s.tap();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.locks[1]?.released).toBe(false);
  });

  it("lets go at once of a lock granted after the 30 minutes ran out", async () => {
    vi.useFakeTimers();
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    first.grant();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.locks[0]?.released).toBe(true);
  });

  it("asks again on the next tap after a lock granted late was let go", async () => {
    vi.useFakeTimers();
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    first.grant();
    await vi.advanceTimersByTimeAsync(0);
    s.tap();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.request).toHaveBeenCalledTimes(2);
    expect(s.locks[1]?.released).toBe(false);
  });

  it("does not ask again on its own when a request pending at 30 minutes is refused", async () => {
    vi.useFakeTimers();
    const s = stage();
    const first = s.holdNextRequest();
    s.start();
    s.tap(); // a nudge while pending, which would otherwise earn one more ask
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    first.refuse();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(s.request).toHaveBeenCalledTimes(1);
  });
});
