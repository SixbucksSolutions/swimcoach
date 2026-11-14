# Resume point

First written 2026-11-13 and kept current since, so the next session starts exactly here. RFC 2119
keywords; the capitals are load-bearing. **Read this first, then `AGENTS.md`.**

## T4 closed (2026-11-14 UTC); next: Terry's MVP-08 phone check, then T5

- **`main` at `38c97d9` holds all of T4**, merged from `mvp/integration` (`824c7ed`): PRs #23-#30.
  CI run 43559508287 (`check` and `deploy` both success) put it on production. `swimcoach-test` was
  redeployed from the same `main` as version `b9d27288-fbf8-4d62-b71e-03e2087d5692`.
- **Verified on the deployed T4 build:** `--suite full` on `swimcoach-test` 68/68 (run `y39r80`);
  `--suite clock-free` on production 41/41 (run `9qpeqo`); a page smoke test (scratch script,
  service token, `redirect: "manual"`) fetched `/` (title "swimcoach") and all 15 `/css/` and `/js/`
  assets it references with 200 on both Workers. iOS WebKit is NOT verified; that is Terry's check.
- Branches: every T4 dev branch is deleted on the remote and locally; only `main` and
  `mvp/integration` remain.
- **The gate before T5 is Terry's MVP-08 phone check.** His four open calls are listed below. Do not
  start T5 until he passes MVP-08 or names changes.
- **Phone check, 2026-11-14 morning (in progress).** The empty board and six `zz demo` milestones
  rendered correctly on his iPhone. His changes, decided and shipped the same morning:
  - An empty or all-done board reads LIVE with the breathing dot (UX-136 to UX-138, superseding
    UX-016 to UX-018), and an arriving card fades in over 0.3 s `ease-in` via a keyed morph (UX-135).
    PR #31 (`30c9aed`), deployed as `main` `820ff36`; full suite 68/68 on test (run `shqq82`),
    clock-free 41/41 on production (run `oevov2`).
  - The UX ledger gained a V1 column; changed rows are superseded, never rewritten; the rows still
    standing become V1 requirements at MVP-12.
  - Relay rule 9 (`mvp-staffing-plan.md`): subagents only for parallel work or independent review.
  - **The overview is locked to a 3/6 slot grid for the MVP** (Terry: "three is plenty and we can
    revisit at V1+"). Seven demo cards under 4/8 spilled past the bottom of the home-screen app, whose
    card area is about 625 px (estimate; measure before MVP-12). PR #32 (`a12605e`, authored by the
    Lead per rule 9), deployed as `main` `dcdf18a`; UX-141 to UX-147 supersede the 4/8 rows (ledger:
    147 rows, 16 superseded). Full 68/68 on test (run `1ligdb`), clock-free 41/41 on production.
  - **A silent card is gray** ("not enough FRESH data to signal green/yellow", Terry) and draws no
    arrow (the Lead's call, UX-152). The color change in `GET /state` moved the **API date to
    `2026-11-14`**; `/api/2026-11-13/` now answers 404. PR #33 (`5f7bcdf`), deployed as `main`
    `e27f8ee`; full 68/68 on test (run `czsfgm`), clock-free 41/41 on production. Ledger: 152 rows,
    21 superseded. Earlier lines in this file that name `/api/2026-11-13/` are history.
  - Still open from the list below: the desktop column, SIGN IN, small-block hero spacing. The six
    `zz demo` milestones are still on production; stop them when the demo ends.

### How T4 went (kept for the record)

- `mvp/integration` holds MVP-08 B (#24, project display) and all of MVP-09: the harness (#26,
  `d9cc68b`) and 68 cases (#27, `cf66c20`). Every PR was reviewed by Opus 5.5 / high; #26 and #27 each
  needed one fix round. GitHub refuses `--approve` because one account authors and reviews, so
  reviewers post a `--comment` review headed "approval record" (precedent PR #23).
- **First real run of the suite: `--suite clock-free` against production passed 41/41** (run
  `nf0exo`, from a detached `mvp/integration` worktree, `--config` = `cli.json`). Production runs T3
  code, so this proves the T3 API matches the contract as the cases read it.
- Lead decision (main `869ceb1`): a clock-free case MAY send `Swimcoach-Test-Now` only to prove
  `400 test_clock_disabled`; the harness fails the run on any other answer. The `full` tier probes the
  test clock before its reset, so a `full` run against production stops nothing.
- **`swimcoach-test` is live behind Access** (2026-11-14). Terry's first attempt left the dashboard's
  default scope, "Previews only", which protects nothing at the workers.dev address; the second used
  All traffic, policies `swimcoach-cli` and `terry`, 7 days. Its AUD went in via #29 (`3668175`),
  read from the Access API rather than copied by hand. Deployed version
  `4e417847-fc83-4cfe-b8f9-97f26e501d3e`. Terry made `cli-test.json` with a one-line PowerShell
  command; an agent MUST NOT read or copy either config file's values.
- **`check-access.ps1 -ConfigPath ...\cli-test.json`: 3/3. `--suite full` against the test Worker:
  68/68** (run `31dvk3`, 34 s), so every golden fixture replays through the real Worker within the
  contract's tolerances.
- MVP-08 merged into integration: #25 (08-A, `7c4247d`, three review rounds), #28 (08-C,
  `8f93547`, three rounds). Reviewers proved in Chromium at 402 x 874 that an identical poll makes ZERO
  DOM mutations on `document` (the status clock's once-a-minute change is the only writer), including
  after Inter loads late. The visual review (57 screens, 0-1.06 % pixel diff) found 2 defects, fixed
  in #30 (`824c7ed`): a name ellipsized by `clientWidth` rounding, and a red display's hero repeating
  the ask instead of the call (new `CardView.callWhy`). The Needs Terry ask shows ONLY in the project
  display's "Go to keyboard" flag; the overview's GO TO KEYBOARD slot lists titles only.
- **For Terry at the MVP-08 phone check (his calls, not yet decided):**
  1. The desktop view is a centered 402 x 874 column with no bezel or side panel (the one sanctioned
     layout change; he has not seen it).
  2. SIGN IN: an auth failure (redirect, 401, 403) reloads once per 5 minutes so Access can show its
     login, then shows SIGN IN in OFFLINE's red with the displays grayed. If the reload itself is
     refused, the page shows the header and warning only.
  3. On a small-block display the hero label ("Under budget") sits flush under the title; the reviewer
     offers 10px of space if he wants it.
  4. Whether to post a few `zz demo` milestones with the CLI so the board has cards during the demo.

## T3 closed (2026-11-13, Terry's evening)

- `main` at `086d930` holds all of T3: PRs #17-#22 (Lead HTTP helpers, report and stop routes, state
  route, CLI client, agent instructions, router wiring), each reviewed by Opus 5.5 / high. CI run
  43546488067 deployed it.
- **The API is date-versioned:** `/api/2026-11-13/report`, `/stop`, `/state`; `API_VERSION` lives once
  in `src/contract.ts`. Terry's rule (quoted in `contract/api.md`): rev the date when adding, changing
  the behavior of, or removing a method or endpoint; a non-breaking defect fix keeps it.
- **End-to-end proof against production:** `node cli/swimcoach.ts report` for "zz smoke test" T3
  stored a card (gray, too early, RTR 1.0667 = 0.40 / 0.375); `GET /api/2026-11-13/state` returned it;
  `swimcoach stop` removed it; state went back to `no_data`; unversioned `/api/state` answered 404.
- The CLI is its own npm package (`cli/package.json`) so `@types/node` never enters the Worker's type
  program; a root `postinstall` installs it. `src/**` also denies Node-only globals in Biome.
- The page still shows the mock's data. **Next: T4** (MVP-08 page on live data, MVP-09 API acceptance
  suite). Gate after T4: Terry's phone check of MVP-08 before T5.

## Access proven (2026-11-13, Terry's evening)

- Terry ran the runbook: Zero Trust org `snowy-queen-54cf` (already existed, Free plan), One-time
  PIN login added, Worker-level Access on All traffic (7-day app session), policies `terry` (Allow,
  `Terry.Ott@gmail.com`, 1-month session) and `swimcoach-cli` (Service Auth, non-expiring token),
  `cli.json` written (shape checked by the Lead without reading values). Google login was considered
  and dropped for the MVP: "Simple is good."
- PR #16 wired `verifyAccess` into the router with `run_worker_first: true`; deployed as `main`
  `923473c`, CI run 43540993578 green.
- **`scripts/check-access.ps1` passed 3 of 3 against production:** no credentials 302 to the Access
  login host, service token 200, wrong secret 401. **Risk 9 is resolved:** Access on `workers.dev`
  works on this account.
- **Terry's iPhone PIN login worked (2026-11-13, 8:35pm local):** Chrome on the iPhone 16 Pro loaded
  the board through Access, LIVE badge and all. The page still shows the mock's scenario data; real
  data arrives with MVP-07 (T3) and MVP-08 (T4). MVP-05 is complete. **T3 opens next** (MVP-06 CLI
  client, MVP-07 state and report API), Lead's call under relay rule 8.

## T2 closed (2026-11-14 01:03 UTC); waiting on Terry's Access steps

- `main` at `725a67e` holds all of T2: PRs #6-#15, each reviewed by Opus 5.5 / high and
  squash-merged into `mvp/integration`, then merged to `main` by the Lead. 935 tests pass.
- CI run 43538055066 passed `check` and `deploy`. **The CI token (Workers Editor) deployed the new
  `Board` Durable Object class with `exports`**, so Admin is not needed for that; version
  `24d4495d-6dbe-473d-aa19-5ea6d6cc3ef6`. Live: `/healthz` 200 with `no-store`, `/api/health` 404,
  `/` matches the mock by SHA2-256.
- `mvp/integration` is fast-forwarded to `main` for T3.
- **Gate: Terry runs `docs/runbooks/access-setup.md`**, then `scripts/check-access.ps1`. The Worker
  does not verify Access yet: the Lead wires `verifyAccess` into the router once Terry's steps give
  `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (Worker variables, not secrets). Zero Trust organizations
  created on or after 2026-10-05 refuse bad service tokens with 401/403 rather than a redirect; the
  script accepts both.
- T3 (MVP-06 CLI client, MVP-07 state and report API) opens after the gate.
- Process cost seen in T2: small Lead config PRs took up to four review rounds over comment wording.
  Reviewers were then told to raise only inaccuracies and rule violations, not wording preferences.

## T1 closed (2026-11-14 00:03 UTC)

- `main` at `95d8f08` holds all of T1: PRs #1-#5, each reviewed by Opus 5.5 / high and
  squash-merged into `mvp/integration`, then merged to `main` by the Lead.
- CI run 43531397267 passed `check` and `deploy`; the CI token (Workers Editor) deployed version
  `2c82febc-8c96-47f4-aece-f12f7632c7dc`. The live `/` matches `mocks/index.html` by SHA2-256.
- `mvp/integration` is fast-forwarded to `main` for T2.
- Carried into T2's contract work: Ajv strict mode warns that `project`, `milestone` and `needsMe`
  lack a local `"type": "string"`; the schema says "every code point" but Go cannot test lone
  surrogates; `contract/fixtures/README.md` "Open for Terry" item 1 (midnight) is settled by api.md 6.9.
- **Lead work at T2 close:** add `jose`
  6.2.17 (MIT) to `THIRD-PARTY-NOTICES.md`; turn off Biome's framework-specific rules that preset
  "all" enables for a project with no such framework (`useQwikValidLexicalScope` misfired for two
  authors), with the count and reason in `biome.jsonc`; and update `t2-interfaces.md` to the
  `{ path, message }` shape of `problems` that MVP-03 B used, which the contract's `errorResponse`
  requires; add one sentence to `contract/api.md` 6.3 that `chance_on_time` is 1 when `p` rounds to 0
  and 0 when `1 - p` does (the prototype raises `ValueError` there, so a literal V2 port would crash;
  PR #9 review).
- Follow-up (non-blocking, PR #9 review): the chance tests miss two mutations, deleting the
  compensated sum and moving the Lanczos cutoff from 5 to 4; the "span too small" test never reaches
  the `p = 0` limit. Strengthen them in a later turn.
- Decided 2026-11-13: the status-line clock STAYS, even though the iPhone's own status bar shows the
  time above it in the home-screen app. Terry: "Keep it I don't want rework." Do not re-propose
  dropping or hiding it.
- Carried into MVP-10: iOS offered "open as web app" and the home-screen icon launches full-screen
  (standalone), not inside Chrome. Terry added the page to his iPhone home screen on 2026-11-13. The S1 icon is
  right, but the label reads "(1)swimcoach·c..." because iOS took the mock's `<title>` (needs-you count
  plus "swimcoach · clickable mock"). MVP-10 MUST set `apple-mobile-web-app-title` and the manifest
  `short_name` to `swimcoach`, and MVP-08 SHOULD drop "clickable mock" from the title.
- Carried into MVP-09: the Board's retention alarm prunes on the real clock, so on the test Worker,
  samples stamped more than 14 days before real time can vanish within a day (MVP-03 A hand-off).
  The test Worker SHOULD disable or re-base pruning.
- Carried into MVP-07: `snapshot().samples` is keyed by `milestoneKey()` from `src/board/store.ts`.
- Carried into MVP-07: the router answers unknown paths with a plain-text 404 and wrong methods with
  404; api.md requires `404 not_found`, `405 method_not_allowed` with `Allow`, and `errorResponse`
  bodies (PR #6 second review).
- **Next: T2** (MVP-03 Board Durable Object, MVP-04 metrics, MVP-05 Access). The Lead writes T2's
  frozen interfaces first. MVP-05's Access steps are Terry's gate and need the Zero Trust
  organization confirmed (risk 2).

## Where things stand

| Area | State |
| --- | --- |
| UI mocking | **Closed.** `mocks/index.html` is the approved design; every decision and its reason is in `docs/concept.md` sections 2, 3 and 13, and `docs/brand.md` |
| Hosted mock | Private claude.ai artifact, republished after every mock edit. The URL is in the Claude project memory (`swimcoach-mock-artifact-url`), not in this public repo |
| Build plan | MVP, then a greenfield V2: `docs/concept.md` section 14. The MVP is requirements discovery |
| MVP stack | **Decided:** one Cloudflare Worker, one SQLite-backed Durable Object, TypeScript, Cloudflare Access. Leading V2 candidate: Terry's static Go plus SQLite container |
| Decisions D1-D3 | **Decided** (`docs/planning/mvp-stories.md`): count-and-time cards for blocks under 3 stories; count tickets but accept optional `estimate_hours`; only Terry's own gates go red |
| Stories | 12 stories, MVP-01 to MVP-12, in 6 turns: `docs/planning/mvp-stories.md` |
| Diagram | `docs/planning/mvp-execution-plan-legal-portrait.pdf` (print) and the 300 ppi PNG, rendered from `mvp-plan.json` by `render-plan.py` |
| Staffing | `docs/planning/mvp-staffing-plan.md`: a per-turn relay, 28 authors and 18 reviewers, at most 6 at once |
| Code | **T1 merged and deployed** (see "T1 closed" above). `contract/` holds MVP-01; the Worker scaffold and CI are MVP-02 |

## Blocked on Terry, before T1 can deploy

**All five steps were done on 2026-11-13.** Nothing here blocks T1 any more. MVP-02's first deploy
still needs Terry's go-ahead at the time, because it creates the Worker on his account.

1. **Hostname: decided.** Terry, 2026-11-13: the MVP runs on `*.workers.dev` for now. So no zone, no
   DNS record and no zone-scoped token permissions are needed. A custom hostname MAY come later and
   would add Workers Routes Edit and DNS Edit on that zone.
2. **Create the local token as an account API token, not a personal (user) token** (Cloudflare
   dashboard, Manage Account, Account API Tokens). An account token belongs to the account, not to a
   person, and Cloudflare recommends it for CI and integrations; its compatibility table marks Workers,
   DNS and Access as supported. Give it the **Workers: Admin** role at Entire Account scope, Account
   Settings Read (Wrangler's account lookup), Access: Apps Write, Access: Policies Write and Access:
   Service Tokens Write. All of them sit in ONE policy scoped to **Entire Account**. If a later step is
   refused, add exactly the permission the error names.
   - The policy scope MUST be Entire Account. On 2026-11-13 the scope read "Specified Domains" with no
     domain chosen, and the dashboard kept **Review token** disabled with no message saying why.
   - The dashboard now offers Workers roles (Metadata Read-only, Content Read-only, Editor, Admin) and
     marks the old "Workers Scripts" permission **Legacy**; it MUST NOT be used. Legacy Workers
     Scripts Edit maps to Editor.
   - Admin is required here because Cloudflare's docs say Editor "can read, update, deploy, and
     rename existing Workers" and cannot create one. The first deploy creates the swimcoach Worker.
   - **Done 2026-11-13.** The token and the account ID are files in `%USERPROFILE%\.secrets\swimcoach`:
     `cloudflare-api-token-local.txt` and `cloudflare-account-id.txt`. The folder grants Full Control
     to Terry's account only, with inheritance removed. Cloudflare's `tokens/verify` reported the token
     `active` with no expiry.
3. **Create the CI token:** a second account API token with **Workers: Editor** instead of Admin and
   without the two Access permissions. CI only deploys the Worker the local token created. The docs do
   not say whether a Durable Object migration needs more than Editor; if a CI deploy with a migration
   is refused, raise the CI token to Admin. **Done 2026-11-13:** "swimcoach CI Deploy", Workers Editor
   and Account Settings Read on the entire account, no expiry, all IP addresses (GitHub's runner
   ranges are too wide and too changeable to allow-list). No copy is kept on this machine.
4. **Store the CI token as a GitHub secret. Done 2026-11-13:** Terry ran
   `gh secret set CLOUDFLARE_API_TOKEN --repo SixbucksSolutions/swimcoach`, and `gh secret list` shows
   it, set at 2026-11-13T22:49:41Z.
5. **Give CI the account ID. Done 2026-11-13:** the `CLOUDFLARE_ACCOUNT_ID` Actions secret is set, at
   2026-11-13T22:51:17Z, on Terry's go-ahead. The workflow reads it as a secret. Cloudflare
   does not treat it as a secret, but a GitHub secret masks it in this public repo's workflow logs,
   so it SHOULD be a secret. The value is in `%USERPROFILE%\.secrets\swimcoach\cloudflare-account-id.txt`.

### Local credentials: files, never environment variables

Terry, 2026-11-13: he will not set `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` as User or
Machine environment variables. Storing the token on disk is fine, and an agent reads it when it needs
it. So:

- Every local Wrangler command MUST go through `scripts/wrangler.ps1`, for example
  `pwsh -NoProfile -File scripts/wrangler.ps1 deploy`. The script reads both files, sets the two
  variables at Process scope for one run, and clears them afterward.
- An agent MUST NOT print, copy or commit the token file's contents, and MUST NOT write either value
  to the User or Machine environment.
- Proven 2026-11-13: `wrangler whoami` through the script reports "logged in with an Account API
  Token" for account `Terry.ott@sixbuckssolutions.com's Account`. After the run, neither the calling
  shell nor the User environment held the token, and Wrangler's logs contained no `cfat_` string.
- Wrangler 4.162.0 reads an account token without trouble once `CLOUDFLARE_ACCOUNT_ID` is set. The old
  `wrangler login` on this machine expired on 2026-11-13 and is not needed.

Account changes stay Terry's to approve even with a token: the Access application, its policy, the
service tokens, and the Worker's first `workers.dev` deploy. Prepare each step and ask before running it.

## Risks to finishing in six turns (checked 2026-11-13)

1. **MVP-06's data source: `C:\Projects\localswim`, and nothing else.** Terry, 2026-11-13, in his
   words: "just c:\projects\localswim period". localswim cut over to V2 on the night of 2026-11-12.
   - The reporter MUST use the localswim CLI from `C:\Projects\localswim` (the Go V2,
     `github.com/localswim/localswim`), which reads and writes boards. Its README builds it with
     `go build -o localswim.exe ./cmd/localswim` and points the CLI at the service with `LOCALSWIM_URL`
     and `LOCALSWIM_TOKEN` (`docs/windows-operations.md`). The help is multi-level: append `--help` to
     an object or action.
   - The reporter MUST NOT parse JSON files, and MUST NOT use any other localswim copy:
     not `localswim-v2`, not `localswim-legacy-v1`, not `localswim-state-store` (V1, before the
     cutover), and not the uv-installed `localswim` on `PATH`, a broken Python V1 install whose
     `localswim.pth` points at the removed `C:\Projects\localswim\src`.
   - **Superseded the same day by Terry's data path** (now in `mvp-stories.md` MVP-06): cards are not
     tied to time blocks, and there is **no relay**. Each running project's own agent, in Codex or
     Claude, runs the swimcoach CLI client and pushes its milestone's wall-clock hours and card count per lane
     straight to the Worker's API. No swimcoach agent, no state file on disk. MVP-01 freezes the
     CLI's command line. The localswim notes above are background only; swimcoach does not read
     localswim.
2. **The Zero Trust organization is unconfirmed.** The local token lists Access applications (there are
   none) but gets 403 on `access/organizations`, because it lacks an Organizations Read permission.
   MVP-05 needs an organization with a team domain. Terry SHOULD check the Zero Trust dashboard before
   T2.
3. **MVP-09 needs time control that production cannot give.** The suite replays timed reports, and the
   server computes RTR, staleness and health from its own clock. MVP-01's contract MUST make time an
   input (report timestamps) or MVP-09 MUST run against a separate test Worker with a clock override. A
   second Worker needs the local token: the CI token's Workers Editor cannot create one.
4. **Terry's gates set the pace:** MVP-02's first deploy, the MVP-05 Access steps, the MVP-08 phone
   check, MVP-10 on the phone, and MVP-12 acceptance.

5. **The CI token SHOULD get narrower, not wider.** Workers Editor at Entire Account scope can deploy
   over ANY existing Worker on the account, including FlickrGroupAddr's `fga-api`. Workers Admin would
   add creating and deleting them. After MVP-02's first deploy creates `swimcoach`, Terry SHOULD
   re-scope the CI token's Editor role to that one Worker. Creating any extra Worker (such as a test
   Worker) stays with the local token.

6. **Agent sandboxes and approval prompts can block or nag the CLI (MVP-06).** Codex's default
   workspace sandbox blocks outbound network, so a project agent's `swimcoach` push may fail there.
   Claude Code asks approval for a command it has not been allowed, so every card move could prompt
   Terry. Both need a one-time allow rule for the `swimcoach` command, which is Terry's call per tool.
7. **The CLI must be installed where every project's agent finds it (MVP-06):** on `PATH` for all
   projects, with its Access service token in a file it reads. Its language decides its LSP and linter
   under Terry's global rule.
8. **The iPhone home-screen app keeps its own cookies (MVP-10).** iOS gives a home-screen web app
   storage separate from Chrome, so Terry logs in to Access once more inside it, and the session length
   decides how often. It MUST be tested on the phone, not assumed.
9. **Access in front of `workers.dev` (MVP-05):** believed supported, not yet verified. MVP-05 MUST
   confirm it before building on it; a custom hostname is the fallback.

Checked and fine: the mock and the report agree on lanes. Backlog and Blocked never appear on the
dashboard (`concept.md`, 2026-11-13), and the report carries neither. The account's `workers.dev` subdomain is `sixbuckssolutions`, so the URL will be
`swimcoach.sixbuckssolutions.workers.dev`. The account already runs the `fga-api` and `fga-m28-stage`
Workers.

## Live (2026-11-13)

- **First deploy done** from `mvp/integration` at `c935e71`, by the Lead through `scripts/wrangler.ps1`:
  `https://swimcoach.sixbuckssolutions.workers.dev`, version `146ddcd3-5908-4953-a637-e10abf529c29`.
  `/` serves `mocks/index.html` byte-identical (SHA2-256 match), `/api/health` answers `{"ok":true}`,
  `/tools/` is 404.
- **It is public until MVP-05** puts Access in front of `workers.dev`. Today it serves only the mock,
  which is public in this repo anyway, and the health route.
- Deferred from MVP-02 review: a Vitest test for `GET /` needs `miniflare.assets` in
  `vitest.config.ts`; MVP-11's browser checks cover `/` meanwhile.

## Terry's go-aheads for T1 (2026-11-13)

- **First deploy: pre-approved.** When MVP-02 passes review, the Lead runs the first deploy through
  `scripts/wrangler.ps1` without stopping. It creates only the `swimcoach` Worker.
- **Pacing: the Lead decides** (Terry, 2026-11-13, replacing the earlier "stop after T1"). The Lead
  opens each next turn under relay rule 8 and stops only at Terry's own gates. The first is MVP-05's
  Access steps in T2, which also need the Zero Trust organization confirmed (risk 2).
- **Open questions for Terry** collect in the contract's "Open for Terry" lists and wait for a natural
  stop; work proceeds on the prototype's behavior meanwhile. A decision Terry already made (D1-D3)
  outranks the prototype without asking.
- **Subagents: as planned** in `mvp-staffing-plan.md`, five T1 authors at once.
- A reboot is no longer needed for credentials: nothing reads environment variables.

## Next action when unblocked

Start **MVP T1** per `docs/planning/mvp-staffing-plan.md`: five authors (MVP-01 A, B, C; MVP-02 A, B),
reviewers relaying in as authors finish. Before dispatch, the Lead writes the frozen interfaces the
splits depend on (MVP-02: the npm script names).

## Known loose ends (none block T1)

- **TypeScript language server:** not available on TypeScript 7 (no `tsserver`); recorded, not skipped.
  Biome is the TypeScript linter, wired in MVP-02. Terry said in chat on 2026-11-13: "Waived for now
  until TS 7.1 drop in a few months." By his global rule only an override he writes in this project's
  `CLAUDE.md` counts, and an agent MUST NOT write it for him; until he does, report the gap.
- **Python linting in this repo:** `ruff` and `pyright` are not wired to a gate for `mocks/tools/*.py`
  and `docs/planning/render-plan.py`; checks so far were run by hand.
- **`render-logo.py`** stamps 300 DPI without the retry `render-mock.py` has; it runs rarely.
- **Codex leftovers, by Terry's choice:** the paused `swimcoach-project-watch` Codex automation still
  points at the deleted `v001` folder; `~/.codex` is otherwise untouched.
- **Global hook health:** the `hook-health.py` sweep reported stale at the start of the 2026-11-13 session. It is
  Terry's global setup, not this repo.
- **Rest of the palette and AAA:** only white on the good-news green is held to AAA; the red card's
  white text is 4.83:1 (`docs/brand.md` section 5).
