# swimcoach contract

Everything the swimcoach MVP does that V2 MUST reproduce, kept outside the MVP's code. RFC 2119
keywords; the capitals are load-bearing. Why this folder exists: `docs/concept.md` section 14. The MVP's
code is throwaway; this folder is not.

## Index

| File | What it fixes | Owner |
| --- | --- | --- |
| [`api.md`](api.md) | The HTTP contract: routes, auth, validation, the lifecycle, every state field and how it is computed, errors, time control for tests | MVP-01 A |
| [`cli.md`](cli.md) | The `swimcoach` command line agents run: `report`, `stop`, output, exit codes, the token file | MVP-01 A |
| [`schemas/report.schema.json`](schemas/report.schema.json) | The report body, plus in `$defs` the stop body, both write responses and the error body | MVP-01 A |
| [`schemas/state.schema.json`](schemas/state.schema.json) | The `GET /api/2026-11-14/state` body | MVP-01 A |
| [`schemas/examples/`](schemas/examples/) | Example bodies; every one MUST validate | MVP-01 A |
| `fixtures/` | Golden metric fixtures | MVP-01 B |
| `ux-ledger.md` | Every screen state and transition | MVP-01 C |

Both schemas are JSON Schema 2020-12. Their `$id`s are their raw GitHub URLs, so `state.schema.json`
reaches the shared definitions as `report.schema.json#/$defs/...`.

## Examples and the schema each one validates against

| Example | Schema |
| --- | --- |
| `report.*.json` (not `report.response.json`) | `report.schema.json` |
| `report.response.json` | `report.schema.json#/$defs/reportResponse` |
| `stop.request.json` | `report.schema.json#/$defs/stopRequest` |
| `stop.response.json` | `report.schema.json#/$defs/stopResponse` |
| `error.*.json` | `report.schema.json#/$defs/errorResponse` |
| `state.*.json` | `state.schema.json` |

- `state.afternoon`, `allgreen`, `keyboard`, `silent`, `morning`, `alldone` and `stale` are the approved
  mock's own scenarios (`mocks/index.html`, between the `SCENARIOS` markers), converted to this
  contract's shape on 2026-11-13. `stale` is the mock's "Feed went stale": the afternoon seen 35 minutes
  later. Each card's `color` was checked against the mock's own `facts()` rules: 26 cards, no mismatch.
- The conversion split the mock's names into (project, milestone): `FGA T04` became `FGA`/`T04`, and
  names with no milestone got one (`auth-refresh` became `auth-refresh`/`M3`). It mapped the mock's
  sender `claude-code` to `claude`, dropped the mock's Backlog and Blocked lanes, and set `completed`
  to 0, a lane the mock's data never had.
- The mock's "Board unreachable" scenario has no state body: OFFLINE means the page got no response.
- `state.small-blocks.json` covers decision D1, which no mock scenario reaches: one milestone under its
  cap (green) and one over it (yellow, though also stalled). Its `metrics` come from the prototype's
  `trend_of()`.
- `state.empty.json` is the `no_data` board.

### How the examples were validated

On 2026-11-13, with Python `jsonschema` (`uv run --no-project --with jsonschema`) and a `referencing`
registry holding both schemas under their `$id`s:

- Both schemas passed `Draft202012Validator.check_schema`.
- All 17 examples validated against the schema in the table above.
- **The schemas were shown to fail:** 23 deliberately broken bodies were each refused. Among them: a
  report missing `lanes.completed`, missing `cap_hours`, with a `backlog` lane, with `estimate_hours`,
  with a timestamp, with agent `claude-code`, with an empty `needs_me`, with `cap_hours` 240 (minutes by
  mistake), with a trailing newline in a name, and sent as an array; and a state with a red card that has
  no ask, `too_early: false` beside a null trend, `count_and_time` on a six-card milestone, a Backlog
  lane, and `no_data` beside tracked milestones.
- The name pattern was rewritten once during that run. Python's `$` also matches before a final newline,
  so `"FGA\n"` passed Python's validator where an ECMA-262 engine (the Worker's) would refuse it. The
  control-character ban became a separate unanchored `not` pattern.
- **The name pattern was rewritten again after review 1 of PR #5.** The two engines still disagreed:
  ECMA-262's `.` refuses U+2028 and U+2029 where Python's accepts them, and both accepted U+0085 (NEL)
  and the other C1 controls. The `not` pattern is now `[\u0000-\u001f\u007f-\u009f\u2028\u2029]`: every
  C0 control, U+007F, every C1 control, and the two separators. The anchored pattern's `.` then never
  meets a character the engines read differently. Checked on 2026-11-13 in both Python `jsonschema` and
  Ajv 8.20.0 (`ajv/dist/2020`, `u` flag, node 26.13.0): each accepted five good names (`FGA`,
  `localswim V2`, `a/b`, an accented name, `x`) and refused all 201 bad ones, the 67 code points above at
  the start, middle and end of a name. Against the previous pattern, each engine accepted 96 of the 201,
  and not the same 96. All 17 examples validated again in both engines.
- **The name pattern was rewritten a third time after review 2 of PR #5.** The edge-whitespace half
  used `\S`, and engines disagree on what `\s` means: Python accepted U+FEFF at a name's start or end
  where Ajv refused it, and Go's ASCII-only `\s` accepted U+00A0, U+2003, U+3000 and U+FEFF there.
  The anchored pattern is now `^[^W](?:.*[^W])?$`, where `W` is the set `api.md` 4.1 lists, written
  as `\u` escapes: every Unicode `White_Space` code point (U+0009-U+000D, U+0020, U+0085, U+00A0,
  U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000) plus U+FEFF. The `not` pattern is
  unchanged. Checked on 2026-11-13 by a sweep of every non-surrogate BMP code point plus U+10000, U+1F600, U+E0001 and U+10FFFF, each at the start, middle and end of a name
  and alone (253,968 names), in Python `jsonschema`, Ajv 8.20.0 (`ajv/dist/2020`, `u` flag, node
  26.13.0) and Go 1.27.3 `regexp` (the schema's two patterns, with each `\uXXXX` written as
  `\x{XXXX}`). All three gave identical verdicts: 322 names refused, which are the 67 control and
  separator code points in every position and the other 18 whitespace code points at an edge or alone.
  Python and Ajv also accepted the 2,048 lone surrogates in every position; a Go string cannot hold one.
  **The sweep was shown to fail:** against the previous pattern, every pair of engines disagreed.
  Python and Ajv differed on 3 names (U+FEFF), Python and Go on 48, and Ajv and Go on 51. All 17
  examples validated again in both Python and Ajv.

## What V2 MUST reproduce

- **Every route, field, rule, status code and error code in [`api.md`](api.md)**, and bodies that
  validate against both schemas.
- **The command line in [`cli.md`](cli.md)**: flags, exit codes and the config file, so no agent's
  instructions change.
- **The test clock header** (`api.md` section 9), so the black-box suite runs against V2 unchanged.
- Not the MVP's storage layout, language, host or code.

## Decided in this contract

Each of these was a judgment call the stories left open. The reasons are in the section named.

| Decision | Where | Short reason |
| --- | --- | --- |
| Tests control time with a per-request `Swimcoach-Test-Now` header, honored only by a test deployment; production refuses it. The switch fails closed, and production does not define it | `api.md` 9 | Keeps the report timestamp-free; stateless; same build in both places; V2 implements one header |
| The server returns every metric and verdict (`metrics`, `mode`, `color`, `reason`, `feed`) in `GET /api/2026-11-14/state` | `api.md` 6 | One definition in one place, and the black-box suite can check the math through HTTP alone |
| `metrics` is pure math and ignores D1; D1 lives in `mode`, `color` and `reason` | `api.md` 6.3, 6.5 | The golden fixtures check one formula everywhere |
| D1 cards turn yellow for `over_budget` only (and gray for `silent`, since API 2026-11-14), not for stalled | `api.md` 6.6 | D1's own words, plus the silent-feed rule; a one-story milestone has nothing to move for hours |
| A done milestone is `total > 0` and every card finished | `api.md` 6.2 | The report has no `status` field any more |
| Project and milestone match ASCII case-insensitively; the newest spelling displays | `api.md` 4.3 | Catches `fga`/`FGA` strays; ASCII-only folding gives every language the same answer |
| Names with edge whitespace or control characters are refused, never trimmed; both sets are fixed code point lists, never a regex `\s` | `api.md` 4.1 | The server never silently changes a key, and every engine agrees on which names are refused |
| Unknown fields are refused | `api.md` 4.1 | A misspelled optional field fails loudly instead of vanishing |
| One report per request; arrays refused | `api.md` 4.1 | The CLI sends one; no partial-failure rule needed |
| A duplicate is the same sample within 60 s, and it stores nothing | `api.md` 4.4 | Codex and Claude on one project must not double the evidence; a 10-minute heartbeat still stores |
| Stop is `POST /api/2026-11-14/stop` with a JSON body | `api.md` 5 | Names have spaces and MAY have `/`; a body avoids percent-encoding across shells |
| Stopping an untracked milestone is `404 not_tracked`, CLI exit 3 | `api.md` 5, `cli.md` 3 | A mistyped stop must not pass for success |
| No day boundary: a milestone shows from first report to stop, and its trend uses all its samples | `api.md` 6.9 | The lifecycle says only stop removes a card; it also fixes the midnight rollover defect |
| `tldr`, `cards`, `block`, `events` and lane overrides are gone | `api.md` 6.10 | The frozen report carries none of them, and the page showed no events |
| The CLI reads URL and token from `%USERPROFILE%\.secrets\swimcoach\cli.json`, and has no `--url` | `cli.md` 5 | Terry's files-not-environment rule; secrets stay out of argv; the secret only goes to the URL beside it |

## Open for Terry

1. **D2 and `estimate_hours`.** Decision D2 (2026-11-13) said the report contract "accepts an optional
   per-ticket `estimate_hours`, so switching later needs no agent change". The report frozen the same day
   carries **counts only**: there are no per-ticket entries for an estimate to sit on. This contract
   **leaves `estimate_hours` out**, and a report that sends it is refused as an unknown field. Weighting
   RTR by estimate later would need a contract change and a CLI change. Terry's options: accept counts
   only and retire that half of D2; or add an optional per-lane hours figure (for example
   `lane_hours.ready_for_work`) that the server ignores for now; or bring back a per-ticket list.

## For the Lead

Points that touch other T1 authors or later stories. Not decided here.

1. **Fixture keys agree with this contract.** The frozen fixture format's example has `"call":
   "green"`, a card color. MVP-01 B's fixtures (checked 2026-11-13, `fixtures/README.md`) use `call` for
   the verdict, add `color`, and define `projection_hours` as `finish × cap_hours`, `too_early` as "no
   trend", and `work`, `clock`, `finished`, `total`, `trend` and `stalled` with this contract's names. So
   MVP-09 can compare fixture keys to state keys one for one. The frozen example in
   `docs/planning/t1-interfaces.md` SHOULD be corrected.
2. **One fixture `color` is not this contract's color.** B measures `color` with the prototype's page
   rules at the newest report's arrival. For `one-story` that gives yellow (`toss_up`), while this
   contract gives `count_and_time` and green `under_budget`, per D1. The `metrics` agree. MVP-09 MUST
   check `color` against this contract, not against that one fixture value; B flags the same point.
3. **The stories' `GET /api/state?since=`** (MVP-07) is gone: query parameters are ignored, and there is
   no day boundary. MVP-07's text SHOULD be updated.
4. **MVP-03's "arrays of reports; lane overrides"** no longer apply: one report per request, and the five
   lane keys are fixed.
5. **MVP-09 and MVP-12 "against production"** can hold only for the suite's clock-free cases. The timed
   cases need a test Worker with the test clock on, created with the local token (RESUME risk 3), and a
   second Durable Object. That is an account change Terry approves.
6. **A repository check for this folder.** The validation above ran from a throwaway script. A
   `contract/tools/validate-examples.py` in the gate would keep the examples honest as the schemas change,
   and a second, ECMA-262 validator (Ajv, which the Worker will likely use) would catch engine differences
   like the `$` one. Neither file is MVP-01 A's to write.
