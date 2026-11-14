# swimcoach HTTP API

The MVP's HTTP contract, written by MVP-01 A on 2026-11-13. RFC 2119 keywords; the capitals are
load-bearing. V2 MUST reproduce everything in this document. The schemas in [`schemas/`](schemas/) are
its machine-checkable half: where the two disagree, this document wins, and the schema MUST be corrected
in the same commit.

The metric math is defined in [`docs/concept.md` section 4](../docs/concept.md) and, where that text is
silent, by `trend_of()`, `progress()` and `chance_to_finish()` in
[`reference/prototype/server.py`](../reference/prototype/server.py). This document says which inputs feed
that math and what the server returns; it does not restate the formulas.

## 1. Conventions

- **Base URL.** The MVP serves `https://swimcoach.sixbuckssolutions.workers.dev`. V2 MAY use another
  host; every path below is relative to it.
- **Times** are Unix epoch seconds, UTC, as JSON numbers, with an optional fraction. Durations carry
  their unit in the field name (`_hours`, `_minutes`).
- **Request bodies** MUST be UTF-8 JSON with `Content-Type: application/json` (a `charset` parameter is
  allowed). The server MUST accept and ignore one leading UTF-8 byte order mark, because Windows
  PowerShell 5.1 writes one. The server MUST refuse a body over 16 KiB.
- **Responses** from `/api/*` and `/healthz` are UTF-8 JSON and MUST carry `Cache-Control: no-store`.
- **Errors.** Every error the Worker itself returns MUST have the body
  [`errorResponse`](schemas/report.schema.json) (section 8).
- **Query parameters** on any route MUST be ignored. In particular the prototype's `?since=` no longer
  filters anything (section 6.9).
- **Paths are exact.** No trailing-slash variants, no `/index.html` alias.

## 2. Authentication

**Every request to the host MUST be authenticated by Cloudflare Access.** No route is public,
`/healthz` included.

| Caller | How it authenticates |
| --- | --- |
| Terry's phone and browsers | An Access login session (the `CF_Authorization` cookie) |
| The swimcoach CLI | An Access service token, sent as `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers ([`cli.md`](cli.md) section 5) |

- Access, in front of the Worker, turns either credential into a signed `Cf-Access-Jwt-Assertion` header.
- **The Worker MUST verify that header on every request** (signature against the team's published
  keys, `aud` equal to the application's AUD tag, `exp` in the future), and MUST answer `401
  unauthenticated` when it is missing or fails any check. So a misconfigured Access policy fails closed.
- **Senders are trusted.** Any identity Access admits MAY read, report and stop. There is no
  per-sender or per-project authorization: Terry, 2026-11-13, an agent reports only because he told it
  to, and Access proves every sender is his.
- **Bodies are still validated for correctness** (section 4.2). Trust covers who may write, not whether
  a body makes sense.
- Requests without valid Access credentials normally never reach the Worker: Access redirects a
  browser to its login page and answers a bad service token with its own `403`, neither in this
  contract's JSON shape. **A client MUST treat any `401`, any `403`, and any redirect to the Access
  login host as an authentication failure.**

## 3. Routes

| Method | Path | Purpose | Section |
| --- | --- | --- | --- |
| `POST` | `/api/report` | Store one complete status report; the first one for a (project, milestone) adds it | 4 |
| `POST` | `/api/stop` | Stop tracking one (project, milestone) and delete its history | 5 |
| `GET` | `/api/state` | Everything the page renders | 6 |
| `GET` | `/healthz` | Liveness: `200 {"ok": true}` | 7 |
| `GET` | `/` | The page (MVP-08) | 7 |

There is **no create route.** The first report adds a (project, milestone); `POST /api/stop` removes it.
Any other method on these paths MUST get `405 method_not_allowed` with an `Allow` header; any other path
MUST get `404 not_found`.

## 4. `POST /api/report`

### 4.1 Body

One JSON object matching [`report.schema.json`](schemas/report.schema.json). Example:
[`report.fga.json`](schemas/examples/report.fga.json).

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `agent` | `"codex"` or `"claude"` | Yes | Agent framework that sent it |
| `project` | string, 1-64 chars | Yes | Project name, for example `localswim V2`, `FGA` |
| `milestone` | string, 1-32 chars | Yes | Milestone or increment, for example `T06`, `M12` |
| `active_hours` | number, 0 to 168 | Yes | Total active time on the milestone so far. MAY exceed `cap_hours` |
| `cap_hours` | number, over 0, at most 168 | Yes | The milestone's maximum time |
| `lanes` | object | Yes | Story card count per lane: all five keys, integers 0 to 999 |
| `needs_me` | string, 1-200 chars | No | One sentence: what Terry must do. Omit it when there is none |

Lane keys, in board order: `ready_for_work`, `in_progress`, `needs_terry`, `ready_for_review`,
`completed`. **Finished** = `ready_for_review` + `completed`. **Total** = the sum of all five. Backlog and
Blocked are never reported and never appear anywhere in swimcoach.

Rules the schema enforces, stated here so V2 does not have to read JSON Schema to know them:

- **Every update is complete, never incremental.** A body missing any required field or any lane key
  MUST be refused. A missed report then costs only freshness, and a repeated one changes nothing.
- **Unknown fields MUST be refused**, at the top level and inside `lanes`. A misspelled `need_me` or a
  `backlog` lane fails loudly instead of being dropped.
- **A report carries no timestamp.** The server stamps the time it received the report (section 9 covers
  tests).
- **Names** (`project`, `milestone`, `needs_me`) MUST NOT start or end with whitespace and MUST NOT
  contain control characters, line breaks included. The server MUST NOT trim or repair them; it refuses
  them. Both sets are fixed lists of code points, so every engine gives the same verdict:
  - **Whitespace** is every Unicode `White_Space` code point plus U+FEFF, and nothing else: U+0009-U+000D,
    U+0020, U+0085, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF.
    U+FEFF is in the set because it is what a pasted byte order mark leaves behind. A whitespace
    character that is not also in the next list MAY appear inside a name.
  - **Control characters and line breaks** are U+0000-U+001F, U+007F-U+009F, U+2028 and U+2029. They
    MUST NOT appear anywhere in a name.
  - An implementation MUST NOT check either set with a regex `\s` or `\S` class. Engines disagree on
    it: Python's `\s` leaves out U+FEFF, ECMA-262's includes it, and Go's is ASCII-only.
- `needs_me` MUST be omitted rather than sent as `""` or `null`.
- **One report per request.** A JSON array MUST be refused. The CLI sends one milestone at a time, and a
  single object needs no partial-failure rule.
- Lengths count Unicode code points, as JSON Schema's `maxLength` does.
- The 168-hour and 999-card ceilings exist to catch unit mistakes (minutes sent as hours, a whole board
  sent instead of one epic), not to limit real milestones.

### 4.2 Validation

The server MUST validate the whole body before changing anything, and on any failure MUST store nothing
and answer `400 invalid_report` with one `problems` entry per violation found (JSON Pointer `path` plus a
sentence). Example: [`error.invalid-report.json`](schemas/examples/error.invalid-report.json).

Checks run in this order, and the first failing step decides the response: authentication (`401`), path
and method (`404`, `405`), the test clock header (section 9), `Content-Type` (`415`), size (`413`), JSON
parse (`400 invalid_json`), then the schema (`400 invalid_report`).

### 4.3 Identity: which milestone a report belongs to

- **The key is the pair (`project`, `milestone`), compared ASCII case-insensitively**: `A` to `Z` match `a`
  to `z`, and every other character compares exactly. No Unicode case folding or normalization, so every
  implementation agrees. `FGA`/`M12` and `fga`/`m12` are one milestone.
- **The newest report's spelling is the display spelling.**
- A mistyped name makes a separate, stray milestone. That consequence is accepted (Terry, 2026-11-13);
  `POST /api/stop` removes it.

### 4.4 What a report does

On a valid report, received at time `T` (section 9), the server MUST, as one atomic step:

1. **Add the milestone if it is not tracked**, with `first_report_at = T` and `last_move_at = T`. No
   confirmation, no separate create step. The response says `"added": true`.
2. **Replace the milestone's snapshot** with this report's fields, and set `updated_at = T`. The newest
   report always wins, even when `active_hours` went down: each report is the agent's complete picture.
3. **Set `last_move_at = T` when any of the five lane counts differs** from the previous snapshot. A
   change in hours alone is not a move.
4. **Store a sample** `(T, work, clock, finished, total)`, where `work = finished / total` and
   `clock = active_hours / cap_hours`, unless one of these holds:
   - `total` is 0 or `active_hours` is 0: the sample is undefined, so none is stored (`"sample": "none"`),
     as in the prototype's `progress()`.
   - **Duplicate:** the milestone's newest stored sample was received less than 60 seconds before `T`
     and has the same `work`, `clock`, `finished` and `total`. None is stored (`"sample": "duplicate"`).
     Codex and Claude can both work one project, and two agents reporting the same picture MUST NOT
     double the evidence the trend and chance math counts.
   - Otherwise `"sample": "stored"`.

Steps 2 and 3 happen for a duplicate too, so a heartbeat keeps the milestone fresh.

### 4.5 Response

`200` with [`reportResponse`](schemas/report.schema.json):
[`report.response.json`](schemas/examples/report.response.json). `received_at` is `T`; `project` and
`milestone` echo the stored spelling.

### 4.6 Rules for senders

These bind the agent that fills the report in, not the server; [`cli.md`](cli.md) repeats them.

- **Count only this milestone's epic.** The localswim board is cumulative; whole-board counts make RTR
  meaningless (`docs/concept.md` section 5, "Scope trap").
- **Decision D3.** A card goes in `needs_terry`, and `needs_me` is sent, only for a gate waiting on Terry
  himself: visual confirmation, Completed, cutover, a demo. An agent-owned gate (for example an Architect
  release) changes nothing, and a card sitting in Ready for review is not by itself a request.
- **Decision D2** is partly open: see [`README.md`](README.md), "Open for Terry".

## 5. `POST /api/stop`

The last step of a milestone's lifecycle (Terry, 2026-11-13): Terry approves the milestone, every card goes
to Completed, he tells the project's agent it is complete, and the agent stops tracking it.

- **Body:** [`stopRequest`](schemas/report.schema.json), `{"project": ..., "milestone": ...}`, with the
  same name rules and the same ASCII case-insensitive matching as a report. Example:
  [`stop.request.json`](schemas/examples/stop.request.json). A malformed body gets `400 invalid_stop`.
- **Effect:** the server MUST delete the milestone, its samples and its events in one atomic step. It
  disappears from `GET /api/state` at once.
- **Response:** `200` [`stopResponse`](schemas/report.schema.json), echoing the stored spelling.
- **Not tracked:** `404 not_tracked`, and nothing changes. The CLI reports this distinctly, so a mistyped
  stop does not look like success while the real card stays on the phone.
- **After a stop,** a new report for the same pair adds it again from scratch: `"added": true`, no
  history.
- Why `POST` with a body rather than `DELETE /api/projects/<name>` as in the prototype: names contain
  spaces and MAY contain `/`, and a body avoids every percent-encoding question across shells, proxies
  and languages.

## 6. `GET /api/state`

`200` with [`state.schema.json`](schemas/state.schema.json). Every value is computed at the request's
`now` (section 9). Examples: one per mock scenario, `state.<scenario>.json` in
[`schemas/examples/`](schemas/examples/), plus [`state.empty.json`](schemas/examples/state.empty.json)
and [`state.small-blocks.json`](schemas/examples/state.small-blocks.json).

**The server computes every metric and every verdict, and the page SHOULD render from them rather than
recompute them.** That keeps one definition in one place, and it lets the black-box suite (MVP-09) check
RTR, trend, projection, chance, the call and the card color through HTTP alone.

### 6.1 Top level

| Field | Meaning |
| --- | --- |
| `now` | The server's clock for this request |
| `last_report_at` | Newest `updated_at` across tracked milestones; `null` when none |
| `feed` | The server's half of the health box (6.7) |
| `thresholds` | The rule constants in force (6.8) |
| `milestones` | One entry per tracked (project, milestone): one card and one project display each |

### 6.2 Per milestone: stored and counted

| Field | Meaning |
| --- | --- |
| `project`, `milestone`, `agent` | From the newest report. The page titles the card `project + " " + milestone`, for example "FGA T04" |
| `active_hours`, `cap_hours`, `lanes` | From the newest report |
| `needs_me` | The ask the page shows (6.4) |
| `first_report_at` | When the report that added it arrived |
| `updated_at` | When the newest report arrived |
| `last_move_at` | When a report last changed any lane count (section 4.4) |
| `finished`, `total` | `ready_for_review + completed`, and the sum of all five lanes |
| `stale` | Not done, and `now - updated_at > stale_minutes`. The page's "Agent silent" warning |
| `stalled` | Not done, and `now - last_move_at > stall_minutes` |
| `mode`, `color`, `reason` | The card's display verdict (6.5, 6.6) |
| `metrics` | The metric math (6.3) |
| `spark` | The RTR timeline (6.9) |

"Done" in this document means `total > 0` and `finished == total`. The report has no `status` field, so
this is the only way a milestone is done.

### 6.3 `metrics`: the math, computed the same way whatever the card shows

| Field | Rule |
| --- | --- |
| `work` | `finished / total`; `null` when `total` is 0 |
| `clock` | `active_hours / cap_hours`; MAY exceed 1 |
| `rtr` | `work / clock`; `null` when `total` or `clock` is 0 |
| `trend` | The prototype's `trend_of()` over the milestone's stored samples, field for field (`delta`, `minutes`, `pace`, `proj`, `finish`, `recent_done`, `to_go`); `null` while any "too early to call" gate of `docs/concept.md` section 4.6 fails |
| `too_early` | `true` exactly when `trend` is `null` |
| `trend_bin` | From `trend.delta` by the bins of `docs/concept.md` section 4.2: `sharp_up` (>= +0.20), `up` (>= +0.05), `sharp_down` (<= -0.20), `down` (<= -0.05), else `flat`. `null` when `trend` is |
| `projection_hours` | `trend.finish × cap_hours`: the active hours at which the last card lands. `null` when `trend` or `trend.finish` is |
| `chance_on_time` | `chance_to_finish(recent_done, clock span, to_go, 1 - clock)` from section 4.4. `null` when `trend` is |
| `call` | From `chance_on_time` (section 4.5): `on_time` (>= 0.70), `running_late` (<= 0.30), else `toss_up`. `null` when `trend` is |

- The samples are all of the milestone's stored samples, from `first_report_at` on: no day boundary (6.9).
- **Values MUST NOT be rounded** in `metrics`. Consumers compare with a tolerance.
- **`chance_on_time` at the limits.** When the negative binomial's success probability `p` rounds to
  exactly 0 in floating point, `chance_on_time` MUST be 1; when `1 - p` rounds to 0, it MUST be 0.
  These are the mathematical limits. The prototype raises `ValueError` there instead, so an
  implementation ported from it literally would fail at those points (MVP-04 B, PR #9 review).
- `metrics` ignores decision D1 on purpose. A one-story milestone still gets its math, so the golden
  fixtures (MVP-01 B) check one formula everywhere; D1 lives in `mode`, `color` and `reason`.

### 6.4 `needs_me`

The newest report's `needs_me` when it sent one. Otherwise, when `lanes.needs_terry > 0`, the server's
sentence `1 ticket in Needs Terry` or `N tickets in Needs Terry`. Otherwise `null`. Any non-null value
makes the card red.

### 6.5 `mode`: decision D1

- `ratio` when `total >= min_stories_for_rtr` (3): the card shows RTR and its clock hand.
- `count_and_time` when `total < 3`: RTR is nearly binary, so the card shows no RTR and no clock hand,
  only "N of M done" and hours used of the cap.

### 6.6 `color` and `reason`: first match wins

| Order | `color` | `reason` | `ratio` mode | `count_and_time` mode |
| --- | --- | --- | --- | --- |
| 1 | `done` | `done` | Done | Done |
| 2 | `red` | `needs_terry` | `needs_me` is not `null` | Same |
| 3 | `yellow` | `silent` | `stale` | Same |
| 4 | `yellow` | `running_late` | `call` is `running_late` | Does not apply |
| 5 | `yellow` | `over_budget` | Does not apply | `active_hours > cap_hours` |
| 6 | `yellow` | `stalled` | `stalled` | Does not apply |
| 7 | `yellow` | `toss_up` | `call` is `toss_up` | Does not apply |
| 8 | `gray` | `too_early` | `too_early` | Does not apply |
| 9 | `green` | `on_time` | Everything else | Does not apply |
| 10 | `green` | `under_budget` | Does not apply | Everything else |

- `ratio` mode reproduces `facts()` in the approved mock, minus its `status` field, which the report no
  longer has. Checked 2026-11-13: the mock-derived examples give the mock's own color for all 26 cards
  across its seven scenarios, the "Feed went stale" one included.
- `count_and_time` follows D1 as worded ("green while time is under budget, yellow once it runs over,
  red only for Needs Terry"), plus `silent`. Stalled does not apply there: a one-story milestone has
  nothing to move for most of its life.
- Red is reserved for "Terry must act". Backlog and Blocked never appear.

The mock's words for each reason, for MVP-08: `done` "Done"; `needs_terry` the `needs_me` text;
`silent` "Agent silent for 35m"; `running_late` "Running late"; `stalled` "No ticket moved in 52m";
`toss_up` "Toss-up"; `too_early` "Too early to call"; `on_time` "On time". The words for
`over_budget` and `under_budget` are MVP-08's and the UX ledger's call.

### 6.7 `feed`: the health box

Computed at `now`, first match wins:

| `feed` | When |
| --- | --- |
| `no_data` | No milestone is tracked |
| `idle` | Every tracked milestone is done |
| `stale` | `now - last_report_at > stale_minutes` |
| `live` | Otherwise |

OFFLINE is not here: it means the page could not reach this route, so only the page can know it. Between
polls the page MAY age `last_report_at` itself with the same rule, as the mock does.

### 6.8 `thresholds`

| Field | Value | Used for |
| --- | --- | --- |
| `stale_minutes` | 25 | `stale`, `feed` |
| `stall_minutes` | 45 | `stalled` |
| `trend_minutes` | 60 | `trend`'s look-back |
| `min_history_minutes` | 45 | Too-early gate |
| `min_block_used` | 0.15 | Too-early gate |
| `min_stories_for_rtr` | 3 | `mode` (D1) |

All are untuned (`docs/concept.md` section 8 item 2). Changing one is a contract change: this table, the
golden fixtures and the suite move together.

### 6.9 `spark`, ordering and the day boundary

- **`spark`** has one point `[round(ts), round(work / clock, 4)]` per stored sample, oldest first. With
  `n` samples and `step = max(1, floor(n / 80))`, it holds every `step`-th sample of the first `n - 1`,
  starting with the first, then the newest. So it never exceeds 159 points. Rounding ties MAY break
  either way; compare with a tolerance of 1 s and 0.0001.
- **`milestones` order:** by `project`, then `milestone`, each compared after ASCII lowercasing, then by
  code point for exact ties. The page MUST keep this order: a card never changes position, so a color
  change in a known spot is the signal (`docs/concept.md` section 3.2).
- **No day boundary.** A milestone is listed from its first report until it is stopped, and its trend
  uses all its samples. The prototype's `?since=<local midnight>` cut both, which caused the midnight
  rollover defect (`docs/concept.md` section 11) and would contradict the lifecycle; it is gone.

### 6.10 What the mock read, and where it lives now

For MVP-08, which swaps the mock's `fetchState()` for this route:

| Mock field | State field |
| --- | --- |
| `d.projects` | `milestones` |
| `d.stale_minutes`, `d.stall_minutes`, `d.min_history_minutes`, `d.min_block_used` | `thresholds.*` |
| `d.now`, `d.last_report_at` | Same names |
| `p.project` | `project + " " + milestone` |
| `p.source` | `agent` |
| `p.hours_used`, `p.hours_alloc` | `active_hours`, `cap_hours` |
| `p.lanes` (named list), `done_lanes`, `attention_lanes`, `parked_lanes` | `lanes` (five fixed keys); done lanes are `ready_for_review` and `completed`, the attention lane is `needs_terry`, no lane is parked |
| `p.status === 'done'` | `color === 'done'` |
| `p.trend` | `metrics.trend` |
| `facts()`: `ratio`, `dir`, `call`, `chance`, `proj`, `margin`, `level`, `why` | `metrics.rtr`, `metrics.trend_bin`, `metrics.call`, `metrics.chance_on_time`, `metrics.trend.proj`, `cap_hours - metrics.projection_hours`, `color`, `reason` |
| `p.needs_me`, `p.stale`, `p.updated_at`, `p.last_move_at`, `p.spark` | Same names |
| `p.tldr`, `p.block_start`, `p.block_end`, `p.cards`, `d.events` | Gone: the report no longer carries them, and the page never showed events |

Lane labels on the page, from the localswim board: Ready For Work, In progress, Needs Terry, Ready for
review, Completed. Completed is new to the page: the mock's boards had no such lane.

## 7. `GET /healthz` and `GET /`

- `GET /healthz` MUST answer `200 {"ok": true}` when the Worker runs. It is authenticated like everything
  else.
- `GET /` serves the page. Its look and behavior are `docs/concept.md` sections 3 and 13,
  `docs/brand.md` and the UX ledger, not this document.

## 8. Errors

Every error body is [`errorResponse`](schemas/report.schema.json): `{"ok": false, "error": <code>,
"message": <sentence>}`, plus `problems` for the two `invalid_*` codes. Clients MUST branch on `error`,
never on `message`.

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_json` | The body is not UTF-8 JSON |
| 400 | `invalid_report` | The body breaks `report.schema.json`; nothing was stored |
| 400 | `invalid_stop` | The body breaks `stopRequest` |
| 400 | `test_clock_disabled` | A `Swimcoach-Test-Now` header reached a deployment without the test clock (section 9) |
| 400 | `invalid_test_clock` | The `Swimcoach-Test-Now` value is malformed |
| 401 | `unauthenticated` | No valid `Cf-Access-Jwt-Assertion` |
| 404 | `not_found` | Unknown path |
| 404 | `not_tracked` | `POST /api/stop` for a milestone that is not tracked |
| 405 | `method_not_allowed` | Known path, wrong method; an `Allow` header lists the right one |
| 409 | `clock_went_backward` | A report's time is earlier than the milestone's `updated_at` (section 9) |
| 413 | `body_too_large` | Body over 16 KiB |
| 415 | `unsupported_media_type` | A write without `Content-Type: application/json` |
| 500 | `internal` | Anything else; the request MUST have changed nothing |

## 9. Time control for tests

**Decision: a per-request test clock header, honored only by a deployment that has the test clock
switched on.**

- **Header:** `Swimcoach-Test-Now: <epoch seconds>`, matching `^[0-9]{1,12}(\.[0-9]{1,6})?$`, for
  example `Swimcoach-Test-Now: 1794573043.25`.
- **On a test deployment,** the header's value replaces the server clock for that one request and for
  nothing else: it becomes `T` for a report (`received_at`, `updated_at`, the sample time) and `now` for
  `GET /api/state` (`stale`, `stalled`, `feed`, retention). A request without the header uses the real
  clock.
- **On a production deployment,** any request carrying the header MUST get `400 test_clock_disabled`
  and MUST change nothing. A suite pointed at production by mistake then fails at its first request
  instead of writing history stamped at the wrong time.
- **Time MUST NOT run backward per milestone.** A report whose `T` is earlier than that milestone's
  `updated_at` MUST get `409 clock_went_backward` and change nothing. With the real clock this cannot
  happen in practice; with the header it catches a suite replaying samples out of order.
- **The switch MUST fail closed.** Exactly one specific value of the deployment's switch turns the test
  clock on, and the implementation MUST compare the switch to that one value exactly. An absent switch,
  an empty value and every other value (`false`, `0`, `off` and a padded copy of the enabling value
  included) MUST mean the production behavior: `400 test_clock_disabled`. The reason: a natural check
  such as `if (env.X)` treats the string `"false"` or `"0"` as on.
- **The production deployment's configuration MUST NOT define the switch at all,** so no value there can
  turn the test clock on.
- **The switch's name and its one enabling value are the implementation's business.** The MVP uses a
  Worker variable that only a separate test Worker (MVP-09) defines. V2 MAY use another mechanism, and
  it MUST fail closed in the same way.

**Why this one.** It keeps the report free of timestamps, as the frozen vocabulary requires. It is
stateless: each request carries its own time, so there is no shared clock to set, reset or leave behind,
and a crashed run cannot strand the server in the past. The same build serves production and tests; one
setting differs. And V2 implements one header, so the black-box suite runs against it unchanged.

**Rejected:**

- **A timestamp in the report** (the prototype's `at`). The frozen vocabulary forbids it, and it lets any
  caller backdate history in production (`docs/concept.md` section 8 item 9).
- **A settable server clock** (`POST /api/test/clock`). Shared mutable state that every later request
  depends on, a route that must never exist in production, and a reset problem after a failed run.
- **Faking time inside the code** (an injected clock in unit tests). Not black-box: V2 could not reuse
  it, which is the whole point of MVP-09.

**Consequences for MVP-09 and MVP-12.**

- The timed cases (every golden fixture, staleness, stalls, the health states) MUST run against a test
  deployment. For the MVP that is a second Worker with its own Durable Object, created with the local
  token (the CI token cannot create Workers; `docs/planning/RESUME.md` risk 3). It sits behind Access
  like everything else.
- Against production the suite can run only its clock-free cases: authentication, validation, the
  lifecycle and the response shapes. Those still create milestones Terry's phone can see for a moment,
  so they MUST use an unmistakable project name and stop it at the end. The stories' "passes against
  production" means that subset; see [`README.md`](README.md), "For the Lead".
- A suite run MUST start by stopping every milestone the test deployment lists, through `POST /api/stop`.
  That is the only reset, and it needs no special route.

## 10. Retention

- Samples and events older than 14 days, measured on the same clock as section 9, MAY be deleted. Trend
  and `spark` then use what remains.
- **A tracked milestone is never removed automatically.** Only `POST /api/stop` removes it.
