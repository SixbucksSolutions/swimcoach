# T4 frozen interfaces

Drafted by the Lead's deputy and adopted by the Lead on 2026-11-13, per relay rule 1 in
[`mvp-staffing-plan.md`](mvp-staffing-plan.md). RFC 2119 keywords; the capitals are load-bearing.

**Terry's decisions, 2026-11-13** (they replace the "default until Terry decides" notes below):

1. **Test Worker: approved.** The Lead creates `swimcoach-test` (option (a) at the end of this page) and
   Terry enables Access on it.
2. **Budget words (UX-133):** `over_budget` shows "Over budget", `under_budget` shows "Under budget".
3. **Completed (UX-093, UX-094): never shown as a Swimlanes row.** Terry: "Never show completed; usually
   has a few hundred tickets." Completed cards still count as finished in every metric; they only get no
   row. Swimlanes shows Ready For Work, In Progress, Needs Terry (hidden when empty) and Ready For Review.
   In practice Completed is 0 for every milestone on the board: Terry, "By the time tickets move to
   Completed the project agent will have deleted that work increment" and "That means I've closed the
   milestone and starting a new one." So a card finishes in Ready For Review (all cards there shows the
   done card), Terry approves, the agent runs `stop`, and its first report for the next milestone adds
   a fresh card. The report keeps its required `completed` lane; agents send 0.
4. **Small-block project display (UX-134):** drop the RTR parts (no hero RTR, no RTR chart, no
   projection tiles); keep Work against time, Swimlanes and the footer, with the card's `why` as the hero.
5. **The desktop column** keeps the draft's default below.
Where this page and `contract/` disagree, the contract wins. Line numbers cite `mocks/index.html` at
`main` `330fd2b`.

Every author works in its own git worktree on branch `t4/mvp-<NN>-<letter>` cut from `mvp/integration`,
opens a pull request into `mvp/integration`, and MUST NOT merge it (relay rule 7). Each author owns only
its listed files. `npm run check` MUST pass; it fails on any Biome error, warning or info.

## MVP-08: the page

### Decisions

- **Location.** The page moves to `public/`. `mocks/index.html` stays as the approved reference and is
  no longer deployed. The Lead changes `wrangler.jsonc` `assets.directory` from `./mocks` to `./public`.
- **Language: plain JavaScript ES modules, `// @ts-check` plus JSDoc, checked by `tsc`.** No build step:
  the deployed bytes are the committed bytes, so a SHA2-256 comparison of `/` against the repository
  still proves what runs, as T1 did. Biome lints `.js` natively. A TypeScript page would need a bundler
  for the browser (Node's type stripping does not reach it), which is one more tool, one more stale
  artifact class, and nothing V2 keeps. This choice does not widen the existing TypeScript language
  server gap (RESUME "Known loose ends"); it is the same gap.
- **Proof before dispatch (Lead):** TypeScript 7 MUST be shown to check JSDoc in a `.js` file, by one
  deliberate type error in a page module that `tsc -p tsconfig.page.json` reports, then removed. If it
  cannot, the fallback is `.ts` sources under `page/` with a `wrangler` `build.command` that runs
  `esbuild` into `public/`, and this section is re-frozen.
- **Inter and the logo stay embedded as data URIs**, between the same `FONT` and `LOGO` markers, in
  `public/index.html`. Reasons: the reveal waits on one HTML response and nothing else (concept.md
  3.4); and the touch icon Terry already added to his home screen came from this data URI, so a second
  fetch through Access for the icon is a risk not worth taking (RESUME risk 8). The Lead adds a
  `--target <html>` argument to `mocks/tools/embed-font.py` and `mocks/tools/embed-logo.py`, default
  unchanged.
- **Removed:** the `SCENARIOS` script (246), the MOCK button and sheet (218-223, CSS 179-189), the desktop
  side panel (226-244, CSS 191 and 198-203), `fetchState()` and the scenario code (248-254, 281-294,
  558-577), the block-based clock (`block_start`, `block_end`), `tldr` (377, CSS 176), and "clickable
  mock" from the title. `document.title` becomes `swimcoach`, prefixed `(N) ` while N cards ask
  (490). MVP-10 still sets `apple-mobile-web-app-title`.
- **Desktop (>= 760 px):** `#phone` stays a centered 402 x 874 column, as in 192-196, without the bezel
  border, shadow and notch (`::before`). This is the one layout change from the mock; the visual
  reviewer MUST flag it to Terry rather than pass it silently.
- **Kept exactly:** every rule in concept.md 3 and 13, `docs/brand.md`, the palette tokens, `fmtTime()`,
  the 4/8 slot grid, clock hands, health box, breathing sync and the reveal. Order is the server's
  (api.md 6.9): renderers MUST NOT sort (the mock's `localeCompare` at 473 goes).

### Files the Lead writes before dispatch

| File | Content |
| --- | --- |
| `public/index.html` | Head (1-16, 23-28) and the shell markup (208-217): status line, `#warn`, `#pages`, `#dots`. Links `css/base.css`, `css/overview.css`, `css/project.css`; one `<script type="module" src="/js/main.js">` |
| `public/css/base.css` | **The shared token stylesheet:** tokens (29-41), base and fade (42-48), the shell (50-84), `@keyframes throb` (87), the desktop column |
| `public/js/format.js` | Shared helpers lifted from 256-273, exported: `ALL`, `POLL_MS`, `TONE`, `TREND`, `BELL`, `esc`, `fmtTime`, `hm`, `pct`, `dur`, `clockRtr`, `arrow`, plus `LANE_LABELS` (api.md 6.10 words, board order) |
| `public/js/view.js` | JSDoc typedefs only: the frozen projection below |
| `tsconfig.page.json` | `allowJs`, `checkJs`, `strict`, `noUncheckedIndexedAccess`, `lib` `ES2024` + `DOM` + `DOM.Iterable`; includes `public/js` and `test/page`. Root `tsconfig.json` excludes `test/page` |
| `package.json`, `vitest.config.ts`, `biome.jsonc` | `typecheck` adds `tsc --noEmit -p tsconfig.page.json`; a Vitest project `page` for `test/page/**` (Node environment; `happy-dom` for `morph.test.ts`, a new dev dependency); a Biome override for `public/**` if any rule misfires on browser code, with its count and reason |
| `wrangler.jsonc`, `src/index.ts` | Assets from `./public`. The router serves `GET /` from `index.html`, and `GET` on paths matching `^/(css\|js)/[a-z]+\.(css\|js)$` from `env.ASSETS`, mapping an asset 404 to `404 not_found`. Every other path, `/index.html` included, stays `404 not_found` (api.md 1). Access still runs first |

### The frozen projection (`public/js/view.js`)

The controller turns `GET /api/2026-11-13/state` into this once per successful poll. Both renderers read
only this; neither reads the API body or recomputes a verdict (api.md 6).

```js
/** @typedef {'green'|'yellow'|'red'|'gray'|'done'} Level   state.color */
/** @typedef {-2|-1|0|1|2} Dir   from metrics.trend_bin: sharp_down -2 ... sharp_up 2 */
/**
 * @typedef {object} View
 * @property {number} now             state.now (epoch s); all ages are measured against it
 * @property {number|null} lastReportAt
 * @property {'no_data'|'idle'|'stale'|'live'} feed
 * @property {{staleMinutes:number, stallMinutes:number, minHistoryMinutes:number, minBlockUsed:number}} thresholds
 * @property {CardView[]} cards       state.milestones, in the server's order
 * @property {number} asking          cards with needsMe !== null
 */
/**
 * @typedef {object} CardView
 * @property {string} key             JSON.stringify([asciiLower(project), asciiLower(milestone)]); never ALL
 * @property {string} title           project + " " + milestone (api.md 6.2)
 * @property {'codex'|'claude'} agent
 * @property {Level} level
 * @property {string} reason          state.reason, unchanged
 * @property {string} why             the words for reason (api.md 6.6), aged to view.now
 * @property {string} callWhy         the call without the ask: `why`, except for needs_terry, where it is
 *                                    the words for the first api.md 6.6 row after needs_terry that the
 *                                    milestone matches (added by the Lead after the MVP-08 visual review,
 *                                    PR #30; the display's hero shows it, the flag shows the ask)
 * @property {string|null} needsMe
 * @property {boolean} stale          state.stale; silentSeconds = now - updatedAt
 * @property {number} silentSeconds
 * @property {'ratio'|'count_and_time'} mode
 * @property {boolean} tooEarly       metrics.too_early, ratio mode, not done
 * @property {number|null} rtr        metrics.rtr; null in count_and_time mode
 * @property {Dir|null} dir           null when trend is null, when done, or in count_and_time mode
 * @property {{delta:number, minutes:number, proj:number|null, recentDone:number, toGo:number}|null} trend   same nulls as dir
 * @property {number|null} chance     metrics.chance_on_time, same nulls as dir
 * @property {number|null} marginSeconds   (cap_hours - projection_hours) * 3600; null when projection_hours is
 * @property {number|null} work
 * @property {number} clock
 * @property {number} finished
 * @property {number} total
 * @property {number} activeHours
 * @property {number} capHours
 * @property {{ready_for_work:number, in_progress:number, needs_terry:number, ready_for_review:number, completed:number}} lanes
 * @property {[number, number][]} spark   state.spark, unchanged
 * @property {number} updatedAt
 * @property {number} lastMoveAt
 */
```

`why` words: `done` "Done"; `needs_terry` the `needs_me` text; `silent` "Agent silent for " +
`dur(silentSeconds)`; `running_late` "Running late"; `stalled` "No ticket moved in " + `dur(now -
lastMoveAt)`; `toss_up` "Toss-up"; `too_early` "Too early to call"; `on_time` "On time"; `over_budget`
"Over budget" and `under_budget` "Under budget" (Terry, 2026-11-13; UX-133).

### MVP-08 A: overview display (Sonnet 5.5 / medium)

Owns `public/js/overview.js`, `public/css/overview.css` (from 86-136, less 87), `test/page/overview.test.ts`.

- `export function renderOverview(view: View): string`: the port of `overview()` (337-351). Red cards
  leave the list into one GO TO KEYBOARD slot, first, `data-go` the first red card's `key`; the empty
  state (338). Every `data-go` is a `CardView.key`.
- `.rt` shows when `rtr !== null` and the level is not `done`. In `count_and_time` mode there is no
  `.rt`; the Detail blurb is "N of M done · H of C hrs" unless red (the ask), done ("Done") or silent
  (`why`) (UX-131).
- `export function fitCards(page: HTMLElement): void` and its `fitNames` (445-464). They MUST write a
  style only when its value changes, so an unchanged poll mutates nothing (UX-110).
- Pure renderer: no DOM access outside `fitCards`, no timers, no fetch. Tests build `View` literals.

### MVP-08 B: project display (Sonnet 5.5 / medium)

Owns `public/js/project.js`, `public/css/project.css` (from 138-175), `test/page/project.test.ts`.

- `export function renderProject(card: CardView, view: View): string`: the port of `chart()` and
  `detail()` (354-428), with the back link `data-go` set to `ALL`, the footer's agent from `card.agent`,
  hours as `activeHours` of `capHours` (395), and the too-early tile's gates from `view.thresholds`.
- Swimlanes from the five fixed keys with `LANE_LABELS`: done lanes are `ready_for_review` and
  `completed`, the attention lane is `needs_terry` (402-424). An empty Needs Terry row is hidden.
  **Completed is never a row** (Terry, 2026-11-13; UX-093, UX-094); it still counts as finished in
  the metrics the display shows.
- `count_and_time` mode (Terry, 2026-11-13; UX-134): no hero RTR, no RTR today chart and no projection
  tiles; the hero label shows `why`; Work against time, Swimlanes and the footer stay.
- Pure renderer, as in A.

### MVP-08 C: controller (Opus 5.5 / high)

Owns `public/js/main.js`, `public/js/state.js`, `public/js/morph.js`, `test/page/state.test.ts`,
`test/page/health.test.ts`, `test/page/morph.test.ts`, and `mocks/tools/render-page.py`.

- `state.js`: `export function toView(body: unknown): View`. It MUST throw on a body missing a field it
  reads, and the controller then counts the poll as failed. Tests: every `contract/schemas/examples/state.*.json`.
- `morph.js`: `export function morph(target: Element, html: string): void`. Reconciles children by
  position and tag; changes only differing attributes and text; leaves equal nodes untouched (UX-110).
  It MUST NOT touch the `style` attribute that `fitNames` owns.
- `main.js`, the port of 430-441, 465-469, 471-556, 579-588:
  - `export function healthOf(view: View|null, lastOkMs: number, nowMs: number): {st:string, label:string, age:number|null, msg:string}`,
    the pure core of `tick()` (523-545): OFFLINE after `3 * POLL_MS` without success; else `no_data` gives
    NO DATA, `idle` IDLE; else the age of `lastReportAt` plus time since the poll decides STALE or LIVE.
  - Polls `GET /api/2026-11-13/state` every 10 s and on `visibilitychange`, with `cache: "no-store"`,
    `redirect: "manual"` and an 8 s `AbortSignal.timeout`. A redirect or `401` (Access session gone)
    reloads the page once per load, so Access shows its login; any other failure is a failed poll.
  - One `<section class="page" data-key>` per key, created, reordered and removed as in 474-485, then
    `morph()` per section; then `fitCards`, `syncBreath`, dots, title, alerts (`needKeys` on `key` plus
    `needsMe`). The touch deferral (512-520) stays.
  - Reveal (587-588) waits for the first poll to settle and `document.fonts.ready`, capped at 3 s
    together, so a slow network never leaves a blank page.
- `render-page.py`: serves `public/` locally, answers the state path with each `state.<scenario>.json`
  (timestamps shifted so `now` is the real now; `offline` aborts the request), and renders the same
  screens and file names as `render-mock.py` into `design/ui-page/`, for the visual reviewer's
  side-by-side. The page itself carries no test hook.

## MVP-09: API acceptance suite

### Decisions

- **Location `acceptance/api/`, its own npm package** (`acceptance/package.json`, like `cli/`), so V2
  needs only Node 26 and `npm ci --prefix acceptance`. TypeScript run by Node 26's type stripping
  (erasable only), on `node:test` and `node:assert`. Its one runtime dependency is `ajv` (2020 dialect,
  `u` flag; the engine the contract's name patterns were proven in), pinned, with a
  `THIRD-PARTY-NOTICES.md` entry. Typechecked by `tsc -p acceptance/tsconfig.json` in `npm run
  typecheck`; never part of `npm test` (it needs the network and a token).
- **It MUST NOT import from `src/`, `cli/`, `test/` or `public/`.** It MAY read `contract/` as data
  (fixtures, schemas, examples). A Biome `noRestrictedImports` override on `acceptance/**` enforces it,
  and MVP-12 C confirms it.
- **Run:** `node acceptance/api/run.ts --config <file> --suite clock-free|full`. Both flags are required;
  there is no default config and no `--url`. The config file has `cli.json`'s exact shape (`url`,
  `access_client_id`, `access_client_secret`; cli.md 5), so the secret goes only to the `url` beside
  it. Production uses `cli.json`; the test deployment uses `cli-test.json` beside it, which Terry makes
  by copying `cli.json` and changing `url`. An agent MUST NOT read or copy either file's values.
- **Tiers.** `clock-free` MAY run against production. It sends no `Swimcoach-Test-Now` header, with one
  exception (Lead, 2026-11-13, after the PR #26 review): a clock-free case MAY send the header only to
  prove `400 test_clock_disabled`, and the harness MUST fail the run if such a request gets any answer
  other than that 400. Production refuses the header before it touches the Board, so the probe changes
  nothing. `full`
  runs every case and MUST fail, not skip, if the deployment answers `400 test_clock_disabled`, so a
  test Worker with a broken switch cannot pass by skipping.
- **Production safety.** On production the suite MUST use project `zz acceptance <runId>` only, MUST
  stop only milestones whose project starts with `zz acceptance`, and MUST NOT send `needs_me` or
  `needs_terry > 0` (a red card would chime and jump Terry's phone). The `full` tier starts by stopping
  every listed milestone (api.md 9); that reset MUST NOT run in `clock-free`.
- **Time base and retention.** Every timed `at` stays within 7 days before the real time, so the Board's
  14-day prune on the real clock never reaches suite data. That settles the RESUME MVP-09 note without
  changing the Worker. `midnight-rollover` starts at 22:40:00 UTC two days back, and again at 22:40 in
  the suite machine's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`), per
  `contract/fixtures/README.md`.

### The frozen case format (`acceptance/api/types.ts`, written by the Lead before dispatch)

```ts
export type Tier = "clock-free" | "timed";
export interface Reply { status: number; headers: Headers; body: unknown; text: string }
export interface Send {
  body?: unknown;                    // JSON-encoded unless raw is set
  raw?: string | Uint8Array;         // sent as is (BOM, bad JSON, oversize)
  headers?: Record<string, string>;  // added to or overriding the defaults
  at?: number;                       // epoch s, sent as Swimcoach-Test-Now; timed cases only
  auth?: "token" | "none" | "bad-secret";   // default "token"
}
export interface Harness {
  readonly suite: "clock-free" | "full";
  readonly runId: string;
  request(method: string, path: string, send?: Send): Promise<Reply>;   // never follows redirects
  report(body: unknown, at?: number): Promise<Reply>;
  stop(project: string, milestone: string, at?: number): Promise<Reply>;
  state(at?: number): Promise<unknown>;          // asserts 200, no-store and state.schema.json
  replay(fixture: Fixture, project: string, milestone: string, startAt: number): Promise<number>;   // last at
  expectSchema(ref: string, body: unknown): void;   // e.g. "report.schema.json#/$defs/errorResponse"
  expectClose(actual: unknown, expected: unknown, path: string): void;   // 1e-9 numbers, exact otherwise
  project(): string;                             // "zz acceptance " + runId
}
export interface Fixture { name: string; cap_hours: number; samples: { at_hours: number; active_hours: number; lanes: Record<string, number> }[]; expected: Record<string, unknown> }
export interface Case { id: string; title: string; tier: Tier; cites: string; run(h: Harness): Promise<void> }
```

Case IDs are `API-001` on, never renumbered, like the UX ledger. Each case stops what it created in a
`finally`; the run ends by stopping any `zz acceptance` milestone still listed.

### MVP-09 A: harness (Sonnet 5.5 / medium)

Owns `acceptance/package.json`, `acceptance/package-lock.json`, `acceptance/tsconfig.json`,
`acceptance/README.md`, `acceptance/api/run.ts`, `harness.ts`, `config.ts`, `schema.ts`, `fixtures.ts`,
and `acceptance/api/selftest/`.

- `run.ts` parses the two flags, loads the config (exit with a message naming the missing key, never a
  value), builds the `Harness`, imports `cases/index.ts`, and registers each case as a `node:test`
  `test()`, sequentially; `clock-free` registers only clock-free cases. Exit status is `node:test`'s.
- `replay` sends each sample as one report at `startAt + at_hours * 3600`, `agent` `claude`, the
  fixture's `cap_hours`, and asserts each answer is 200.
- `selftest/` runs the harness against a local `node:http` stub: header stamping, `redirect: "manual"`,
  the secret in no output stream, a refused config with a missing key.

### MVP-09 B: cases (Sonnet 5.5 / medium)

Owns `acceptance/api/cases/` (`index.ts` exporting `cases: Case[]`, one file per area).

- **Clock-free:** Access (no credentials gives a redirect to the Access host or `401`/`403`; a bad
  secret `401`/`403`); `/healthz`; routing (`404 not_found` for unknown, unversioned, unknown-date,
  trailing-slash and `/index.html` paths; `405` with `Allow`; query strings ignored); `no-store` on every
  `/api/*` reply; `415`, `413`, `invalid_json`, `invalid_report` with `problems`, a leading BOM accepted,
  arrays and unknown fields refused, the name rules; the lifecycle (`added: true`, then `false`;
  `stored`, then `duplicate` within 60 s; ASCII case-insensitive identity and newest spelling; stop,
  gone from state, second stop `404 not_tracked`); production's `400 test_clock_disabled` changing
  nothing (skipped in `full`). Every body checked against its schema.
- **Timed:** every `contract/fixtures/*.json` replayed and compared key for key at `now` = the last
  report (`color` and `reason` by api.md 6.6, per `contract/README.md` "For the Lead" item 2);
  `invalid_test_clock`; `409 clock_went_backward`; the 60 s duplicate edge; `last_move_at` only on a lane
  change; `stale` at 25 min, `stalled` at 45 min; `feed` `no_data`, `idle`, `live`, `stale`; `spark`
  thinning past 80 samples (api.md 6.9).
- Not covered, and said so in the README: the 14-day retention (an alarm on the real clock; api.md 10
  is MAY).

## Open for the Lead: where the timed cases run

The `full` tier needs a deployment with `SWIMCOACH_TEST_CLOCK` exactly `on`.

- **(a) A second Worker, `swimcoach-test`, behind Access.** A `wrangler.jsonc` `env.test` with its own
  name, its own Board (a separate Worker gets its own Durable Object namespace), and `vars` restating
  `ACCESS_TEAM_DOMAIN`, its own `ACCESS_AUD` and `SWIMCOACH_TEST_CLOCK: "on"`. `vars` and
  `durable_objects` do not inherit into an environment, so the top level keeps no switch (api.md 9);
  check with `scripts/wrangler.ps1 deploy --env test --dry-run`. Costs Terry: approve the first deploy
  (local token, Workers Admin; RESUME risk 3), enable Access on the new Worker with the existing
  `terry` and `swimcoach-cli` policies, hand over the new AUD, and write `cli-test.json`. About ten
  minutes, once. It exercises the real Access path, it is a real deployment for "passes against the
  deployed MVP", and the Lead can deploy a deliberately broken build to it for "fails against a broken
  build" without touching production.
- **(b) `wrangler dev` locally.** No account change and no Terry step. But nothing sits in front of it:
  `verifyAccess` needs a `Cf-Access-Jwt-Assertion` signed by the team's keys, and no local caller holds
  one. Making it work means either an Access bypass switch in the Worker, which is a fail-open path in
  production code and contradicts api.md 2, or minting JWTs against a local key set, which puts auth
  internals into a suite V2 must run unchanged. It also tests a local runtime, not the deployed Worker.

**Recommendation: (a).** (b) can only work by weakening authentication or by coupling the suite to the
MVP's internals, and either undoes what MVP-09 exists to prove. Ask Terry for (a)'s steps at T4 open,
before dispatch; 09-A and the clock-free half of 09-B proceed against production meanwhile, and the
timed cases are run once `swimcoach-test` answers `scripts/check-access.ps1` 3 of 3.

## Open for Terry (defaults above until he decides)

1. Detail blurb words for `over_budget` and `under_budget` (UX-133).
2. The project display in `count_and_time` mode (UX-134).
3. Whether Completed shows as a fourth lane row, and at 0 (UX-093, UX-094).
4. The desktop column without the phone bezel.
