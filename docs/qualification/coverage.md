# Behavioral coverage audit (MVP-12 B)

Written by MVP-12 B on 2026-11-14 against `mvp/integration` at `13ad862`. RFC 2119 keywords; the capitals
are load-bearing. This page maps every behavior the MVP promises in `contract/` to the black-box check
that proves it, or records that none does. It adds no check and changes none: a gap here is a finding,
not a failure. Nothing here was run; it is a reading of the contract against the suites' source.

**How to read the category column.**

| Category | Meaning |
| --- | --- |
| `API` | A case in `acceptance/api/cases/*.ts`, cited by ID. IDs never change; the catalog at the end gives file and exact title |
| `UI` | A case in `acceptance/ui/cases/*.ts`, cited by file and exact title |
| `MANUAL` | Only a human observation on Terry's phone, recorded in the ledger's Check cell |
| `INTERNAL` | Only a test of the MVP's own code (`test/`), which V2 does not inherit |
| `NONE` | Nothing checks it |

A behavior with an `API` or `UI` check is counted there even when an internal test also covers it. A weak
or partial check is still counted under its category and named in the Notes column and in "Gaps that
matter".

## Totals

| | Count |
| --- | --- |
| Behaviors listed | 294 |
| Covered by an API case | 114 |
| Covered by a UI case | 134 |
| Manual only | 4 |
| Internal-test only | 30 |
| Untested | 12 |

The 294 are rows, not unique behaviors: some behaviors appear under two headings (an error code in the
errors table and again in the route that raises it). The 136 live UX ledger rows are counted once each
(section 4: 132 UI, 4 manual); sections 1 to 3 list the other 158 rows (A01 to A103, S01 to S26, C01
to C29) and carry the rest of the counts. Of the 30 internal-only rows, 25 are the CLI.

## 1. `contract/api.md`

| ID | Behavior | Check | Notes | Category |
| --- | --- | --- | --- | --- |
| A01 | Body is UTF-8 JSON; a write needs `Content-Type: application/json`, a `charset` parameter is allowed (1, 4.2, 8: 415) | API-020, API-023 | Five wrong types, report and stop | API |
| A02 | One leading BOM is accepted and ignored; two are `invalid_json` (1) | API-023, API-022 | | API |
| A03 | A body over 16 KiB is `413 body_too_large`; exactly 16 KiB is not (1, 8) | API-021 | | API |
| A04 | Every `/api/*` and `/healthz` reply carries `Cache-Control: no-store` (1) | API-016, API-006 | 200, 400, 404, 405, 413, 415 | API |
| A05 | Every Worker error has the `errorResponse` body (1, 8) | `expectError` in every refusal case, for example API-020 | See S15 for the message sentence | API |
| A06 | Query parameters are ignored on every route, `?since=` included (1, 6.9) | API-015, API-006 | | API |
| A07 | Paths are exact: no trailing slash, no `/index.html` alias (1) | API-012, API-013 | | API |
| A08 | Times are epoch seconds with an optional fraction (1) | API-120, API-100 to API-112 | | API |
| A09 | No route is public, `/healthz` included; a wrong service-token secret is refused (2) | API-001, API-002, API-003, API-004 | Cases accept 401, 403 or a redirect with `Location` | API |
| A10 | A request refused for its credentials stores nothing (2, 4.2) | API-005 | | API |
| A11 | The Worker itself verifies `Cf-Access-Jwt-Assertion` (signature, `aud`, `exp`) and answers `401 unauthenticated` (2, 8) | `test/access.test.ts` | Access answers first on both deployments, so a black-box request never reaches the Worker's own check; API-001 to API-004 prove only that an unauthenticated caller is refused by someone | INTERNAL |
| A12 | Senders are trusted: no per-sender or per-project authorization (2) | None | A negative; no request could prove it | NONE |
| A13 | `POST /api/2026-11-14/report` exists (3) | API-060 | | API |
| A14 | `POST /api/2026-11-14/stop` exists (3) | API-064 | | API |
| A15 | `GET /api/2026-11-14/state` exists (3) | API-130, API-131, API-132 | | API |
| A16 | `GET /healthz` answers `200 {"ok": true}` (3, 7) | API-006 | | API |
| A17 | `GET /` serves the page to an authenticated caller (3, 7) | UI suite: every case loads `/` through `acceptance/ui/harness.ts`, for example overview-status.ts "The clock is left of the Health box, never right of it" | Proves the page loads from the deployment; no API case asserts status, type or size of `GET /` | UI |
| A18 | Any other method on a known path is `405 method_not_allowed` with `Allow` (3, 8) | API-014 | Covers report, stop, state, `/healthz`; not `/` (see Gaps) | API |
| A19 | Any other path is `404 not_found` (3, 8) | API-010, API-011, API-012, API-013 | | API |
| A20 | Unversioned `/api/...` paths, unserved dates and the retired `2026-11-13` are `404` (3, Versioning) | API-010, API-011 | API-011 lists `/api/2026-11-13/stop` | API |
| A21 | Report: every field and all five lane keys are required (4.1) | API-024 | Each field and each lane key removed in turn | API |
| A22 | Report: types and ranges, `agent` enum, hours, lane counts (4.1) | API-025, API-046 | 24 bad values, each with a JSON Pointer | API |
| A23 | Report: unknown fields refused at the top and inside `lanes`; no timestamp is accepted (4.1) | API-027 | `need_me`, `at`, `timestamp`, `status`, `backlog`, `blocked` | API |
| A24 | Names: whitespace at either end refused, never trimmed; the fixed set including U+FEFF (4.1) | API-040, API-041, API-049 | API-049 is `timed` (names without the `zz acceptance` prefix) | API |
| A25 | Names: control characters and line breaks refused anywhere (4.1) | API-042, API-043 | | API |
| A26 | Names: whitespace that is not a control MAY appear inside (4.1) | API-044 | | API |
| A27 | `needs_me`: omit rather than `""` or `null`; 1 to 200 characters; the name rules (4.1) | API-151 | `timed` | API |
| A28 | One report per request: an array is refused as `invalid_report` (4.1) | API-028 | | API |
| A29 | Lengths count code points (4.1) | API-045, API-151 | | API |
| A30 | The 168-hour and 999-card ceilings are inclusive (4.1) | API-046 | | API |
| A31 | The whole body is validated before anything is stored; one `problems` entry per violation (4.2) | API-024, API-025, API-026 | | API |
| A32 | Check order: auth, path and method, test clock, 415, 413, `invalid_json`, schema (4.2) | API-005, API-080, API-120, API-020, API-021, API-022 | 415 before 413 before `invalid_json` each asserted | API |
| A33 | Identity is (project, milestone) compared ASCII case-insensitively; the newest spelling displays (4.3) | API-047 | | API |
| A34 | No Unicode case folding or normalization (4.3) | API-048 | | API |
| A35 | First report adds the milestone: `added: true`, `first_report_at = last_move_at = T` (4.4 step 1) | API-060 | | API |
| A36 | The newest report replaces the snapshot, even when `active_hours` went down (4.4 step 2) | API-063 | | API |
| A37 | `last_move_at` changes only when a lane count differs; hours, a heartbeat or a new agent do not move it (4.4 step 3) | API-123 | | API |
| A38 | Sample outcomes `stored`, `none`, `duplicate` (4.4 step 4) | API-061, API-062 | `none` for total 0 and for 0 active hours | API |
| A39 | Duplicate window: under 60 s and identical is a duplicate; 60 s later is stored; a duplicate still refreshes `updated_at` (4.4 step 4) | API-122, API-061 | | API |
| A40 | A report is applied as one atomic step (4.4) | `test/board/store.test.ts` "commits nothing when any part of a report fails" | No request can make a half-applied report happen from outside | INTERNAL |
| A41 | The report response: `received_at = T`, the stored spelling echoed (4.5) | API-060, API-047 | | API |
| A42 | Rules for senders: count only this milestone's epic; decision D3 (4.6) | None | Binds the agent, not the server; MVP-06's instruction text | NONE |
| A43 | Stop body: `stopRequest` and the same name rules as a report (5) | API-041, API-043, API-049 | | API |
| A44 | A malformed stop is `400 invalid_stop` with `problems` (5, 8) | API-029 | | API |
| A45 | Stop deletes the milestone, its samples and events at once (5) | API-064, API-065 | History deletion is seen only as "no history" after a re-add | API |
| A46 | The stop response echoes the stored spelling (5) | API-064, API-015 | | API |
| A47 | Stopping an untracked milestone is `404 not_tracked` and changes nothing (5, 8) | API-030, API-064 | | API |
| A48 | After a stop a new report adds it again from scratch (5) | API-065 | | API |
| A49 | State is `200`, matches `state.schema.json`, computed at the request's `now` (6) | Every `h.state` call asserts the schema; API-015; golden cases assert `state.now` | | API |
| A50 | `last_report_at` is the newest `updated_at`, `null` when none (6.1) | API-130, API-132, golden | | API |
| A51 | Stored and counted fields: `first_report_at`, `updated_at`, `finished`, `total`, `agent`, hours, lanes (6.2) | API-060, API-063, golden | | API |
| A52 | `stale`: not done and over 25 minutes since `updated_at`; 25 minutes exactly is not (6.2) | API-124 | Edge asserted at 25 min and 25 min + 1 s | API |
| A53 | `stalled`: not done and over 45 minutes since `last_move_at` (6.2) | API-125 | Edge asserted at 45 min and 45 min + 1 s | API |
| A54 | Done means `total > 0` and `finished == total`; a done milestone is never stale or stalled (6.2) | API-107, API-124, API-150 | | API |
| A55 | `metrics.work`, `clock` (may exceed 1), `rtr` (null when total or clock is 0) (6.3) | API-062, API-110, golden | | API |
| A56 | `trend` field for field; `null` and `too_early` while a gate fails (6.3) | API-104 (`morning`), API-124, golden | Only one fixture is "too early"; the 45-minute history gate and the 0.15 block-used gate are not isolated, and the fixtures README says edges were avoided on purpose | API |
| A57 | `trend_bin` bins (6.3) | Golden: `sharp_up` (API-101, 102, 103, 107), `down` (API-100, 110, 111), `sharp_down` (API-105, 106), `flat` (API-108, 109), `null` (API-104) | The `up` bin has no fixture | API |
| A58 | `projection_hours = trend.finish x cap_hours` (6.3) | Golden (`projection_hours` key in every fixture) | | API |
| A59 | `chance_on_time` and its limits: 1 when `p` rounds to 0, 0 when `1 - p` does (6.3) | API-107 (1.0), API-110 (0.0), golden | The limit fixtures assert the values; nothing proves they are the floating-point limit branch | API |
| A60 | `call` bins `on_time`, `toss_up`, `running_late` (6.3) | Golden: API-101, API-103, API-100 | Bin edges (0.70, 0.30) are avoided by design | API |
| A61 | `metrics` values are not rounded (6.3) | Golden compares at 1e-9 (`expectClose`) | | API |
| A62 | `metrics` ignores decision D1 (6.3) | API-108 | One-story fixture has `call: toss_up` beside `count_and_time` | API |
| A63 | `needs_me`: the newest report's, else `1 ticket in Needs Terry` or `N tickets in Needs Terry`, else `null` (6.4) | API-150 | | API |
| A64 | `mode`: `ratio` at 3 or more, else `count_and_time` (6.5) | API-108, API-124, API-125, `expectConsistent` on every checked state | The 2-to-3 boundary is hit only incidentally | API |
| A65 | Verdict row 1, `done` (6.6) | API-107, API-150 | | API |
| A66 | Verdict row 2, `red` / `needs_terry` (6.6) | API-102, API-106, API-150 | | API |
| A67 | Verdict row 3, `gray` / `silent` (6.6) | API-124 | The `silent` fixture is not a silent card (it is `toss_up`); only API-124 reaches the row | API |
| A68 | Verdict row 4, `yellow` / `running_late` (6.6) | API-100, API-109, API-110 | | API |
| A69 | Verdict row 5, `yellow` / `over_budget` (6.6) | None | No case drives a `count_and_time` milestone past its cap through the server; the UI cases use stub state | NONE |
| A70 | Verdict row 6, `yellow` / `stalled` (6.6) | API-125 | Weak: asserts the `stalled` flag and table consistency, never `reason == "stalled"` on its own | API |
| A71 | Verdict row 7, `yellow` / `toss_up` (6.6) | API-103, API-105 | | API |
| A72 | Verdict row 8, `gray` / `too_early` (6.6) | API-104, API-124 | | API |
| A73 | Verdict row 9, `green` / `on_time` (6.6) | API-101, API-111 | | API |
| A74 | Verdict row 10, `green` / `under_budget` (6.6) | API-108, API-125 | | API |
| A75 | First match wins; `done` outranks red; `silent` outranks the call (6.6) | API-150, API-124 | Other pairs of rows (stalled against toss_up, running_late against over_budget) are not isolated | API |
| A76 | The `2026-11-14` change: `silent` is gray, not yellow (Versioning, 6.6) | API-124, API-011 | | API |
| A77 | Feed states `no_data`, `idle`, `stale`, `live`, first match wins (6.7) | API-130, API-131, API-132, API-124 | | API |
| A78 | `thresholds` values (6.8) | API-124 | Exact `deepEqual` of all six | API |
| A79 | `spark`: one point per sample, oldest first, thinned, `[round(ts), round(work / clock, 4)]` (6.9) | API-140, API-141, golden | Thinning proven at 160 samples only | API |
| A80 | `milestones` order: project then milestone, ASCII-lowercased, then by code point (6.9) | API-066 | | API |
| A81 | No day boundary: a milestone is listed from first report to stop (6.9) | API-111, API-112 | `midnight-rollover` crossing UTC and local midnight | API |
| A82 | The mock-to-state mapping and lane labels for the page (6.10) | UI: project-lanes.ts "Swimlanes: Ready For Work, In progress and Ready for review, each with count, share and its own bar" | | UI |
| A83 | `400 invalid_json` (8) | API-022 | | API |
| A84 | `400 invalid_report` (8) | API-024 to API-028 | | API |
| A85 | `400 invalid_stop` (8) | API-029 | | API |
| A86 | `400 test_clock_disabled` (8, 9) | API-080 | Meaningful on production only; a no-op in the `full` tier | API |
| A87 | `400 invalid_test_clock` (8, 9) | API-120 | | API |
| A88 | `401 unauthenticated`, the Worker's own body (8) | `test/access.test.ts` | Same as A11 | INTERNAL |
| A89 | `404 not_found` (8) | API-010 to API-013 | | API |
| A90 | `404 not_tracked` (8) | API-030 | | API |
| A91 | `405 method_not_allowed` with `Allow` (8) | API-014 | | API |
| A92 | `409 clock_went_backward`, and nothing changes (8, 9) | API-121 | | API |
| A93 | `413 body_too_large` (8) | API-021 | | API |
| A94 | `415 unsupported_media_type` (8) | API-020 | | API |
| A95 | `500 internal`, and the request changed nothing (8) | None | No request can provoke it (`acceptance/api/cases/README.md`) | NONE |
| A96 | Test clock header format `^[0-9]{1,12}(\.[0-9]{1,6})?$`, a fraction honored (9) | API-120 | | API |
| A97 | On a test deployment the header is `T` and `now` for that request only (9) | Every `timed` case, for example API-122 | | API |
| A98 | On production the header is `400 test_clock_disabled` and changes nothing (9) | API-080 | Run against production by the `clock-free` suite | API |
| A99 | Time never runs backward per milestone (9) | API-121 | | API |
| A100 | The test-clock switch fails closed for every value but one: empty, `false`, `0`, padded, upper case, boolean (9) | `test/http.test.ts` | API-080 proves only the absent switch, on production | INTERNAL |
| A101 | Production's configuration does not define the switch (9) | API-080 on production (indirect) | No check reads the deployed configuration | API |
| A102 | Samples and events older than 14 days MAY be deleted (10) | `test/board/store.test.ts` "prunes only samples before the cutoff and counts them" | `acceptance/api/cases/README.md`: every timed request stays within 7 days on purpose | INTERNAL |
| A103 | A tracked milestone is never removed automatically (10) | None | Needs more than 14 days of real clock | NONE |

## 2. `contract/schemas/*.json`

Every state read through `h.state` asserts `state.schema.json`; every report, stop and error reply is
asserted against its `$defs` entry (`acceptance/api/harness.ts`, `helpers.ts`). So a shape rule is
checked each time a case reads that reply; the rows below name the case that exercises the rule's
edges.

| ID | Rule | Check | Notes | Category |
| --- | --- | --- | --- | --- |
| S01 | Report: required fields, `additionalProperties: false` (report.schema.json) | API-024, API-027 | | API |
| S02 | `agent` is `codex` or `claude` | API-025 | Also `Claude`, empty, number | API |
| S03 | `name` pattern: edge-whitespace set and the control-character `not` pattern | API-040 to API-044, API-049 | The cross-engine sweep of every code point lives in `contract/` tooling, not in a case | API |
| S04 | `project` 1 to 64 characters | API-045, API-049 | | API |
| S05 | `milestone` 1 to 32 characters | API-045, API-041 | | API |
| S06 | `active_hours` 0 to 168 | API-025, API-046 | | API |
| S07 | `cap_hours` over 0, at most 168 | API-025, API-046 | | API |
| S08 | `lanes`: five keys, integers 0 to 999, no extras | API-024, API-025, API-027, API-046 | | API |
| S09 | `needsMe` 1 to 200 | API-151 | | API |
| S10 | `epochSeconds` is a number of 0 or more | None | Every real reply is positive | NONE |
| S11 | `stopRequest` | API-029, API-041 | | API |
| S12 | `reportResponse`: `ok`, names, `received_at`, `added`, `sample` enum | Harness asserts it on every report; API-061, API-062 | | API |
| S13 | `stopResponse` | API-064 | | API |
| S14 | `errorResponse`: the 13-code enum | `expectError`; every code but `internal` and the Worker's `unauthenticated` is reached | | API |
| S15 | `errorResponse.message` is one sentence starting with a capital | None | The schema states it in a description only (`minLength: 1` is all it enforces) and no case checks it | NONE |
| S16 | `problems` is present on both `invalid_*` codes, with `path` and `message` | API-024, API-025, API-026, API-029 | | API |
| S17 | State top level: required keys, `feed` enum, empty board implies `no_data` and `last_report_at` null | API-130, every state read | | API |
| S18 | `thresholds` shape | API-124 | | API |
| S19 | `trend` object shape | Golden | | API |
| S20 | `metrics` null coupling: null `trend` forces `too_early`, null bin, call and chance | Golden, API-104, `expectConsistent` | | API |
| S21 | `sparkPoint` is `[integer, number]` | API-140, golden | | API |
| S22 | `milestone` required keys and types | Every state read | | API |
| S23 | `color` implies `reason`; `done` is not stale or stalled; `red` has a string `needs_me` | Every state read, `expectConsistent` | | API |
| S24 | `mode` implies `total` (3 or more, or 2 or fewer) and the allowed reasons | Every state read, `expectConsistent` | | API |
| S25 | `spark` at most 160 items (`maxItems`) | API-141 | Only 81 points are ever produced; the 159-point bound of api.md 6.9 is never approached | NONE |
| S26 | State `needs_me` is a non-empty string or null | API-150 | | API |

## 3. `contract/cli.md`

**No black-box check exists for the CLI.** The suites drive HTTP directly (`acceptance/` imports nothing
from `cli/`, and the CLI MUST NOT send `Swimcoach-Test-Now`), and none runs the real `swimcoach`
command against production or `swimcoach-test`. Every row below is covered only by `test/cli/*.test.ts`,
which runs the CLI against an in-process fake server. V2 MUST keep this command line, and nothing in the
qualification would notice a V2 CLI that broke it.

| ID | Behavior | Check | Notes | Category |
| --- | --- | --- | --- | --- |
| C01 | Every flag but `--needs-me` is required; every missing flag named in one message; exit 2; a forgotten lane is never zero (2) | `test/cli/usage.test.ts` "names every missing flag in one message", "never defaults a forgotten lane to zero" | | INTERNAL |
| C02 | Number format: `.` decimal, no unit or sign, whole lane counts (`2.0` refused) (2) | `test/cli/usage.test.ts` "refuses %s without sending" (table includes `2.0`, `-1`, `1.5h`) | | INTERNAL |
| C03 | Body validated against `report.schema.json` before sending, the same refusals as the server, nothing sent (2) | `test/cli/usage.test.ts` "refuses an invalid report on standard input" and the `lacks the key` table | | INTERNAL |
| C04 | Empty `--needs-me` refused; names passed through untrimmed (2) | `test/cli/usage.test.ts` "refuses an empty --needs-me"; `test/cli/server.test.ts` "sends needs_me only when given, exactly as typed" | | INTERNAL |
| C05 | `--file` from a path or standard input, BOM accepted; `--file` with field flags is exit 2 (2) | `test/cli/server.test.ts` "sends a --file report unchanged, from a path and from standard input"; `usage.test.ts` "refuses --file combined with field flags, and names them" | | INTERNAL |
| C06 | No field the schema does not define, no timestamp (2) | `test/cli/server.test.ts` "sends one POST /api/2026-11-14/report with the contract's headers and body" | | INTERNAL |
| C07 | `--dry-run` prints the validated body, reads no config, sends nothing (1) | `test/cli/usage.test.ts` "prints the validated body, reads no config and sends nothing" | | INTERNAL |
| C08 | `--json` prints the server's body (1) | `test/cli/server.test.ts` "prints the server's JSON body with --json" | | INTERNAL |
| C09 | `--config` is the only way to another service; `--url` is refused, with or without `=` (1, 5) | `test/cli/usage.test.ts` "refuses --url, with or without an equals sign" | | INTERNAL |
| C10 | `stop` needs both flags and removes the milestone (3) | `test/cli/server.test.ts` "stops a milestone" | | INTERNAL |
| C11 | `stop` of an untracked milestone exits 3, never 0 (3, 4) | `test/cli/server.test.ts` "names the 404 not_tracked answer" | | INTERNAL |
| C12 | `--version`, `help`, `help report`, `help stop`; unknown command refused (1) | `test/cli/usage.test.ts` "prints the version", "prints help %j", "refuses a missing command, an unknown command and an unknown help topic" | | INTERNAL |
| C13 | Success is one capitalized line naming the milestone; errors go to stderr, one sentence per line, with the server's `message` and each `problems` entry (4) | `test/cli/server.test.ts` "prints the server's message and every problems entry"; `server-errors.test.ts` "prints a 500's message and problems before the summary" | | INTERNAL |
| C14 | The token secret is never printed: errors, `--dry-run`, `--json`, a server echo (4) | `test/cli/server.test.ts` "is redacted when a server echoes it back in a message", "is redacted from --json output too"; `usage.test.ts` "is malformed JSON that contains the secret, and the secret stays out of the message" | | INTERNAL |
| C15 | Exit 0 (a duplicate counts) | `test/cli/server.test.ts` "sends one POST ..." | | INTERNAL |
| C16 | Exit 1, the CLI failed unexpectedly (4) | `test/cli/usage.test.ts` "is reported on stderr, not thrown" | Inferred from the title, not opened | INTERNAL |
| C17 | Exit 2, usage or validation (4) | `test/cli/usage.test.ts` | | INTERNAL |
| C18 | Exit 4, any other `4xx` JSON error (4) | `test/cli/server.test.ts` "treats %i %s as exit 4" | | INTERNAL |
| C19 | Exit 5: `401`, `403`, or a redirect to the Access login (4, 6) | `test/cli/server.test.ts` "treats %i as exit 5", "treats a 403 HTML page from Access as exit 5", "does not follow a redirect and exits 5" | | INTERNAL |
| C20 | Exit 6, config missing, unreadable or malformed, or lacking a key (4, 5) | `test/cli/usage.test.ts` "is missing", "is a directory", "lacks the key %s" | | INTERNAL |
| C21 | Exit 7, unreachable, timeout, `5xx` or a non-contract response (4) | `test/cli/server.test.ts` "treats a 5xx as exit 7 and makes exactly one attempt", "treats a refused connection as exit 7", "treats a 200 that is not this contract's JSON as exit 7", "treats a 4xx that is not JSON as exit 7" | | INTERNAL |
| C22 | One attempt, 15-second timeout, no retry (4) | `test/cli/server.test.ts` "treats a 5xx as exit 7 and makes exactly one attempt" | The 15-second timeout value is not seen in a title | INTERNAL |
| C23 | Config file: default path, BOM, unknown keys ignored, no key has a command-line override (5) | `test/cli/server.test.ts` "reads the default config path from the home directory"; `usage.test.ts` "accepts a byte order mark", "holds a url that is not an http address" | Unknown-key tolerance not confirmed by a title | INTERNAL |
| C24 | Dated paths, `Content-Type`, `CF-Access-Client-Id` and `-Secret` headers (6) | `test/cli/server.test.ts` "sends one POST /api/2026-11-14/report with the contract's headers and body" | | INTERNAL |
| C25 | The CLI never follows a redirect (6) | `test/cli/server.test.ts` "does not follow a redirect and exits 5" | | INTERNAL |
| C26 | The CLI never sends `Swimcoach-Test-Now` (6) | None found | Not asserted by any test title I could find | NONE |
| C27 | Works the same in cmd, PowerShell and POSIX shells; names with spaces in double quotes (7) | None | `docs/planning/RESUME.md` lists MVP-06's real run as open; nothing checks a shell | NONE |
| C28 | The CLI against the real service reaches the board: a report posted by the real command shows on the page (1, 6) | None | The one end-to-end path; open item "MVP-06's real reports for a full turn" | NONE |
| C29 | Rules for the agent's push cadence and D3 (8) | None | Binds the agent's instruction text, MVP-06 | NONE |

## 4. `contract/ux-ledger.md`

Of 171 rows, 33 are superseded and 2 retired, so **136 are live** (V1 `Pending`). The Check column was
filled by MVP-11 C and this audit relies on it.

| Check kind | Live rows | Category |
| --- | --- | --- |
| A cited UI case (`browser:`), alone or beside a manual note | 132 | UI |
| Manual only: UX-163, UX-164, UX-166, UX-171 | 4 | MANUAL |

- **UX-163, UX-164:** manual device-check steps, passed on Terry's iPhone 16 Pro on 2026-11-14.
- **UX-166:** manual step 2, plus `test/page/assets.test.ts`, which is an internal test of the embedded
  180 px PNG (not black-box).
- **UX-171:** step 4 passed; **step 8 (four hours or more after last use) is outstanding.**
- Rows with a `browser:` case that Terry also checked by hand: UX-001, UX-115 to UX-119, UX-123,
  UX-126, UX-127, UX-129, UX-141, UX-142, UX-144.
- Rows that name an internal test beside the browser case: UX-139, UX-140, UX-155 (`project.test.ts`).
  The browser case is the check of record.
- **What the UI suite proves.** `acceptance/ui/run.ts` loads the real page from the deployment but
  *answers the page's state polls itself*, so it never writes to the server. Each case proves "given this
  state, the page shows this". Nothing in the suites proves the live server's real state reaches the
  page; the API suite proves the state, the UI suite proves the page, and the join is Terry's phone.
- **What I did not do.** The run's `expectLiveRows` guard confirms every ID a case cites is a live row.
  I did not confirm the inverse for all 132 rows (that every live row is cited by at least one case);
  I relied on the Check column and the 20-row sample below.

### Sample of 20 rows, opened

Each row's cited case was found by its UX ID in the case's `ids` array, and its title matches the Check
cell word for word. I read the title and ID, not each case's assertions.

| Row | Case | Result |
| --- | --- | --- |
| UX-004 | overview-status.ts "Wordmark: "swim" in lane blue, "coach" in lane amber" | Found, matches |
| UX-015 | overview-health.ts "A long outage (1h 05m) shows the word OFFLINE alone and the Status line keeps one row" | Found, matches |
| UX-027 | overview-slots.ts "The 3/6 grid: one to three slots are full, each a third of the area; four or more are half" | Found, matches |
| UX-032 | overview-cards.ts "A Card never changes position when its color changes" | Found, matches |
| UX-043 | overview-cards.ts "Green fill is --ok-fill with pure white text, contrast 7:1 or better, and no second green" | Found, matches |
| UX-048 | overview-keyboard.ts "Two red projects: the blurb lists their names joined by a middle dot" | Found, matches |
| UX-054 | overview-keyboard.ts "Tapping GO TO KEYBOARD opens the first red project's display, which shows its full ask" | Found, matches |
| UX-075 | overview-breath.ts "Under reduced motion nothing breathes and the page does not fade in, even while LIVE" | Found, matches |
| UX-107 | overview-load.ts "If the font is not ready within 3 s, the page reveals anyway" | Found, matches |
| UX-116 | project-nav.ts "Tapping All projects returns to the overview, from any display" | Found, matches |
| UX-120 | project-nav.ts "A swipe right on the overview does nothing: the board does not wrap" | Found, matches |
| UX-127 | overview-alerts.ts "Alerts on: the page jumps to the overview when the new needs-you item arrives" | Found, matches |
| UX-130 | overview-alerts.ts "Alerts off: a new needs-you item plays no chime and does not move the viewer" | Found, matches |
| UX-135 | overview-alerts.ts "A card that arrives after the first render fades in over 0.3 s ease-in; the others are untouched" and "Under reduced motion no card fades in" | Found, matches |
| UX-142 | overview-slots.ts "More than six slots scroll; slot height follows the measured area, so six half slots fit a 625 px area" | Found, matches |
| UX-148 | overview-cards.ts "A silent agent alone keeps the box LIVE and makes its Card gray with Agent silent for, the RTR, and no arrow" | Found, matches |
| UX-154 | overview-health.ts "SIGN IN: Access answers 401 ..." and "... 403 ..." (one template, two cases) | Found, matches |
| UX-156 | overview-health.ts "The page polls every 30 seconds, not sooner" | Found, matches |
| UX-169 | project-lanes.ts "Swimlanes: Ready For Work, In progress and Ready for review, each with count, share and its own bar" | Found, matches |
| UX-170 | overview-slots.ts "Inside a Card at the content minimum: 18 px below the last blurb line, and 15.4 px above the Title line's box" | Found, matches |

20 of 20 found; none missing, none mismatched.

## Gaps that matter

Ranked for what V2 must clear. Each is a finding, not a failure.

1. **The CLI has no black-box check at all (C01 to C29).** V2 MUST keep the command line, and the only
   proof is a set of tests of the MVP's own code against a fake server. No check runs the real command
   against a real deployment (C28), which is also the open "MVP-06's real reports" item. A V2 CLI could
   break the command line unseen. V2 SHOULD get a black-box CLI suite before it replaces the MVP.
2. **`over_budget` is never produced by the server under test (A69).** The UI cases exercise it with
   stub state; no API case drives a `count_and_time` milestone past its cap. V2 could return the wrong
   verdict for decision D1's yellow and pass every suite.
3. **The `stalled` verdict row is weakly proven (A70).** API-125 asserts the flag and that the state
   agrees with the verdict table, never `reason == "stalled"` on its own, and the call of that milestone
   could mask it. Row precedence beyond `done` over red and `silent` over the call (A75) is not isolated.
4. **The Worker's own authentication is unobservable (A11, A88).** Signature, `aud` and `exp` checks are
   tested only inside the MVP (`test/access.test.ts`). Behind Access a black-box request cannot reach
   them. V2 inherits the MUST with no check; a misconfigured Access policy that the Worker fails to
   close would pass the suites.
5. **The page-to-server join is unchecked (section 4).** The UI suite answers its own state. Only Terry's
   phone proves the real state renders.
6. **Test-clock fail-closed (A100) is tested only inside the MVP.** The black-box suite proves the absent
   switch on production only. V2 using another mechanism has no external check that `false`, `0` or an
   empty value fail closed.
7. **Edge coverage the fixtures avoid on purpose:** the `trend_bin` value `up` (A57), the call edges at
   0.70 and 0.30 (A60), the two too-early gates in isolation (A56), the `chance_on_time` floating-point
   limit branches (A59), and spark thinning beyond 160 samples (A79, S25).
8. **Small ones.** `405` on `/` (A18) and the authenticated `GET /` status and type (A17) have no API case;
   the error `message` sentence (S15); `500 internal` (A95); 14-day retention and "never removed
   automatically" (A102, A103); the CLI never sending the test-clock header (C26); sender rules (A42,
   C29).
9. **Open on the ledger:** UX-171 step 8, and Terry's hands-on acceptance (neither is a check).

## Catalog: the 68 API cases

Case ID, file under `acceptance/api/cases/`, tier, and exact title. IDs are never renumbered.

| ID | File | Tier | Title |
| --- | --- | --- | --- |
| API-001 | access.ts | clock-free | Without credentials, /healthz is an authentication failure, not a 200 |
| API-002 | access.ts | clock-free | Without credentials, every route is refused: the page, the state, a report and a stop |
| API-003 | access.ts | clock-free | Without credentials, an unknown path is refused before it can be a 404 |
| API-004 | access.ts | clock-free | With a wrong service-token secret, /healthz, the state, a report and a stop are refused |
| API-005 | access.ts | clock-free | A report refused for its credentials stores nothing |
| API-006 | access.ts | clock-free | GET /healthz answers 200 {ok: true}, JSON, no-store, and ignores a query string |
| API-010 | routing.ts | clock-free | Unversioned /api paths are not aliases: 404 not_found |
| API-011 | routing.ts | clock-free | A date the server does not serve, and an unknown name under the served date, are 404 not_found |
| API-012 | routing.ts | clock-free | Paths are exact: no trailing-slash variant of a route |
| API-013 | routing.ts | clock-free | Paths are exact: /index.html is not an alias of the page |
| API-014 | routing.ts | clock-free | A known path with the wrong method is 405 method_not_allowed with an Allow header |
| API-015 | routing.ts | clock-free | Query parameters are ignored on every route, including the old ?since= |
| API-016 | routing.ts | clock-free | Every /api reply carries Cache-Control: no-store: success, 400, 404, 405, 413 and 415 alike |
| API-020 | validation.ts | clock-free | A write without Content-Type: application/json is 415, before the body is read |
| API-021 | validation.ts | clock-free | A body over 16 KiB is 413 body_too_large, before JSON parse; exactly 16 KiB is not |
| API-022 | validation.ts | clock-free | A body that is not UTF-8 JSON is 400 invalid_json, on a report and on a stop |
| API-023 | validation.ts | clock-free | One leading UTF-8 byte order mark is accepted and ignored; a charset on Content-Type is fine |
| API-024 | validation.ts | clock-free | A report missing any required field, or any lane key, is 400 invalid_report with problems |
| API-025 | validation.ts | clock-free | A value of the wrong type or outside its range is invalid_report, with a problem at its JSON Pointer |
| API-026 | validation.ts | clock-free | Several violations in one body give several problems, one per violation |
| API-027 | validation.ts | clock-free | Unknown fields are refused, at the top level and inside lanes |
| API-028 | validation.ts | clock-free | One report per request: an array, and any other JSON that is not an object, is invalid_report |
| API-029 | validation.ts | clock-free | A malformed stop is 400 invalid_stop with problems, and stops nothing |
| API-030 | validation.ts | clock-free | Stopping a milestone that is not tracked is 404 not_tracked, not a success |
| API-040 | names.ts | clock-free | A project with Unicode whitespace at its end is refused, never trimmed |
| API-041 | names.ts | clock-free | A milestone with whitespace at either end is refused, in a report and in a stop |
| API-042 | names.ts | clock-free | A control character or line break anywhere in a project is refused |
| API-043 | names.ts | clock-free | A control character or line break inside a milestone is refused, in a report and in a stop |
| API-044 | names.ts | clock-free | Whitespace that is not a control character is allowed inside a name, and names are not trimmed |
| API-045 | names.ts | clock-free | Lengths count code points: 64 project and 32 milestone characters pass, one more is refused |
| API-046 | names.ts | clock-free | The numeric limits are inclusive: 0 and 168 active hours, 168 cap hours, 999 cards a lane |
| API-047 | names.ts | clock-free | Names compare ASCII case-insensitively, so the newest spelling wins, and A-Z is the only fold |
| API-048 | names.ts | clock-free | Non-ASCII letters are not case-folded or normalized: e-acute and E-acute, NFC and NFD, are distinct |
| API-049 | names.ts | timed | A project that is empty, or starts with whitespace, is refused, in a report and in a stop |
| API-060 | lifecycle.ts | clock-free | The first report adds the milestone, with first_report_at, updated_at and last_move_at equal |
| API-061 | lifecycle.ts | clock-free | An identical report within 60 s is a duplicate, a changed one is stored, and both refresh updated_at |
| API-062 | lifecycle.ts | clock-free | No cards, or no active hours, stores no sample ('none'), yet the milestone is on the board |
| API-063 | lifecycle.ts | clock-free | The newest report replaces the snapshot, even when active_hours went down |
| API-064 | lifecycle.ts | clock-free | A stop removes the milestone at once; a second stop is 404 not_tracked |
| API-065 | lifecycle.ts | clock-free | After a stop, a new report adds the milestone from scratch: added true, no history |
| API-066 | lifecycle.ts | clock-free | Milestones are listed by project, then milestone, each ASCII-lowercased, whatever the report order |
| API-080 | production.ts | clock-free | Without the test clock, Swimcoach-Test-Now is 400 test_clock_disabled and changes nothing |
| API-100 to API-111 | golden.ts | timed | Golden fixture "<name>": the replay's state matches the fixture's expected metrics, mode, color and reason (`afternoon` 100, `allgreen` 101, `keyboard` 102, `silent` 103, `morning` 104, `stale` 105, `offline` 106, `alldone` 107, `one-story` 108, `zero-progress` 109, `over-cap` 110, `midnight-rollover` 111) |
| API-112 | golden.ts | timed | Golden fixture "midnight-rollover" again, starting 22:40 in the suite machine's time zone |
| API-120 | time.ts | timed | A malformed Swimcoach-Test-Now is 400 invalid_test_clock; a fraction is honored as given |
| API-121 | time.ts | timed | Time never runs backward per milestone: an earlier report is 409 clock_went_backward and changes nothing |
| API-122 | time.ts | timed | The duplicate window is 60 s: 59 s later is a duplicate, 60 s later is stored |
| API-123 | time.ts | timed | last_move_at changes only when a lane count changes, not for hours alone, a heartbeat or a new agent |
| API-124 | time.ts | timed | stale turns true after 25 minutes of silence, never for a done milestone, and wins over the call |
| API-125 | time.ts | timed | stalled turns true after 45 minutes without a lane change, stays a flag in count_and_time mode |
| API-130 | feed.ts | timed | feed is no_data on an empty board, with last_report_at null, and again after the last stop |
| API-131 | feed.ts | timed | feed is idle when every tracked milestone is done, however long ago, and live again when one is not |
| API-132 | feed.ts | timed | feed is live up to 25 minutes after the newest report on the board, and stale after, even if others are older |
| API-140 | feed.ts | timed | spark holds one point per stored sample, oldest first, up to 80 samples |
| API-141 | feed.ts | timed | spark thins past 80 samples: every 2nd of the first n-1, then the newest |
| API-150 | needs-me.ts | timed | needs_me makes the card red and is shown as sent; without it, Needs Terry cards give the server's sentence |
| API-151 | needs-me.ts | timed | needs_me is 1 to 200 characters and follows the name rules; the bad ones are invalid_report at /needs_me |

Tier counts: `clock-free` cases run on production and `swimcoach-test`; `timed` cases (the `full` suite)
run only on `swimcoach-test`.
