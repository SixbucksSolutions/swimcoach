# T5 frozen interfaces

Written by the Lead on 2026-11-14, after Terry passed MVP-08, per relay rule 1 in
[`mvp-staffing-plan.md`](mvp-staffing-plan.md). RFC 2119 keywords; the capitals are load-bearing. Where
this page and `contract/` disagree, the contract wins.

**Base.** T5 starts from `main` = `mvp/integration` at the commit that adds this file (relay rule 8),
with no other branch, worktree or open pull request. Production runs `0cd8f69` (API `2026-11-14`, the
30 s poll, the 3/6 grid).

Every author works in its own git worktree on branch `t5/mvp-<NN>-<letter>` cut from `mvp/integration`,
opens a pull request into `mvp/integration`, and MUST NOT merge it (relay rule 7). Each author owns only
its listed files. `npm run check` MUST pass. Subagents run only where work runs in parallel or needs
independent review (relay rule 9): the Lead does the small single pieces itself.

## The Lead, before dispatch (one pull request)

- **Router** (`src/index.ts`, Lead-owned): `GET /manifest.webmanifest` and `GET /icons/<name>.png`
  (lowercase letters, digits and hyphens) go to `ASSETS`, like `/css/*` and `/js/*`. These are page
  assets, not API endpoints, so the API date stays `2026-11-14`. Router tests cover both and their 404s.
- **The UI suite's frozen shape** (`acceptance/ui/types.ts`, `harness.ts`, `run.ts`, `cases/index.ts`),
  below.

## MVP-10: phone and home screen

### MVP-10 A: page assets (Sonnet 5.5 / medium)

Owns `public/manifest.webmanifest`, `public/icons/`, the `<head>` of `public/index.html`, and tests.

- `<meta name="apple-mobile-web-app-title" content="swimcoach">` and a manifest whose `name` and
  `short_name` are `swimcoach`, `display` `standalone`, `start_url` `/`, `scope` `/`, and
  `background_color` and `theme_color` from the palette tokens in `docs/brand.md` section 5. This fixes
  the home-screen label "(1)swimcoach·c..." (RESUME, carried into MVP-10): iOS took the page title.
- Icons: `icons/touch-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, rendered from
  `design/logo/swimcoach.svg` with `mocks/tools/render-logo.py` (extend it if it lacks a size), never
  hand-drawn. The existing data-URI touch icon MAY stay or move to `/icons/touch-180.png`; one source.
- Safe areas: the status line and the dots MUST stay clear of the Dynamic Island and the home indicator
  in standalone mode (`env(safe-area-inset-*)`, already used in `base.css`). Prove it in Chrome with
  emulated insets; the real phone is MVP-10 B's checklist.
- Not in scope: the deferred "hero gap" and the 30 s poll are done; do not touch `poll.js`.

### MVP-10 B: the device checklist (the Lead)

Owns `docs/runbooks/mvp-10-device-check.md`: the steps Terry runs on his iPhone 16 Pro after MVP-10 A
deploys. Remove and re-add the home-screen icon (iOS caches the old label), launch from it, confirm
full-screen, the label "swimcoach", the session lasting the evening (Access is already 7 days), safe
areas, swipe, the chime after the first tap, and a screenshot with six cards so UX-144's 625 px card
area estimate becomes a measurement. Each result is recorded in the ledger as `manual: ...`.

## MVP-11: UI acceptance suite and UX ledger

### Decisions

- **Black-box, like the API suite.** The UI suite drives a real deployment over HTTPS through a
  browser and imports no MVP code (`src/`, `cli/`, `public/`), so V2 can run it unchanged. It lives in
  the existing `acceptance` package as `acceptance/ui/`, beside `acceptance/api/`, and MAY import the API
  suite's transport, config and guard to seed boards.
- **Browser: Playwright for Node, WebKit first.** Chrome on the iPhone runs on WebKit, so every check
  runs in Playwright's WebKit at 402 x 874 CSS px, device scale 3, `isMobile` and `hasTouch` on.
  Chromium (`channel: "chrome"`, the installed Chrome) is the fallback when WebKit cannot run a check,
  and such a check says so. `playwright` is pinned exactly in `acceptance/package.json`.
- **Access.** The browser context sends the Access service-token headers from the same config file as
  the API suite (`--config`, the `cli.json` shape). The secret never reaches stdout, stderr or a report.
- **The suite never writes to the server (Lead, before dispatch; this replaces a seeding design).** It
  loads the real page from the deployment and answers the page's own state polls through Playwright's
  request routing, with bodies that MUST match `contract/schemas/state.schema.json`; the API suite is
  what proves the server produces such bodies. So the UI suite is safe against production, needs no
  tiers, and several runs never collide on the shared test Worker's board. Time is Playwright's clock.
  OFFLINE and SIGN IN are answers too (abort, 401, 403, a redirect), never a broken Worker. WebKit
  refuses a scripted redirect, so a redirect answer runs only with `--browser chrome`; 401 and 403 are
  the WebKit sign-in cases (the page treats all three alike). The page clock is paused: page time moves
  only through `open()` and `advance()`. An answer the route cannot give fails the case.
- **Three ways to run:** `node acceptance/ui/run.ts --config <file>` (a deployment through Access),
  `--local public` (a local copy, no secret, for authors), and `--browser chrome` for the fallback.
  Authors develop with `--local`; the Lead and the reviewers run `--config` against `swimcoach-test`,
  and MVP-12 against production.
- **Ledger IDs are the contract.** Every check's id is the ledger row it proves (`"UX-058"`, or several).
  A check MUST NOT prove a row whose V1 cell reads `No: ...`. Superseded rows are proven through their
  successors.

### The frozen case format (`acceptance/ui/types.ts`, the Lead)

The code is the frozen text: `acceptance/ui/types.ts` (`UiCase { ids, title, run(ctx) }`; `UiContext`
with `page`, `answer(next)`, `open()`, `advance(ms)`, `example(name)` and `now()`). `harness.ts`
launches the browser and gives each case a fresh context and clock; `run.ts` refuses a case whose
ids name a superseded or unknown ledger row (`ledger.ts`); `cases/index.ts` joins the two case files
below. The Lead's one case, UX-162 (the empty board reads LIVE), passed in WebKit both `--local` and
`--config` against `swimcoach-test` before dispatch. First run on a machine:
`npx --prefix acceptance playwright install webkit`. The UI suite is not part of `npm run check`
(CI has no browser); every author and reviewer runs it with `--local` or `--config`.

### MVP-11 A: overview checks (Sonnet 5.5 / medium)

Owns `acceptance/ui/cases/overview.ts`: ledger areas A (status line), B (slot modes, now UX-141 to
UX-147), C (card colors, order, contents), D (GO TO KEYBOARD), E (card layout, clock hand), F
(breathing, now UX-157 and UX-160), I (no flicker, polling), K (alerts, where a browser can prove it),
and the overview rows of M.

### MVP-11 B: project display checks (Sonnet 5.5 / medium)

Owns `acceptance/ui/cases/project.ts`: ledger areas G (project display parts), H (swimlanes), J
(navigation), L (small-block mode, now UX-139, UX-140, UX-151, UX-155) and the display rows of M.

### MVP-11 C: the ledger (Sonnet 5.5 / medium)

Owns `contract/ux-ledger.md`'s Check column only (no row text, no V1 cell). For every row whose V1 cell
is `Pending`, it records `browser: <UiCase title>` for the check that proves it (from A's and B's
pull requests as they land; it merges last), or `manual: <what to observe>` for what a browser cannot
prove (the chime's sound, the real phone, iOS labels), which MVP-10 B's checklist and MVP-12 fill in.
A row with neither is a defect. It writes no checks.

**Merge order:** the Lead's pre-dispatch PR, then 10-A, 11-A and 11-B in any order, then 11-C.
**Reviewers (Opus 5.5 / high):** one for MVP-10, a technical and a visual reviewer for MVP-11.
