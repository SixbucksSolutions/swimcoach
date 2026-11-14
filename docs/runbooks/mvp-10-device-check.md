# MVP-10 device check

Terry runs every step on this page himself, on his iPhone 16 Pro, after MVP-10 A is deployed to
`swimcoach.sixbuckssolutions.workers.dev`. RFC 2119 keywords; the capitals are load-bearing. It takes
about ten minutes, plus the evening for step 8. A Claude session records the answers in
`contract/ux-ledger.md` as `manual: <what Terry saw>, 2026-11-<day>` and MUST NOT mark a row from
anything but his answer.

Already settled, so this page does not repeat them: the Access session is 7 days (Terry set it at
MVP-05), the home-screen icon exists (added 2026-11-13), and the page opens full-screen ("open as web
app") rather than inside Chrome.

## Before you start

The Lead posts a few `zz demo` milestones, including six cards and one red one, and stops them when you
finish. You do nothing for that step.

## The checks

1. **Remove the old icon.** Press and hold the swimcoach icon on the home screen, then choose Remove App,
   then Remove from Home Screen. iOS caches an icon's name when it is added, so the old label
   "(1)swimcoach·c..." stays until the icon is added again.
2. **Add it again.** In Chrome, open `https://swimcoach.sixbuckssolutions.workers.dev`. Sign in with the
   PIN if Access asks. Tap Share, then Add to Home Screen. **Check:** the suggested name is exactly
   `swimcoach`, and the preview icon is the swimcoach mark (three stacked boards with blue, amber and
   green bars) on the dark ground, not a screenshot of the page. Tap Add. **Check** the same icon on the
   home screen.
3. **Launch from the icon.** **Check:** it opens full-screen, with no Chrome address bar or toolbar.
4. **Sign in inside the app if asked.** The home-screen app keeps its own cookies, separate from Chrome
   (RESUME risk 8), so Access MAY ask for the PIN once more here. That is expected, once.
5. **Safe areas.** **Check:** the status line (wordmark, clock, health box, bell) sits fully below the
   Dynamic Island and the clock, and the dots at the bottom sit fully above the home indicator bar. Send
   a screenshot.
6. **Six cards.** With the demo board up, **check:** all six slots fit on one screen without scrolling,
   and the seventh card, if there is one, is reached by scrolling. Send a screenshot; the Lead measures
   the card area from it, which turns UX-144's "about 625 px" estimate into a measurement.
7. **Swipe and the chime.** Swipe left and right between displays; tap a dot; tap a card and use
   "‹ All projects". Then tap the bell to turn alerts on. When the Lead adds one new red card, **check:**
   you hear the two-tone chime and the page jumps to the all-projects display. No vibration: iOS has no
   vibration API.
8. **The evening.** Leave the app alone, then open it again from the icon at least four hours later.
   **Check:** it opens to the board without a sign-in page.

## When you are done

Tell the Lead "device check done" with the screenshots from steps 5 and 6 and any step that did not
match. A step that fails is a defect for MVP-10 A, not a reason to change the check.
