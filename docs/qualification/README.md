# MVP qualification record

Written 2026-11-14 by MVP-12 A from the two evidence packets beside it:
[`provenance.md`](provenance.md) (MVP-12 C: what ran where, the fresh runs, independence, renders) and
[`coverage.md`](coverage.md) (MVP-12 B: what the suites cover and what they do not). RFC 2119
keywords; the capitals are load-bearing. Every number here is copied from one of those two pages, and
each is cited; nothing is rounded or added.

**Status in one line: the deployed MVP passes both black-box suites in production, and MVP-12 is not
done.** Its "done when" in [`mvp-stories.md`](../planning/mvp-stories.md) has two halves: "both suites
pass in production and Terry accepts". The first half is met. The second is not given: **Terry has not
accepted the MVP**, and this record MUST NOT be read as saying he has (section 6).

## 1. What was qualified

| Item | Value | Source |
|---|---|---|
| Commit the runs used | `13ad8622e2eee6a3d2664605e3c0d320db92e1bb` ("Freeze the T6 interfaces (MVP-12 qualification)"), then `main` = `mvp/integration` | `provenance.md` section 2 |
| API date | `2026-11-14` (`/api/2026-11-14/...`) | `t6-interfaces.md`, Base |
| Production Worker version | `824f1136-0ce0-48eb-954f-0d623edd516c`, created 2026-11-14T18:47:15Z, 100% | `provenance.md` section 2 |
| `swimcoach-test` Worker version | `983748d7-3964-4104-a083-84d9c25624f7`, created 2026-11-14T18:02:38Z, 100% | `provenance.md` section 2 |
| Last CI run on `main` at that commit | Run 43628428609, `success`, started 2026-11-14T18:46:05Z | `provenance.md` section 2 |

**The two Workers carry different version IDs and, by inference, the same code.** No deployable file
(`src`, `public`, `wrangler.jsonc`, `package.json`) changed between T5's ship commit `22e171c` and
`13ad862`. That the test version was built from `22e171c` is C's inference from timestamps and that
empty diff; the version listing does not record a commit (`provenance.md` section 2).

**`main` moved after the runs, and the move changes no code.** `main` is now `e592ef5`, and `git diff
--stat 13ad862 e592ef5` touches only `docs/planning/RESUME.md`. This record's branch adds
`docs/qualification/` and `acceptance/ui/render.ts`, a render script that is not a suite case.

### The fresh runs

All four ran on 2026-11-14 between 13:48 and 13:52 -05:00 from a fresh worktree of `13ad862`
(`provenance.md` section 3).

| Run | Target | Tests | Pass | Fail | Cancelled | Skipped | Duration |
|---|---|---|---|---|---|---|---|
| API, `--suite clock-free` | Production | 41 | 41 | 0 | 0 | 0 | 17.7 s |
| API, `--suite full` | `swimcoach-test` | 68 | 68 | 0 | 0 | 0 | 63.2 s |
| UI, WebKit | Production | 116 | 116 | 0 | 0 | 0 | 188.8 s |
| UI, WebKit | `swimcoach-test` | 116 | 116 | 0 | 0 | 0 | 191.0 s |

**Why the full API suite ran only on `swimcoach-test`.** Its `timed` cases send the test clock, which
production refuses with `400 test_clock_disabled` by design (`contract/api.md` section 9), and
`t6-interfaces.md` says `--suite full` MUST run only against `swimcoach-test`. The clock-free cases
ran on production; every case, clock-free and timed, ran on test (`coverage.md`, catalog).

### Production renders

Six PNGs in [`renders/`](renders/), 1206 x 2622 px, 300 DPI, of the production page at 402 x 874 CSS
px, scale 3, in WebKit: the overview for the contract examples `afternoon`, `allgreen`, `stale`,
`silent` and `small-blocks`, and the first project display of `afternoon` (`provenance.md` section 4).
**They show the page drawn from the contract examples, not live production data**: the render script
answers the page's state poll itself, as the UI suite does. Whether they match the approved design is
the T6 visual reviewer's call against `design/ui-mock/`; this record does not judge them.

## 2. Independence: the suites run unchanged against any implementation of the contract

**Nothing under `acceptance/` imports, or builds a path to, `src/`, `public/`, `cli/` or `test/`**
(`provenance.md` section 1). C's scan of the 56 suite files on `13ad862` found 236 module specifiers:
150 between suite files, 71 Node built-ins, 9 npm packages (`playwright`, `ajv`), 6 reads of
`contract/` (allowed: schemas, fixtures, examples, the ledger), and 0 into MVP code. With this
branch's `render.ts`: 57 files, 244 specifiers, still 0 into MVP code. The scan was proven able to
find something before its zero was believed. A Biome rule (`noRestrictedImports` over `acceptance/**`)
keeps it true on every `npm run check`, and `npm run check` passes on this branch.

**So a V2 runs both suites unchanged** by passing its own deployment to `--config` (a file shaped like
the CLI's config: `url`, `access_client_id`, `access_client_secret`), or its own page directory to
the UI suite's `--local`. The one thing the suites assume of a V2 beyond HTTP is the contract's own
authentication: an Access service token in `CF-Access-Client-Id` and `CF-Access-Client-Secret`
(`contract/api.md` section 2).

## 3. What the suites cover

B mapped every behavior the contract promises to the check that proves it (`coverage.md`, Totals).

| | Rows |
|---|---|
| Behaviors listed | 294 |
| Covered by an API case | 114 |
| Covered by a UI case | 134 |
| Manual only (Terry's phone) | 4 |
| Internal-test only (the MVP's own `test/`, which V2 does not inherit) | 30 |
| Untested | 12 |

The 294 are rows, not unique behaviors: an error code can appear under its route and again in the
errors table. Of the 136 live UX ledger rows, 132 have a UI case and 4 are manual only (UX-163,
UX-164, UX-166, UX-171). Of the 30 internal-only rows, 25 are the CLI. B opened 20 ledger rows'
cited cases and found 20 of 20 matching (`coverage.md` section 4).

**What each suite proves, and the join neither proves.** The API suite proves the server's state
from real reports. The UI suite loads the real page from the deployment but answers its state polls
itself, so it proves "given this state, the page shows this". Nothing black-box proves that the live
server's state reaches the page; today that join is Terry's phone (`coverage.md` section 4).

## 4. Gaps, and what V2 MUST do about each

B ranked the gaps (`coverage.md`, "Gaps that matter"); this section makes the call for V2 on each.
**MUST close** means V2 MUST NOT replace the MVP until a black-box check covers the gap and V2 passes
it. **MAY carry** means V2 MAY ship with the gap still open; the contract's rule itself still binds
V2 either way.

| B's # | Gap | Rows | V2 | Reason |
|---|---|---|---|---|
| 1 | No black-box check of the real CLI against a deployment | C01 to C29 | MUST close | The CLI is how every project agent reports, so a V2 that broke it would cut every agent off the board and still pass every suite |
| 2 | `over_budget` is never produced through the server | A69 | MUST close | It is a verdict Terry sees on a card (D1's yellow), and V2 could compute it wrong and pass every suite |
| 3 | `stalled` is weakly proven: no case asserts `reason == "stalled"` on its own | A70, A75 | MUST close | Same as 2: a card verdict that the milestone's call can mask in the one case that reaches it |
| 4 | The Worker's own Access JWT check is internal-test only | A11, A88 | MAY carry | Access answers first, so no black-box request can reach it, and API-001 to API-005 already prove an unauthenticated caller is refused |
| 5 | The UI suite answers its own state polls, so nothing checks live server state reaching the page | Section 4 | MUST close | It is the product's one end-to-end path, V2 rewrites both sides of it, and today only Terry's eyes prove it |
| 6 | The test clock's fail-closed values are internal-test only | A100 | MAY carry | The test clock is a test tool, and the behavior that protects Terry's board, production refusing it, is proven by API-080 |
| 7 | The trend bin `up` has no fixture | A57 | MUST close | Not an edge but a whole value: it draws the card's up arrow (`public/js/state.js`) |
| 7 | Edges the fixtures avoid on purpose: call edges 0.70 and 0.30, the two too-early gates alone, `chance_on_time` limit branches, spark thinning past 160 samples | A56, A59, A60, A79, S25 | MAY carry | The fixtures avoid them by design, and floating-point edges are where two correct implementations can differ |
| 8 | Small ones: `405` on `/`, the `GET /` status and type, the error `message` sentence, `500 internal`, 14-day retention, "never removed automatically", the CLI never sending the test clock, sender rules | A17, A18, S15, A95, A102, A103, C26, A42, C29 | MAY carry | None changes what Terry sees on a working board, and several cannot be provoked from outside |

B split gap 7 into one row and this record splits it into two, because `up` is a value and the rest
are edges. **B wrote that V2 SHOULD get a black-box CLI suite; this record raises gap 1 to MUST**,
for the reason in the table. Rows B listed as untested or internal-only but did not rank (A12, A40,
S10, C27) MAY be carried on gap 8's reasoning, except C27 (the CLI in cmd, PowerShell and POSIX
shells), which closes with gap 1.

**The bar V2 MUST clear**, as `docs/concept.md` section 14 asks:

- Both suites, unchanged, MUST pass against V2: API `clock-free` and UI on V2's production, API
  `full` and UI on its test deployment, with no case removed, skipped or weakened.
- The gaps marked MUST close above MUST each have a black-box check that V2 passes.
- The 4 manual-only ledger rows MUST be observed again on Terry's phone, since no suite checks them.
- Terry's visual acceptance is a gate of its own, beside the suites (`docs/concept.md` section 14).

## 5. Not covered by this record

This record does not judge the renders (the visual reviewer does), does not re-derive B's mapping or
C's scan, and adds no check: a gap is a finding, not a failure (`t6-interfaces.md`).

## 6. Open items

These are open. None of them is done, and none is implied done by anything above.

1. **Device check step 8, UX-171's second half: not done.** Opened from the home-screen icon four
   hours or more after the last use, the page MUST show the board without a sign-in page
   (`contract/ux-ledger.md`, UX-171). Step 4, the same check right after the icon is added, passed;
   step 8 is outstanding (`coverage.md` section 4). Terry
   ruled on 2026-11-14 that it does not hold up the MVP's release (`t6-interfaces.md`).
2. **MVP-06's real reports for a full turn: not done.** One real project agent reporting through the
   swimcoach CLI for a full turn, which Terry sets up. It is also the only observation today of the
   path that gaps 1 and 5 name: real command, real server, real page (`coverage.md` row C28).
3. **Terry's hands-on demo and acceptance: not given.** Terry owns acceptance (`mvp-stories.md`,
   MVP-12). Until he gives it, MVP-12 is not done, whatever the suites say.

## 7. How to re-run

PowerShell, from a clone or worktree of the commit to qualify. Config files are passed by path; their
contents MUST NOT be opened, printed or copied (`t6-interfaces.md`). `cli-test.json` names
`swimcoach-test`; `--suite full` MUST NOT be given `cli.json`.

```powershell
# Once per checkout: installs the root, acceptance/ and cli/ packages (root postinstall).
npm ci
# Once per machine: the WebKit browser the UI suite drives.
npx --prefix acceptance playwright install webkit

$cfg = Join-Path $env:USERPROFILE '.secrets\swimcoach'

# API suite: clock-free on production (expect 41/41), full on swimcoach-test (expect 68/68).
node acceptance/api/run.ts --config (Join-Path $cfg 'cli.json') --suite clock-free
node acceptance/api/run.ts --config (Join-Path $cfg 'cli-test.json') --suite full

# UI suite on each deployment (expect 116/116 each).
node acceptance/ui/run.ts --config (Join-Path $cfg 'cli.json')
node acceptance/ui/run.ts --config (Join-Path $cfg 'cli-test.json')

# UI suite against a page directory on this machine, with no deployment.
node acceptance/ui/run.ts --local public

# Production renders into docs/qualification/renders/ (writes nothing to the server).
node acceptance/ui/render.ts --config (Join-Path $cfg 'cli.json')

# Deployed Worker versions, production then swimcoach-test.
.\scripts\wrangler.ps1 deployments list
.\scripts\wrangler.ps1 deployments list --env test

# Last CI run on main.
gh run list --branch main --limit 1

# Typecheck, lint (including the suites' import ban), internal tests and the API suite's selftest.
npm run check
```

**Independence, re-run.** C's scan script was not committed, so it cannot be re-run as is. This search
covers the same question for relative paths, in imports and in `new URL(...)` alike. Run the control
first: it MUST list the six `contract/` readers in section 2, which proves the pattern finds what it
is aimed at. Then the real search MUST print nothing and exit 1.

```powershell
# Control: lists the six files that read contract/.
git grep -lE '[''"](\.\./)+contract(/|[''"])' -- 'acceptance/*.ts'
# Real: any relative path into MVP code. Expect no output, exit 1.
git grep -nE '[''"](\.\./)+(src|public|cli|test)(/|[''"])' -- 'acceptance/*.ts'
```

Both commands were run on this branch on 2026-11-14: the control listed the six files, and the real
search printed nothing and exited 1.
