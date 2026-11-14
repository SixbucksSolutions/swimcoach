# T3 frozen interfaces

Written by the Lead on 2026-11-13, before dispatch, per relay rule 1 in
[`mvp-staffing-plan.md`](mvp-staffing-plan.md). RFC 2119 keywords; the capitals are load-bearing.
Where this page and `contract/` disagree, the contract wins.

Every author works in its own git worktree on branch `t3/mvp-<NN>-<letter>` cut from `mvp/integration`,
opens a pull request into `mvp/integration`, and MUST NOT merge it (relay rule 7). Each author owns only
its listed files. `npm run check` MUST pass; it fails on any Biome error, warning or info.

Shared, already merged or in review: `src/contract.ts` (types), `src/ingest/validate.ts`
(`validateReport`, `validateStop`, `Problem`), `src/board/board.ts` (`Board` RPC: `report`, `stop`,
`snapshot`), `src/metrics/` (`computeMetrics`, `cardVerdict`, `sparkOf`, `needsMeOf`, `isDone`,
`finishedOf`, `totalOf`), and the Lead's `src/http.ts` (PR #17: `errorResponse`, `jsonResponse`,
`readJsonBody`, `requestTime`, `boardStub`, `NO_STORE`). Route code MUST build every response with
`src/http.ts`.

## MVP-06 A: the swimcoach CLI client (Sonnet 5.5 / medium)

Owns `cli/`, `bin/swimcoach.cmd`, `test/cli/`, and narrow edits to `vitest.config.ts` (a Node test
project for `test/cli/**`) and `biome.jsonc` (an override for `cli/**` turning off `noNodejsModules`,
with its reason).

- Implements `contract/cli.md` exactly: `report` (flags or `--file`), `stop`, `--version`, `help`,
  `--dry-run`, `--json`, `--config`, exit codes 0-7, no `--url`, no redirects followed, one attempt with
  a 15-second timeout, never prints the secret.
- TypeScript run directly by Node 26's type stripping: `node cli/swimcoach.ts`. No build step. Erasable
  TypeScript only (no enums, no namespaces, no parameter properties).
- Validation MUST reuse `validateReport` and `validateStop` from `src/ingest/validate.ts`, so the CLI
  refuses exactly what the server refuses.
- `bin/swimcoach.cmd` runs `node "%~dp0..\cli\swimcoach.ts" %*`. Agents call it by its absolute path,
  `C:\Projects\swimcoach\bin\swimcoach.cmd`, so nobody edits `PATH` (an environment variable).
- Tests run under Node against a local mock HTTP server: every exit code, the redirect refusal, the
  secret never in any output stream, `--dry-run` reading no config.

## MVP-06 B: the agents' reporting instructions (Sonnet 5.5 / medium)

Owns `docs/agents/swimcoach-reporting.md` and `docs/agents/README.md`.

- The text a project's agent follows in Codex and in Claude: when to push (milestone start, every card
  move, a heartbeat at least every 10 minutes while working), the exact command lines from
  `contract/cli.md` section 7 using the absolute path above, the D3 rule for `needs_terry` and
  `--needs-me`, what each exit code means for the agent, and `stop` only after Terry says the milestone
  is complete.
- Replaces `reference/prototype/AGENT_PROMPT.md` for real use; the prototype file stays as reference.
- Setup for Terry: nothing to install beyond Node 26; `cli.json` already exists.

## MVP-07 A: `GET /api/state` (Sonnet 5.5 / medium)

Owns `src/routes/state.ts` and `test/routes/state.test.ts`.

- `export function stateBody(snapshot: BoardSnapshot, now: EpochSeconds): unknown` builds the body of
  `contract/api.md` section 6 from `Board.snapshot()`: per milestone `metrics`, `mode`, `color`,
  `reason`, `needs_me`, `stale`, `stalled`, `spark`, plus `now`, `last_report_at`, `feed`, `thresholds`
  and the 6.9 order.
- `export async function handleState(env: Env, now: EpochSeconds): Promise<Response>` calls
  `boardStub(env).snapshot()` and answers with `jsonResponse`.
- The body MUST validate against `contract/schemas/state.schema.json`. Ajv cannot run in Workers; prove
  it in tests with a validator that runs there (a dev dependency such as `@cfworker/json-schema`) and
  against the `state.*.json` examples where a snapshot can reproduce them.

## MVP-07 B: `POST /api/report` and `POST /api/stop` (Sonnet 5.5 / medium)

Owns `src/routes/report.ts`, `src/routes/stop.ts`, `test/routes/report.test.ts`,
`test/routes/stop.test.ts`.

- `export async function handleReport(request: Request, env: Env, now: EpochSeconds): Promise<Response>`
  and `handleStop` with the same signature, per `contract/api.md` sections 4, 5 and 8: `readJsonBody`,
  then `validateReport` / `validateStop` (400 with `problems`), then the Board RPC, then 200
  `reportResponse` / `stopResponse`, `409 clock_went_backward`, `404 not_tracked`.
- Responses MUST validate against the schemas in `contract/schemas/report.schema.json`.

## The Lead, after the four merge

Wires the routes into `src/index.ts`: Access first, then `requestTime`, then route by exact path with
`405 method_not_allowed` (and `Allow`) and `404 not_found`, and logs `access.why` on a refusal.
