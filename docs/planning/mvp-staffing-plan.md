# swimcoach MVP staffing plan

Drafted 2026-11-13 for Terry's review, in the shape of localswim's epic #0581 staffing plan. RFC 2119
keywords; the capitals are load-bearing. Stories are in [`mvp-stories.md`](mvp-stories.md); the
dependency diagram is [`mvp-execution-plan-legal-portrait-300ppi.png`](mvp-execution-plan-legal-portrait-300ppi.png)
(print [`mvp-execution-plan-legal-portrait.pdf`](mvp-execution-plan-legal-portrait.pdf), US legal portrait).

All workers are Claude Code subagents. Every role below names its model and its effort level, and
the two names mean exactly these:

| Short name | Model | Model ID | Effort |
| --- | --- | --- | --- |
| **Opus 5.5 / high** | Claude Opus 5.5 | `claude-opus-5-5` | `high` |
| **Sonnet 5.5 / medium** | Claude Sonnet 5.5 | `claude-sonnet-5-5` | `medium` |

Opus 5.5 / high goes where correctness is subtle: contract, storage, metric math, authentication,
qualification, and the review of anything V2 must pass. Sonnet 5.5 / medium goes to ordinary build and
presentation work. The Lead (the main session) is Claude Opus 5.5. A later model MUST NOT be swapped
in silently; changing a row's model or effort is a staffing-plan edit.

## The goal: least total wall-clock time, T1 to T6

A turn finishes when its slowest story finishes. So the plan splits **each turn's pacesetting story**
into parallel authors, then checks which story sets the pace next, and repeats. A story is split only
where its parts live in **separate files behind a frozen, typed interface** written by the Lead before
dispatch. Splitting a story whose parts share a class or a file costs more in coordination than it
saves, and it is not done.

## Subagents per turn

Each turn is a relay. Every author starts when the turn opens. As each story's authors finish, they
hand off and exit, and that story's fresh reviewers start in the freed slots. **No reviewer is reserved
idle**, so a turn's peak is its opening wave of authors.

| Turn | Stories | Number of authors | Number of reviewers | Max count of simultaneous subagents during turn |
| --- | --- | --- | --- | --- |
| T1 | MVP-01, MVP-02 | 5 | 3 | 5 |
| T2 | MVP-03, MVP-04, MVP-05 | 6 | 4 | 6 |
| T3 | MVP-06, MVP-07 | 4 | 2 | 4 |
| T4 | MVP-08, MVP-09 | 5 | 4 | 5 |
| T5 | MVP-10, MVP-11 | 5 | 3 | 5 |
| T6 | MVP-12 | 3 | 2 | 3 |
| **Total** | 12 | **28** | **18** | **6 at any moment** |

The counts exclude the Lead (the main session), which integrates and dispatches. Correction work after a
review finding is one bounded author plus a fresh re-reviewer in freed slots, so it never raises a peak.
Reviewer counts include the visual reviewer for MVP-08, MVP-11 and MVP-12.

### What the splits buy

Author time on each turn's critical path, from the story estimates, assuming an ideal split. Real
splits cost some integration, so treat the gain as an upper bound.

| Turn | Pacesetter before | Hours before | Pacesetter after | Hours after |
| --- | --- | --- | --- | --- |
| T1 | MVP-02 scaffold (1 author) | 2.0 | MVP-02 (2 authors) | 1.0 |
| T2 | MVP-03 Board (1 author) | 2.5 | MVP-03 and MVP-04 (2 each) | 1.25 |
| T3 | MVP-06 and MVP-07 | 2.0 | Both (2 each) | 1.0 |
| T4 | MVP-09 suite (1 author) | 2.0 | MVP-09 (2 authors) | 1.0 |
| T5 | MVP-10 phone (1 author) | 1.5 | MVP-11 (3 authors) | 0.85 |
| T6 | MVP-12 author | 1.2 | MVP-12 author | 1.2 |
| **Sum** | | **11.2 h** | | **6.3 h** |

Each turn also spends roughly half an hour on integration and review regardless of splits, so the
whole MVP moves from about 15 hours of wall clock to about 10: from four of Terry's 4-hour blocks to
about three. These are estimates; T1 and T2 will show how good they are.

## Authors per story

| Story | Authors | Split | Why the split is clean |
| --- | --- | --- | --- |
| MVP-01 contract | **3** | A, Opus 5.5 / high: HTTP contract and JSON Schemas. B, Opus 5.5 / high: golden metric fixtures from the prototype's math. C, Sonnet 5.5 / medium: UX ledger skeleton keyed to `design/ui-mock/` | Three separate artifacts. Fixtures are sample series in, metrics out, independent of the HTTP shape; the ledger is screen states. |
| MVP-02 scaffold + deploy | **2** | A, Sonnet 5.5 / medium: Worker project, TypeScript strict, Biome at pedantry with its proof-of-fire, mock served as assets. B, Sonnet 5.5 / medium: GitHub Actions check-and-deploy workflow, `actionlint` clean | `wrangler.jsonc`, `src/`, `biome.json` versus `.github/workflows/`. The interface is the npm script names, fixed up front. |
| MVP-03 Board Durable Object | **2** | A, Opus 5.5 / high: SQLite schema, migrations, typed storage methods and the 14-day retention alarm. B, Opus 5.5 / high: report ingest (validation, arrays, lane overrides, cards-to-lanes derivation) as a pure module | `board-store.ts` versus `ingest.ts`. B calls only A's frozen storage interface, never SQLite. |
| MVP-04 metrics module | **2** | A, Opus 5.5 / high: RTR, five-bin trend, projection, "too early" gates, D1 small-block rule. B, Opus 5.5 / high: chance on time (negative binomial, Jeffreys prior) | Pure functions in separate files, both checked against MVP-01's fixtures. B's only input is A's frozen sample type. |
| MVP-05 Access + service tokens | **2** | A, Opus 5.5 / high: the Worker's `Cf-Access-Jwt-Assertion` verification, failing closed, with forged and expired token tests. B, Sonnet 5.5 / medium: the exact steps for Terry's Access application, policy and service tokens, plus a check script he runs after | Code versus runbook. The interface is the Access audience tag and team domain, fixed up front. |
| MVP-06 CLI client | **2** | A, Sonnet 5.5 / medium: the swimcoach CLI client that validates a milestone report and posts it with a service token. B, Sonnet 5.5 / medium: the instruction text project agents follow in Codex and Claude, and the Windows setup steps | Client versus instructions and runbook. The interface is the client's command line, frozen in MVP-01. |
| MVP-07 state + report API | **2** | A, Sonnet 5.5 / medium: `GET /api/state` assembler. B, Sonnet 5.5 / medium: `POST /api/report` and the stop-tracking route | Separate route modules; both call the Board's typed methods and neither edits the Board. |
| MVP-08 page on live data | **3** | A, Sonnet 5.5 / medium: overview display (status line, slot grid, cards, GO TO KEYBOARD) with its CSS. B, Sonnet 5.5 / medium: project display (hero, chart, tiles, bars, swimlanes) with its CSS. C, Opus 5.5 / high: data, polling, health, breathing and no-flicker controller | Two renderers on one shared token stylesheet the Lead owns, each with its own DOM and CSS, both consuming C's frozen state projection. |
| MVP-09 API acceptance suite | **2** | A, Sonnet 5.5 / medium: harness (HTTP client, timed replay, controllable clock). B, Sonnet 5.5 / medium: scenario cases turning MVP-01's fixtures into assertions | Runner versus cases; the interface is the case format. |
| MVP-10 phone + home screen | **2** | A, Sonnet 5.5 / medium: web manifest, touch icon, meta tags, safe-area CSS. B, Sonnet 5.5 / medium: Access session settings for Terry and the device checklist he runs | Page assets versus account steps and checks. |
| MVP-11 UI acceptance + UX ledger | **3** | A, Sonnet 5.5 / medium: overview-display browser checks. B, Sonnet 5.5 / medium: project-display browser checks. C, Sonnet 5.5 / medium: completed UX ledger and matched renders | Checks cite ledger row IDs; each check author owns one display; the ledger author writes no checks. |
| MVP-12 qualification | **3** | A, Opus 5.5 / high: qualification author. B and C, Sonnet 5.5 / medium: evidence workers (behavioral coverage audit; provenance and "suites import no MVP code" check) | localswim's T6 pattern: two bounded evidence packets feed one author. Not split further: one person signs the qualification. |

## Reviewers per story

One fresh reviewer per story, independent of every author of that story, plus a second where a story's
parts need different expertise and would otherwise queue behind one reviewer.

**Every reviewer MUST be Opus 5.5 / high** (Terry, 2026-11-13), including the visual reviewer and
every re-reviewer after a correction. Author roles keep the model and effort their row names.

| Story | Reviewers | Each reviewer's focus |
| --- | --- | --- |
| MVP-01 | 2, Opus 5.5 / high | One for contract and fixtures; one for the UX ledger |
| MVP-02 | 1, Opus 5.5 / high | Scaffold, Biome configuration and the CI workflow |
| MVP-03 | 1, Opus 5.5 / high | Storage, migrations and ingest |
| MVP-04 | 2, Opus 5.5 / high | One per module; the chance model needs its own careful read |
| MVP-05 | 1, Opus 5.5 / high | Token verification and the Access runbook |
| MVP-06 | 1, Opus 5.5 / high | CLI client and the agents' instruction text |
| MVP-07 | 1, Opus 5.5 / high | Both route modules against the contract |
| MVP-08 | 3, Opus 5.5 / high | Renderers; the controller; and the visual reviewer |
| MVP-09 | 1, Opus 5.5 / high | The suite; a gap here becomes a gap in V2 |
| MVP-10 | 1, Opus 5.5 / high | Phone assets and the device checklist |
| MVP-11 | 2, Opus 5.5 / high | Technical review; and the visual reviewer |
| MVP-12 | 2, Opus 5.5 / high | The qualification; and the visual reviewer |

## The relay, turn by turn

| Turn | Opening wave (authors) | As each story's authors hand off |
| --- | --- | --- |
| T1 | 01-A, 01-B, 01-C, 02-A, 02-B | MVP-02's reviewer starts when both its authors exit. MVP-01's two reviewers start when its three authors exit. |
| T2 | 03-A, 03-B, 04-A, 04-B, 05-A, 05-B | Each story's reviewers start in its freed slots. **Terry runs MVP-05's Access steps** from 05-B's runbook. |
| T3 | 06-A, 06-B, 07-A, 07-B | One reviewer each for MVP-06 and MVP-07. |
| T4 | 08-A, 08-B, 08-C, 09-A, 09-B | MVP-08's three reviewers take its three freed slots; MVP-09's reviewer takes one of its two. Then **Terry's phone check of MVP-08** before T5 opens. |
| T5 | 10-A, 10-B, 11-A, 11-B, 11-C | MVP-10's reviewer, then MVP-11's technical and visual reviewers. |
| T6 | 12-A, 12-B, 12-C | The evidence workers hand to 12-A and exit; then the Opus 5.5 / high reviewer and the visual reviewer check the result. **Terry's demo and acceptance** close the epic. |

### Relay rules

1. The Lead writes each split story's file paths and typed interface before dispatch. Two authors
   MUST NOT hold write ownership of the same file at the same time.
2. Each author supplies its code, focused checks and a short handoff naming what survives into V2, then
   exits. A finished author MUST NOT stay running.
3. A reviewer starts only when its story's authors have all handed off, in a slot they freed, and MUST
   be independent of every author of that story. Reviewers MUST NOT be started early to wait.
4. A finding goes to one bounded correction author, then a fresh re-reviewer, each in a freed slot.
5. A turn closes when every story is reviewed clean and integrated. Gates are Terry's.
6. A split MUST be reconsidered if its integration takes longer than the time it saved. The first
   two turns are the test.
7. **Pull requests and squash merges (Terry, 2026-11-13).** All MVP work lands on the integration
   branch `mvp/integration`, never directly on `main`.
   - Each author works in its own git worktree, on a branch `t<N>/mvp-<NN>-<letter>` cut from
     `mvp/integration`, and submits its work as a pull request into `mvp/integration`.
   - The story's reviewer reviews the pull request. On approval, the reviewer squash-merges it into
     `mvp/integration`. A finding goes back as a review comment, and the correction lands on the same
     pull request.
   - Authors MUST NOT merge their own pull requests. Nobody pushes straight to `mvp/integration`.
   - `mvp/integration` does not deploy; only `main` does, through CI.
   - **The Lead merges `mvp/integration` into `main` at each turn's close** (Terry, 2026-11-13), once
     every story in the turn is reviewed and squash-merged. That push deploys. Afterward the Lead
     fast-forwards `mvp/integration` to `main` for the next turn.
8. **The Lead owns turn entry gates** (Terry, 2026-11-13). The Lead alone merges to `main`, and the
   Lead alone decides when turn N+1 opens: only after every turn-N story is squash-merged, `main`
   holds the merge, CI's deploy passed, and the deployed Worker shows the turn's result. Terry's own
   gates stay his and the Lead MUST NOT open past them: the MVP-05 Access steps, the MVP-08 phone
   check before T5, and MVP-12 acceptance. A stop Terry orders for a given run (for example "stop
   after T1") also holds.
   - T1 exception: T1's authors were dispatched into the shared checkout before this rule existed. The
     Lead turns each T1 author's files into that author's branch and pull request; from T2 on, authors
     do it themselves.

## Steps only Terry can do

Some MVP work changes Terry's Cloudflare account. These are his to approve and run; the authors prepare
exact instructions and stop.

| Story | Terry's step |
| --- | --- |
| MVP-02 | Choose the hostname, and approve the Worker's first deploy to his account |
| MVP-05 | Create the Access application and its policy; create the swimcoach CLI's service token and store it in a file the CLI reads |
| MVP-10 | Set the Access session length, add the page to his iPhone's home screen, and confirm the session lasts the evening |

## Integration ownership

The Lead alone edits shared contracts (MVP-01's schemas and types), `wrangler.jsonc`, the Worker's root
router, the build and CI files, and the shared token stylesheet. Shared state has one owner. Do not split
a renderer from its tightly coupled CSS.

## What crosses to V2

Per `docs/concept.md` section 14, every handoff names what it leaves for V2: contract, fixtures,
schemas, acceptance checks, UX ledger rows. Code and internal tests are throwaway. MVP-12's evidence
workers MUST confirm that the acceptance suites import no MVP code.
