# swimcoach MVP staffing plan

Drafted 2026-11-13 for Terry's review, in the shape of localswim's epic #0581 staffing plan. RFC 2119
keywords; the capitals are load-bearing. Stories are in [`mvp-stories.md`](mvp-stories.md); the
dependency diagram is [`mvp-execution-plan-legal-portrait-300ppi.png`](mvp-execution-plan-legal-portrait-300ppi.png)
(print [`mvp-execution-plan-legal-portrait.pdf`](mvp-execution-plan-legal-portrait.pdf), US legal portrait).

All workers are Claude Code subagents. **Opus / high** where correctness is subtle (contract, storage,
metric math, authentication, qualification, and the review of anything V2 must pass); **Sonnet /
medium** for ordinary build and presentation work.

## Subagents per turn

Each turn is a relay. Every author starts when the turn opens. As each story's authors finish, they
hand off and exit, and that story's fresh reviewers start in the freed slots. **No reviewer is reserved
idle.** So the peak is always the turn's opening wave of authors.

| Turn | Stories | Number of authors | Number of reviewers | Max count of simultaneous subagents during turn |
| --- | --- | --- | --- | --- |
| T1 | MVP-01, MVP-02 | 4 | 2 | 4 |
| T2 | MVP-03, MVP-04, MVP-05 | 4 | 3 | 4 |
| T3 | MVP-06, MVP-07 | 3 | 2 | 3 |
| T4 | MVP-08, MVP-09 | 3 | 3 | 3 |
| T5 | MVP-10, MVP-11 | 3 | 3 | 3 |
| T6 | MVP-12 | 3 | 2 | 3 |
| **Total** | 12 | **20** | **15** | **4 at any moment** |

The counts exclude the Lead (the main session), which integrates and dispatches. Correction work after a
review finding is one bounded author plus a fresh re-reviewer, started in a freed slot, so it never
raises a turn's peak. Reviewer counts include the visual reviewer for MVP-08, MVP-11 and MVP-12.

## Which stories take more than one author

A story gets a second author only when its parts live in **separate files behind a frozen, typed
interface** that the Lead writes before dispatch. Where the parts share a class, a config or a file,
two authors cost more in coordination than they save, so the story keeps one author.

| Story | Authors | Split | Why it is clean, or why it stays single |
| --- | --- | --- | --- |
| MVP-01 contract | **3** | A, Opus / high: HTTP contract and JSON Schemas. B, Opus / high: golden metric fixtures from the prototype's math. C, Sonnet / medium: UX ledger skeleton keyed to `design/ui-mock/` | Three separate artifacts. Fixtures are sample series in and metrics out, independent of the HTTP shape; the ledger is screen states. |
| MVP-02 scaffold + deploy | 1 | Sonnet / medium | Every file is shared root: `wrangler.jsonc`, CI, Biome config, entry point. |
| MVP-03 Board Durable Object | 1 | Opus / high | Storage, ingest and the retention alarm are one class with one SQLite connection. |
| MVP-04 metrics module | **2** | A, Opus / high: RTR, five-bin trend, projection, "too early" gates and the D1 small-block rule. B, Opus / high: chance on time (negative binomial, Jeffreys prior) | Pure functions in separate files; both are checked against MVP-01's fixtures. B's only input is A's frozen sample type. |
| MVP-05 Access + service tokens | 1 | Opus / high | Small; the policy and the Worker's JWT check must agree exactly. **Account steps are Terry's** (below). |
| MVP-06 agent reporter | 1 | Sonnet / medium | One script and one prompt text. |
| MVP-07 state + report API | **2** | A, Sonnet / medium: `GET /api/state` assembler. B, Sonnet / medium: `POST /api/report` and `DELETE` routes | Separate route modules; both call the Board's typed methods and neither edits the Board. |
| MVP-08 page on live data | **2** | A, Sonnet / medium: renderer port of `mocks/index.html` with its CSS. B, Opus / high: data, polling, health and breathing controller | The renderer consumes a typed state projection; only the controller advances state. The renderer owns its DOM and CSS together. |
| MVP-09 API acceptance suite | 1 | Sonnet / medium | One runner and its fixture replay share every helper. Reviewer is Opus / high: a gap here becomes a gap in V2. |
| MVP-10 phone + home screen | 1 | Sonnet / medium | Small, and most of it is checking on the real phone. |
| MVP-11 UI acceptance + UX ledger | **2** | A, Sonnet / medium: browser checks. B, Sonnet / medium: completed UX ledger and matched renders | Checks cite ledger row IDs; the ledger author does not write checks. |
| MVP-12 qualification | **3** | A, Opus / high: qualification author. B and C, Sonnet / medium: evidence workers (behavioral coverage audit; provenance and "suites import no MVP code" check) | localswim's T6 pattern: two bounded evidence packets feed one author. |

## The relay, turn by turn

| Turn | Opening wave (authors) | As each story's authors hand off |
| --- | --- | --- |
| T1 | 01-A, 01-B, 01-C, 02 | MVP-02's author exits; its Sonnet reviewer starts. When all three MVP-01 authors are done, they exit and one Opus reviewer takes the integrated contract. |
| T2 | 03, 04-A, 04-B, 05 | Each story's reviewer starts as its last author exits: Opus for all three. |
| T3 | 06, 07-A, 07-B | Sonnet reviewer for MVP-06; Sonnet reviewer for MVP-07 once both route authors exit. |
| T4 | 08-A, 08-B, 09 | MVP-08: a Sonnet technical reviewer **and** the visual reviewer start together in the two freed slots. MVP-09: an Opus reviewer. Then **Terry's phone check of MVP-08** before T5 opens. |
| T5 | 10, 11-A, 11-B | MVP-10: a Sonnet reviewer. MVP-11: a Sonnet technical reviewer and the visual reviewer in the two freed slots. |
| T6 | 12-A, 12-B, 12-C | The two evidence workers hand to 12-A and exit; then an Opus reviewer and the visual reviewer check the assembled result. **Terry's demo and acceptance** close the epic. |

### Relay rules

1. The Lead writes each multi-author story's file paths and typed interface before dispatch. Two
   authors MUST NOT hold write ownership of the same file at the same time.
2. Each author supplies its code, focused checks and a short handoff naming what survives into V2, then
   exits. A finished author MUST NOT stay running.
3. A reviewer starts only when its story's authors have all handed off, in a slot they freed, and MUST
   be independent of every author of that story. Reviewers MUST NOT be started early to wait.
4. A finding goes to one bounded correction author, then a fresh re-reviewer, each in a freed slot.
5. A turn closes when every story is reviewed clean and integrated. Gates (T4 phone check, T6 demo) are
   Terry's.

## Steps only Terry can do

Some MVP work changes Terry's Cloudflare account. These are his to approve and run; the authors prepare
exact instructions and stop.

| Story | Terry's step |
| --- | --- |
| MVP-02 | Choose the hostname, and approve the Worker's first deploy to his account |
| MVP-05 | Create the Access application and its policy; create one service token per monitoring agent and store each where that agent can read it |
| MVP-10 | Add the page to his iPhone's home screen and confirm the session lasts the evening |

## Integration ownership

The Lead alone edits shared contracts (MVP-01's schemas and types), `wrangler.jsonc`, the Worker's root
router, the build and CI files, and shared styles. Shared state has one owner. Do not split a renderer
from its tightly coupled CSS, and do not invent a second author to fill a slot.

## What crosses to V2

Per `docs/concept.md` section 14, every handoff names what it leaves for V2: contract, fixtures,
schemas, acceptance checks, UX ledger rows. Code and internal tests are throwaway. MVP-12's evidence
workers MUST confirm that the acceptance suites import no MVP code.
