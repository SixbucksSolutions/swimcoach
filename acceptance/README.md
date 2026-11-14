# API acceptance suite

RFC 2119 keywords; the capitals are load-bearing. The suite is black box: it speaks HTTP to a running
swimcoach and checks every answer against [`contract/`](../contract/). It imports nothing from `src/`,
`cli/`, `test/` or `public/` (a Biome rule enforces it), so V2 runs it unchanged. Design and decisions:
`docs/planning/t4-interfaces.md`, "MVP-09".

It is its own npm package, like `cli/`. The root `postinstall` runs `npm ci --prefix acceptance`, so
`npm ci` at the root installs it. It is never part of `npm test`: it needs a network and an Access token.
Its own selftest, which needs neither, runs in `npm run check`.

## Run

```
node acceptance/api/run.ts --config <file> --suite clock-free|full
```

Both flags are required. There is no default config and no `--url`.

| Flag                 | Meaning                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--config <file>`    | A JSON file shaped like the CLI's config ([`contract/cli.md`](../contract/cli.md) section 5): `url`, `access_client_id`, `access_client_secret`. The secret goes only to the `url` beside it |
| `--suite clock-free` | Cases that send no `Swimcoach-Test-Now` header. MAY run against production                                                                                                                   |
| `--suite full`       | Every case. Needs a test deployment with the test clock on                                                                                                                                   |

Production uses `cli.json`. The test deployment uses `cli-test.json` beside it, which Terry makes by
copying `cli.json` and changing `url`. An agent MUST NOT read or copy either file's values.

`--cases <module>` also exists, for the selftest only. It defaults to `api/cases/index.ts`.

### What each tier does

- **`clock-free`** registers only the clock-free cases. It writes only projects named `zz acceptance
  <runId>`, never sends `needs_me`, never reports a Needs Terry card (a red card chimes and jumps Terry's
  phone), and ends by stopping any `zz acceptance` milestone still listed. The harness refuses anything
  else before it leaves (`api/guard.ts`), so a bad case fails and touches nothing.
- **`full`** registers every case. It starts by probing the test clock and stopping every milestone the
  deployment lists ([`contract/api.md`](../contract/api.md) section 9). A deployment that answers `400
  test_clock_disabled` to a timed request FAILS the run; it never skips.

Exit status is `node:test`'s: non-zero when any case fails.

## Files

| File               | Job                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `api/types.ts`     | The frozen case format. Written by the Lead; not edited here                                |
| `api/run.ts`       | Parses the flags, loads the config, registers the cases                                     |
| `api/config.ts`    | Reads the config file; errors name keys and paths, never values                             |
| `api/transport.ts` | The one HTTP request: Access headers, test clock header, `redirect: "manual"`               |
| `api/guard.ts`     | The clock-free tier's production rules                                                      |
| `api/harness.ts`   | `createHarness`: `report`, `stop`, `state`, `replay`, the opening reset and the cleanup     |
| `api/runner.ts`    | Turns cases into sequential `node:test` tests                                               |
| `api/schema.ts`    | `expectSchema` over `contract/schemas`, with Ajv (2020 dialect)                             |
| `api/compare.ts`   | `expectClose`: numbers within 1e-9, everything else exact                                   |
| `api/fixtures.ts`  | Loads `contract/fixtures/*.json`                                                            |
| `api/selftest/`    | Proves the harness against a local `node:http` stub. `npm run selftest --prefix acceptance` |
| `api/cases/`       | The cases themselves (MVP-09 B)                                                             |

## Writing a case

A case is `{ id, title, tier, cites, run(h) }` ([`api/types.ts`](api/types.ts)). Notes the harness adds:

- `h.report`, `h.stop` and `h.state` take an optional `at` (epoch seconds), sent as `Swimcoach-Test-Now`.
  A `clock-free` run throws on any `at`.
- `h.state()` asserts `200`, `Cache-Control: no-store` and `state.schema.json`, then returns the body.
- `h.replay(fixture, project, milestone, startAt)` sends each sample at `startAt + at_hours * 3600` and
  returns the last time. Every time MUST stay within 7 days before the real time, so the Board's 14-day
  prune never reaches suite data.
- `h.expectClose(actual, expected, path)` walks the EXPECTED side's keys, so a state milestone with more
  keys than a fixture names still matches.
- In `clock-free`, a project name MUST start with `zz acceptance` (case-insensitive), so put any odd
  characters after the prefix. A case that needs `needs_me` or a Needs Terry card MUST be `timed`.
- Each case stops what it created in a `finally`.

## Not covered

The 14-day retention. It is an alarm on the real clock, and `contract/api.md` section 10 says MAY.
