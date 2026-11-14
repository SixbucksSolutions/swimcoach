# MVP-12 C: provenance and independence

Written 2026-11-14 by MVP-12 C, from branch `t6/mvp-12-c` at base commit `13ad862` (`main` = `mvp/integration`
at the T6 freeze). RFC 2119 keywords; the capitals are load-bearing. Every number below traces to a run or
a command named beside it. Nothing here records Terry's acceptance, and none is given.

## 1. Independence: the suites import no MVP code

**Verdict: nothing under `acceptance/` imports, or builds a path to, `src/`, `public/`, `cli/` or
`test/`.** The suites read `contract/` as data and nothing else of the repository.

**Method.** A small script (outside the repository, type-annotated, run with `node` on the base commit's
tree) walks every `*.ts` under `acceptance/` (`node_modules` excluded) and extracts every module specifier
by five patterns: `import ... from`, side-effect `import "x"`, dynamic `import("x")`, `require("x")`, and
`new URL("./x", import.meta.url)` (the form the suites use to read data files, which an import-only scan
misses). Each relative specifier is resolved against its file and tested against the four forbidden
folders. A second pass searches every string for a `../` path that ends in `src`, `public`, `cli` or
`test`. The pattern set was proven able to find something: the first run, without the `new URL` pattern,
reported zero contract reads, which was wrong, and a search of the files showed six `new URL` sites; the
fifth pattern was added and the script then reported them.

**Result on the base commit `13ad862` (before this branch's `render.ts`):**

| Measure | Count |
|---|---|
| Files scanned | 56 |
| Specifiers found | 236 |
| Resolving into `src/`, `public/`, `cli/` or `test/` | 0 |
| Path strings reaching those folders | 0 |

**Classification of the 236 specifiers:**

| Class | Count | What |
|---|---|---|
| Acceptance-internal | 150 | Relative imports between files under `acceptance/` |
| Node built-in | 71 | `node:assert/strict` (36 files), `node:fs`, `node:fs/promises`, `node:path`, `node:process`, `node:test`, `node:url`, `node:util`, `node:http`, `node:net`, `node:os`, `node:child_process`, `node:timers/promises` |
| npm package | 9 | `playwright` (8 files: `ui/harness.ts`, `ui/types.ts`, six under `ui/cases/`) and `ajv/dist/2020.js` (`api/schema.ts`) |
| `contract/` data | 6 | See the next table |
| MVP code | 0 | |

**The six reads of `contract/`, which are allowed and listed here as the brief requires:**

| File | Reads |
|---|---|
| `acceptance/api/fixtures.ts` | `contract/fixtures/` (the golden fixtures) |
| `acceptance/api/cases/golden.ts` | `contract/fixtures/` |
| `acceptance/api/schema.ts` | `contract/schemas/` (the JSON Schemas) |
| `acceptance/api/selftest/stub.ts` | `contract/schemas/examples/state.allgreen.json` |
| `acceptance/ui/harness.ts` | `contract/schemas/examples/` (the state examples) |
| `acceptance/ui/ledger.ts` | `contract/ux-ledger.md` |

**A second, standing guard.** `biome.jsonc` has a `noRestrictedImports` rule over `acceptance/**` whose
message reads that the suite MUST NOT import from `src/`, `cli/`, `test/` or `public/`, and `npm run check`
runs it. The scan above is the independent mechanical proof; the lint rule keeps it true.

**Two run-time inputs that are not imports.** `acceptance/ui/run.ts --local <dir>` serves a directory given
on the command line (normally `public/`); a V2 passes its own page directory. `--config <file>` names a
deployment. Neither fixes a path into MVP code.

**This branch adds one file, `acceptance/ui/render.ts`.** It imports `./harness.ts` and Node built-ins only
(`node:fs/promises`, `node:path`, `node:process`, `node:url`, `node:util`, `node:zlib`). Its default output
folder, `docs/qualification/renders/`, is an output path. With it the scan reads 57 files and 244
specifiers, and the only path the script classes outside the four classes above is that output folder,
which is not MVP code.

## 2. What ran where

| Item | Value |
|---|---|
| Commit on `main` (and `origin/main`) | `13ad8622e2eee6a3d2664605e3c0d320db92e1bb`, 2026-11-14 13:46 -05:00, "Freeze the T6 interfaces (MVP-12 qualification)" |
| Last CI run on `main` | Run 43628428609, workflow CI, push, `success`, 1m14s, started 2026-11-14T18:46:05Z (`gh run list --branch main --limit 1`) |
| Production Worker, current version | `824f1136-0ce0-48eb-954f-0d623edd516c`, created 2026-11-14T18:47:15Z, 100% (`scripts/wrangler.ps1 deployments list`) |
| `swimcoach-test` Worker, current version | `983748d7-3964-4104-a083-84d9c25624f7`, created 2026-11-14T18:02:38Z, 100% (`... deployments list --env test`) |

Earlier versions in the same listings, for the record: production `c0d559f7-4f76-48e8-b9ee-8e328f9d0919`
(18:17:22Z) and `6e83ff63-1020-4e39-8385-704b7ce0cbf1` (18:21:26Z); test `48eba025-78eb-49c5-93cc-b97d5af32ab5`
(15:15:12Z) and `26462c55-443e-4fca-919d-5c4d508344b7` (16:02:27Z). The listings show only each tail; older
versions are not recorded here.

**Why the two Workers carry different version IDs yet the same code.** Production's three listed versions fall
after T5's ship commit (`22e171c`, 2026-11-14 13:00 -05:00, which is 18:00:34Z), one near each later push
to `main`; `swimcoach-test`
was last deployed at 18:02:38Z, two minutes after that ship commit. `git diff --stat 22e171c 13ad862 --
src public wrangler.jsonc package.json` is empty, so no deployable file changed between them. That
the 18:02:38Z test version is built from `22e171c` is an inference from the timestamps and the empty diff;
the Worker version listing does not record a commit.

## 3. Fresh runs

All four ran from a fresh worktree of the base commit `13ad862`, on 2026-11-14 between 13:48 and 13:52 -05:00,
after `npm ci` in the root, `acceptance/` and `cli/`. The production runs used `cli.json` and the test runs
`cli-test.json`, both passed by path. Logs are kept in the scratch folder of this session, not committed.

| Run | Command | Target | Tests | Pass | Fail | Cancelled | Skipped | Exit | Duration |
|---|---|---|---|---|---|---|---|---|---|
| API, clock-free | `node acceptance/api/run.ts --config <cli.json> --suite clock-free` | production (`swimcoach.sixbuckssolutions.workers.dev`) | 41 | 41 | 0 | 0 | 0 | 0 | 17.7 s |
| API, full | `node acceptance/api/run.ts --config <cli-test.json> --suite full` | `swimcoach-test` | 68 | 68 | 0 | 0 | 0 | 0 | 63.2 s |
| UI, WebKit | `node acceptance/ui/run.ts --config <cli.json>` | production | 116 | 116 | 0 | 0 | 0 | 0 | 188.8 s |
| UI, WebKit | `node acceptance/ui/run.ts --config <cli-test.json>` | `swimcoach-test` | 116 | 116 | 0 | 0 | 0 | 0 | 191.0 s |

No run failed. The two UI runs went at the same time as the API runs (production's and test's in two
parallel chains); the UI suite answers the page's state polls itself and writes nothing.

## 4. Production renders

`acceptance/ui/render.ts` opens the production page in WebKit at 402 x 874 CSS px, device scale 3, mobile
and touch on, through the UI harness (`startUi`, `ctx.example`, `ctx.answer`, `ctx.open`). It answers the
page's state poll with each contract example shifted to the page clock, exactly as the suite does, so it
sends no write to the server. Each PNG is 1206 x 2622 px and carries a `pHYs` chunk of 11811 pixels per
metre; Pillow reads it back as 300 DPI (299.9994, the rounding of 11811 / 39.37) on all six files.

Rendered 2026-11-14 at 13:52 -05:00 from commit `13ad862` plus this branch's `render.ts`. Command:
`node acceptance/ui/render.ts --config <cli.json>`.

| File in `docs/qualification/renders/` | Shows |
|---|---|
| `overview-afternoon.png` | Overview, example `afternoon` |
| `overview-allgreen.png` | Overview, example `allgreen` |
| `overview-stale.png` | Overview, example `stale` |
| `overview-silent.png` | Overview, example `silent` |
| `overview-small-blocks.png` | Overview, example `small-blocks` |
| `project-afternoon.png` | One project display (the first, `auth-refresh M3`) of `afternoon`, reached by a tap on its dot |

**Two things for the visual reviewer, observed and not judged.** First, in `project-afternoon.png` the
first swimlane row ("Ready For Work") sits at the fold, and the dots bar overlaps the lower edge of its
text (the descender of the "y" is cut). The display scrolls, so this may be only where the viewport ends;
the reviewer MUST compare it against `design/ui-mock/` and the approved mock before calling it a defect.
Second, the images are of the page as drawn from the contract examples, not of live production data.

## 5. Check

`npm run check` passed (exit 0) in the branch worktree with `acceptance/ui/render.ts` and this page in
place, on 2026-11-14.
