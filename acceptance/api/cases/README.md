# API acceptance cases

MVP-09 B. Black-box cases in the frozen format of `../types.ts`; the harness (MVP-09 A) registers
them. They import nothing from `src/`, `cli/`, `test/` or `public/`, and read `contract/` as data.
RFC 2119 keywords; the capitals are load-bearing.

| IDs | File | Tier | Covers |
| --- | --- | --- | --- |
| API-001 to 006 | `access.ts` | clock-free | Access refusals, `/healthz` |
| API-010 to 016 | `routing.ts` | clock-free | 404, 405 with `Allow`, query strings, `no-store` |
| API-020 to 030 | `validation.ts` | clock-free | 415, 413, `invalid_json`, `invalid_report`, `invalid_stop`, BOM |
| API-040 to 048 | `names.ts` | clock-free | Name rules, code-point lengths, limits, ASCII identity |
| API-049 | `names.ts` | timed | Names with no `zz acceptance` prefix |
| API-060 to 066 | `lifecycle.ts` | clock-free | Add, duplicate, none, replace, stop, re-add, order |
| API-080 | `production.ts` | clock-free | `test_clock_disabled` (a no-op in the `full` tier) |
| API-100 to 112 | `golden.ts` | timed | Every `contract/fixtures/*.json`; `midnight-rollover` twice |
| API-120 to 125 | `time.ts` | timed | Test clock, 409, 60 s window, `last_move_at`, stale, stalled |
| API-130 to 141 | `feed.ts` | timed | `feed` states, `spark` thinning |
| API-150 to 151 | `needs-me.ts` | timed | `needs_me` and the Needs Terry sentence |

A fixture added to `contract/fixtures/` without a line in `golden.ts` stops the suite from loading.

## Not covered

- **The 14-day retention** (api.md 10 is MAY). It is an alarm on the real clock; every timed request
  here stays within 7 days of real time so the prune never reaches suite data.
- **The 500 `internal` error**, which no request can provoke.
- **Access's own refusal pages**: the cases accept 401, 403 or a redirect with a `Location`.

## Running notes

- `API-001` to `006` need a harness that can send no credentials and a wrong secret.
- A timed case sends times with up to 6 fraction digits (`at_hours` is not whole seconds).
- `API-061` assumes back-to-back requests land within 60 s; rerun if the network stalled.
- The `full` tier stops every milestone on the test deployment in `feed.ts` and `needs-me.ts`.
