# T6 frozen interfaces

Written by the Lead on 2026-11-14, after T5 closed, per relay rule 1 in
[`mvp-staffing-plan.md`](mvp-staffing-plan.md). RFC 2119 keywords; the capitals are load-bearing. Where
this page and `contract/` disagree, the contract wins.

**Base.** T6 starts from `main` = `mvp/integration` at the commit that adds this file (relay rule 8),
with no other branch, worktree or open pull request. Production and `swimcoach-test` run the T5 build
(API `2026-11-14`).

**What T6 is.** MVP-12 proves the whole MVP and hands it to Terry (`mvp-stories.md`). Its product is
the **qualification record**: the evidence that the deployed MVP passes its black-box suites, and the
bar V2 MUST also clear (`docs/concept.md` section 14). Terry's device check step 8 does not block it
(Terry, 2026-11-14: "I'm not holding up MVP release").

## Rules for every T6 agent

- Each agent works in its own git worktree on branch `t6/mvp-12-<letter>` cut from `mvp/integration`,
  and owns only its listed files.
- **A worktree MUST NOT junction or symlink `node_modules`.** Removing a worktree follows a junction and
  empties the real folder (it happened on 2026-11-14). Run `npm ci` in the worktree root,
  `acceptance/` and `cli/`.
- Credentials are files under `%USERPROFILE%\.secrets\swimcoach`. An agent MAY pass `cli.json` and
  `cli-test.json` to a suite by path and MAY run `scripts/wrangler.ps1`; it MUST NOT open, print or
  copy either file or any other file there.
- The suites only read production: the API suite's `--suite clock-free` and the UI suite. `--suite
  full` MUST run only against `swimcoach-test`.
- `npm run check` MUST pass on every branch.

## MVP-12 B: behavioral coverage audit (Sonnet 5.5 / medium)

Owns `docs/qualification/coverage.md`. For every behavior the MVP promises, name the check that proves
it, or record that none does:

- Every endpoint, status code, header and error in `contract/api.md`, and every field rule in
  `contract/schemas/*.json`: the API case (`acceptance/api/cases/*.ts`) by file and case name.
- Every live row of `contract/ux-ledger.md`: its Check cell (MVP-11 C already maps these; verify a
  sample of 20 by opening the cited case, do not redo the mapping).
- `contract/cli.md`: the CLI behaviors and what, if anything, checks them black-box.
- **Gaps:** each behavior with no black-box check, with a one-line reason (manual only, internal test
  only, or untested). A gap is a finding, not a failure: the author MUST NOT write new checks.

Hands its branch to 12-A and exits. No pull request.

## MVP-12 C: provenance and independence (Sonnet 5.5 / medium)

Owns `docs/qualification/provenance.md` and `docs/qualification/renders/`.

- **Independence:** prove mechanically that nothing under `acceptance/` imports MVP code (`src/`,
  `public/`, `cli/`, `test/`). List every import specifier in `acceptance/**/*.ts` and classify each.
  Reading `contract/` (schemas, examples, the ledger) is allowed and MUST be listed as such.
- **What ran where:** the commit on `main`; production's and `swimcoach-test`'s deployed Worker
  version IDs (`scripts/wrangler.ps1 deployments list`, plus `--env test`); the last CI run on `main`.
- **Fresh runs, recorded:** API `--suite clock-free` on production, API `--suite full` on
  `swimcoach-test`, the UI suite on production and on `swimcoach-test`, each with its date, commit,
  pass and fail counts. A failure MUST be reported to the Lead at once, not explained away.
- **Production renders:** PNG screenshots of the production page at 402 x 874 CSS px, scale 3, for
  the contract examples `afternoon`, `allgreen`, `stale`, `silent` and `small-blocks`, answered through
  the UI harness exactly as the suite does (no write to the server), plus one project display. A small
  script at `acceptance/ui/render.ts` that imports only the harness MAY do this. Images are PNGs at
  300 DPI (`AGENTS.md`).

Hands its branch to 12-A and exits. No pull request.

## MVP-12 A: the qualification record (Opus 5.5 / high)

Owns `docs/qualification/README.md`. Starts after B and C hand off: merges both branches into its own,
then writes the record, which MUST state:

- What was qualified: commit, Worker versions, API date, and the suites with their counts (from C).
- What the suites cover and the gaps (from B), and for each gap whether V2 MUST close it or MAY carry
  it.
- The independence result (from C): the suites run unchanged against any implementation that serves
  the contract.
- **Open items, plainly:** device check step 8 (UX-171's second half); "MVP-06's real reports for a
  full turn" (needs one real project agent reporting through the CLI, which Terry sets up); and Terry's
  hands-on demo and acceptance, which MUST NOT be recorded as given until he gives it.
- How to re-run every check, as commands.

Opens one pull request into `mvp/integration` holding A, B and C's files, and MUST NOT merge it.

## Review

Two Opus 5.5 / high reviewers: a technical reviewer (every number in the record traces to a run; the
independence proof is mechanical; nothing claims Terry's acceptance) and a visual reviewer (the
production renders against `design/ui-mock/` and the approved mock). The technical reviewer
squash-merges on approval. Then the Lead ships T6 and hands Terry the demo.
