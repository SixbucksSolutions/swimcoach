# T1 frozen interfaces

Written by the Lead on 2026-11-13, before dispatch, per relay rule 1 in
[`mvp-staffing-plan.md`](mvp-staffing-plan.md). RFC 2119 keywords; the capitals are load-bearing.
Each T1 author owns only the files listed for it. An author MUST NOT write any other file, and MUST NOT
commit, push or deploy: the Lead integrates, commits and pushes.

## Shared vocabulary (MVP-01 A and B both use these exact names)

The report a project agent sends is a complete picture of one (project, milestone). Field names:

| Field | Type | Meaning |
| --- | --- | --- |
| `agent` | `"codex"` or `"claude"` | Agent framework that sent it |
| `project` | string, 1-64 chars | Project name, for example `localswim V2`, `FGA` |
| `milestone` | string, 1-32 chars | Milestone or increment, for example `T06`, `M12` |
| `active_hours` | number, >= 0 | Total active time on the milestone so far |
| `cap_hours` | number, > 0 | The milestone's maximum time |
| `lanes` | object | Story card count per lane, all five keys required, integers >= 0 |
| `needs_me` | string, optional | One sentence: what Terry must do |

Lane keys, in board order: `ready_for_work`, `in_progress`, `needs_terry`, `ready_for_review`,
`completed`. Finished = `ready_for_review` + `completed`. Total = the sum of all five.

The server stamps receive time; a report carries no timestamp. Server-side time control for tests is
MVP-01 A's design call (RESUME.md risk 3), and A MUST write the choice down in the contract.

## MVP-01 A: HTTP contract, CLI command line, schemas (Opus 5.5 / high)

Owns:

- `contract/README.md`: index of the contract and what V2 must reproduce
- `contract/api.md`: `POST /api/report`, `GET /api/state`, the stop-tracking route, errors, auth
- `contract/cli.md`: the swimcoach CLI's command line: report, stop, exit codes, token file location
- `contract/schemas/report.schema.json`, `contract/schemas/state.schema.json` (JSON Schema 2020-12)
- `contract/schemas/examples/`: example bodies that MUST validate

## MVP-01 B: golden metric fixtures (Opus 5.5 / high)

Owns:

- `contract/fixtures/*.json`: one file per scenario
- `contract/fixtures/README.md`: the format and how the expected values were produced
- `contract/tools/make-fixtures.py`: generates the expected values by calling the prototype's own math
  in `reference/prototype/server.py`; fully type-hinted, `ruff` and `pyright` clean

Fixture format (frozen):

```json
{
  "name": "steady-green",
  "description": "One sentence",
  "cap_hours": 4.0,
  "samples": [
    { "at_hours": 0.5, "active_hours": 0.5,
      "lanes": { "ready_for_work": 6, "in_progress": 1, "needs_terry": 0, "ready_for_review": 1, "completed": 0 } }
  ],
  "expected": { "rtr": 1.0, "trend_bin": "flat", "projection_hours": 4.0, "chance_on_time": 0.5,
                "call": "on_time", "color": "green", "too_early": false }
}
```

`at_hours` is wall-clock time since the milestone's first report. B MAY add `expected` keys the
prototype computes, and MUST say so in the README. Scenarios: the mock's eight plus one-story
milestone, zero progress, over the cap, and midnight rollover.

## MVP-01 C: UX ledger skeleton (Sonnet 5.5 / medium)

Owns `contract/ux-ledger.md` only: every screen state and transition, one row each, keyed to the PNGs
in `design/ui-mock/`, with an ID (`UX-001` ...) that MVP-11's checks will cite.

## MVP-02 A: Worker scaffold (Sonnet 5.5 / medium)

Owns: `package.json`, `package-lock.json`, `.node-version`, `tsconfig.json`, `biome.json`,
`wrangler.jsonc`, `src/`, `test/`, `vitest.config.ts`, `mocks/.assetsignore`, `.gitignore`.

Frozen for B:

| npm script | Does |
| --- | --- |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run lint` | Biome check, no writes |
| `npm test` | Vitest, once, no watch |
| `npm run check` | `typecheck`, then `lint`, then `test`; exits non-zero on any failure |

- `.node-version` holds the Node major the project uses; CI reads it.
- Worker name `swimcoach`, `workers_dev: true`, no routes. Static assets: `mocks/index.html` served
  unchanged as `/`; `mocks/.assetsignore` keeps `mocks/tools/` out.
- Local Wrangler runs go through `scripts/wrangler.ps1`. Authors MUST NOT deploy.

## MVP-02 B: CI workflow (Sonnet 5.5 / medium)

Owns `.github/workflows/ci.yml` only.

- On pull request and on push to `main`: `npm ci`, then `npm run check`.
- On push to `main` only, after the check passes: `wrangler deploy` with secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Every third-party action pinned to a full commit hash, with its version in a comment.
- `actionlint` clean (it runs `shellcheck` over `run:` blocks).
