# swimcoach MVP story breakdown

Drafted 2026-11-13 for Terry's review. RFC 2119 keywords; the capitals are load-bearing.

The MVP puts the approved mock (`mocks/index.html`) on Terry's phone with real data. Its purpose and
its relation to V2 are in [`docs/concept.md` section 14](../concept.md): the MVP's behavior is the
deliverable, and V2 rebuilds it from greenfield. So every story below names what it leaves behind for V2
under **Survives**. Code is never on that list.

The stack is decided: one Cloudflare Worker, one SQLite-backed Durable Object, TypeScript, Cloudflare
Access. The diagram is [`mvp-execution-plan-legal-portrait-300ppi.png`](mvp-execution-plan-legal-portrait-300ppi.png)
(print [`mvp-execution-plan-legal-portrait.pdf`](mvp-execution-plan-legal-portrait.pdf)),
rendered from [`mvp-plan.json`](mvp-plan.json). Staffing is in [`mvp-staffing-plan.md`](mvp-staffing-plan.md).

Story IDs are provisional (`MVP-01` to `MVP-12`). They map to localswim cards when the board exists.
Hours are author estimates, in the same 1.5 to 2.5 h range as localswim's stories.

## Decisions Terry made before T2 (2026-11-13)

These were open items 10 to 12 in `docs/concept.md` section 8. Terry decided all three on 2026-11-13;
they are part of MVP-01's contract.

| ID | Question | Decision |
|---|---|---|
| D1 | What does a card show for a 1-2 story time block, where RTR is binary? (Rare: Terry's 4-hour blocks usually hold 5-10 stories.) | **Count and time.** A block with fewer than 3 stories shows no RTR and no clock hand. The card shows "1 of 2 done" and hours used of allocated. It is green while time is under budget, yellow once it runs over, and red only for Needs Terry. |
| D2 | Should RTR weight finished work by story estimate instead of counting tickets? | **Count tickets now; allow estimates.** RTR counts tickets, as the mock does. The report contract accepts an optional per-ticket `estimate_hours`, so switching later needs no agent change; real data decides whether weighting matters. |
| D3 | Do agents report a pending gate as a Needs Terry item? | **Only Terry's gates.** A gate waiting on Terry (visual confirmation, Completed, cutover) is a Needs Terry item: red, GO TO KEYBOARD, with the ask. Agent-owned gates (Architect release) change nothing. A ticket sitting in Ready for Review is not by itself a request. |

## T1: foundation

### MVP-01: MVP contract (2.5 h)

**Goal:** freeze, as documents and data, everything V2 must reproduce.

- An HTTP contract for `POST /api/report`, `GET /api/state`, and stopping the tracking of a (project,
  milestone) tuple (replacing the prototype's `DELETE /api/projects/<name>`), with
  JSON Schema for the report and state bodies. It starts from `docs/concept.md` section 6.3 and adds the
  answers to D1-D3.
- The swimcoach CLI's command line (MVP-06), which project agents call directly. **Terry,
  2026-11-13: every CLI status update MUST be complete, never incremental.** The CLI MUST refuse an
  update that lacks any of these fields:

  | Field | Meaning | Example |
  |---|---|---|
  | Agent framework | Which agent system sent it | `codex` or `claude` |
  | Project | The project's stable name | `localswim V2`, `FGA` |
  | Milestone | The milestone or increment being worked | `T06`, `M12` |
  | Active time | Total active time spent on the milestone so far | 1.85 h |
  | Time cap | The milestone's maximum time | 4 h |
  | Story cards per lane | The milestone's story cards in Ready For Work, In Progress, Needs Terry, Ready For Review and Completed | 2, 1, 0, 3, 1 |

  One epic per milestone, several stories per epic (Terry, 2026-11-13), so the cards counted are that
  epic's stories. A total card count is not enough: RTR needs the finished count, a Needs Terry card
  raises GO TO KEYBOARD, and the Swimlanes display draws one bar per lane. Ready For Review and
  Completed both count as finished; without Completed, a card moving on from Ready For Review would
  look like lost work. The optional `needs_me` sentence stays optional.
- **The milestone lifecycle (Terry, 2026-11-13).** The unit swimcoach tracks is the tuple (project,
  milestone), for example (`FGA`, `M12`).
  1. swimcoach adds the tuple to the UI on the first status update it receives for it. There is no
     separate create step and no confirmation. Terry, 2026-11-13: an agent reports only because Terry
     told it to put itself on his phone, and Cloudflare Access proves every sender is his own, so a
     first update IS that instruction.
  2. The project's agent sends complete status updates for it while it works.
  3. Terry reviews and approves the milestone, and every card goes to Completed.
  4. Terry tells the project's agent the milestone is complete, and the agent runs the swimcoach CLI
     to make swimcoach stop tracking that tuple. swimcoach removes it from the UI.

  Consequence, accepted: a mistyped project or milestone name creates a stray card. The same stop
  command removes it.
- Metric definitions as executable golden fixtures: input sample series and the expected RTR, trend
  bin, projection, chance and call, taken from the prototype's math (`reference/prototype/server.py`)
  for the eight mock scenarios plus edge cases (one-story turn, zero progress, block over time, midnight
  rollover).
- A UX ledger skeleton: every screen state and transition, keyed to `design/ui-mock/` renders at 402 ×
  874 CSS px, 3×.

**Done when:** the schemas validate the mock's own scenario data, and every golden fixture has an
expected output. **Survives:** all of it.

### MVP-02: Worker scaffold and deploy (2 h)

**Goal:** an empty swimcoach Worker deployed behind a real hostname, with the quality gate in place.

- `wrangler` project, TypeScript strict, the mock served unchanged as static assets.
- Biome at best-practice pedantry per Terry's global rule (every rule tried, exclusions reasoned in the
  config, gate proven to fire). The TypeScript language server gap is recorded, not skipped.
- GitHub Actions: check, then `wrangler deploy` on push to `main`; `actionlint` clean.

**Done when:** pushing to `main` deploys, and the phone loads the mock from the real hostname.
**Survives:** nothing but the hostname.

## T2: data, metrics, access

### MVP-03: Board Durable Object (2.5 h)

**Goal:** one Durable Object that stores the board and outlives every deploy.

- SQLite tables for tracked milestones and their samples, keyed by (project, milestone) and created
  idempotently. No events table: nothing in the contract reads one (`contract/api.md`).
- Report ingest with validation against MVP-01's schema: one complete report per request, no arrays,
  no cards, no lane overrides (`contract/api.md` 4.1).
- A Durable Object alarm deletes samples older than 14 days (`contract/api.md` section 10).

**Done when:** a deploy between two reports keeps both reports' samples. **Survives:** the storage
model as described in the contract.

### MVP-04: Metrics module (2.5 h)

**Goal:** the metric math as one pure TypeScript module.

- RTR, five-bin trend, projection, chance on time (negative binomial, Jeffreys prior), the call, and
  the "too early to call" gates, per `docs/concept.md` section 4 and D1/D2.
- No I/O; the Durable Object and the page both import it.

**Done when:** every MVP-01 golden fixture passes. **Survives:** the fixtures, not the module.

### MVP-05: Access and service tokens (2 h)

**Goal:** nothing on the host answers without Cloudflare Access.

- An Access application on the whole hostname, with a long session for Terry's phone.
- An Access service token for the swimcoach CLI, stored in a file the project agents' CLI runs read.
- The Worker verifies the `Cf-Access-Jwt-Assertion` header on every request and refuses anything
  unsigned, so a misconfigured Access policy fails closed.

**Done when:** an unauthenticated request, a forged header and an expired token are each refused, and
Terry's phone and one service token are each admitted. **Survives:** the rule "every request
authenticated", in the contract.

## T3: API and agents

### MVP-06: swimcoach CLI client (2 h)

**Goal:** each running project's own agent pushes its current milestone straight to swimcoach.

The data path, as Terry set it on 2026-11-13: **no relay.** A project's agent (in Codex or Claude) runs
the swimcoach CLI itself and pushes its milestone's wall-clock hours and card count per lane. There is no swimcoach
agent and no state file on disk. Cards are not tied to time blocks in localswim, so the project's agent
is the one that knows what its milestone holds.

- The CLI's stop command: tells swimcoach to stop tracking a (project, milestone) tuple, per MVP-01's
  lifecycle. The first status update adds a tuple, so there is no create command.
- The swimcoach CLI client: takes a project's milestone report as arguments or a JSON file, validates
  it against MVP-01's schema, and posts it to the Worker's API with an Access service token. It reads
  the token from a file, never an environment variable, the same way as `scripts/wrangler.ps1`.
- The instruction text a project's agent follows: when to push and the exact commands. Terry,
  2026-11-13: as the agent moves a card to Ready For Review, it informs swimcoach through the CLI.
  So the agent pushes at milestone start, on every card move (Ready For Review and Needs Terry
  above all, since a Needs Terry card raises GO TO KEYBOARD), and as a heartbeat at least every 10
  minutes while working, because a silent project goes STALE.
- Every push MUST carry the milestone's full state (hours and every lane's count), never a
  "one more card done" increment. A missed push then costs only freshness, and a repeated one changes
  nothing; increments would drift forever after one lost call. It replaces
  `reference/prototype/AGENT_PROMPT.md` and fixes its section 11 defects (no bash heredoc;
  Windows-safe).
- Codex and Claude can both work one project, so a repeated report MUST NOT create a duplicate
  sample.

**Done when:** a real project's milestone appears on the phone and updates as its agent works.
**Survives:** the CLI's command line, the report format and the instruction text.

### MVP-07: State and report API (2 h)

**Goal:** the three endpoints, exactly as contracted.

- `GET /api/state` assembles the milestones, metrics, verdicts, `spark` and the health fields the page
  needs (`contract/api.md` section 6). There is no `?since=` and no day boundary (api.md 6.9).
- `POST /api/report` and the stop-tracking route for a (project, milestone) tuple call the Durable
  Object.

**Done when:** responses validate against MVP-01's schemas. **Survives:** the contract it implements.

## T4: the page, and the API proven

### MVP-08: Page on live data (2.5 h)

**Goal:** the approved mock, unchanged in look, fed by the real API.

- Replace the mock's `fetchState()` scenario data with `GET /api/state`; remove the MOCK button,
  sheet and desktop side panel.
- Keep every rule in `docs/concept.md` sections 3 and 13 and `docs/brand.md`: slot grid, clock hands,
  health box, breathing sync, no-flicker load, palette tokens.

**Done when:** the phone shows real projects, and a side-by-side against the mock renders shows no
unapproved difference. **Gate:** Terry checks it on his iPhone before T5 starts. **Survives:** nothing
new; it proves the ledger.

### MVP-09: API acceptance suite (2 h)

**Goal:** a black-box suite that drives the running service through HTTP only.

- Replays MVP-01's fixtures as timed reports and checks `GET /api/state` against expected outputs.
- MUST NOT import MVP code, so V2 can run it unchanged.

**Done when:** it passes against the deployed MVP and fails against a deliberately broken build.
**Survives:** the whole suite.

## T5: the page proven, and the phone

### MVP-10: Phone and home screen (1.5 h)

**Goal:** swimcoach behaves like an app on Terry's iPhone 16 Pro.

- Home-screen icon (`design/logo/swimcoach-touch-180.png`), manifest and full-screen launch.
- An Access session long enough that the couch view does not log out mid-evening.
- Checked on the real phone in Chrome (WebKit): safe areas, swipe, chime after the first tap.

**Done when:** Terry launches it from the home screen and it stays signed in. **Survives:** the
recorded device behavior in the ledger.

### MVP-11: UI acceptance and UX ledger (2.5 h)

**Goal:** the visual and interaction contract, proven against the running page.

- Browser checks at 402 × 874 CSS px, 3×: slot modes, card order, GO TO KEYBOARD slot, colors by
  computed style, clock-hand positions, 18 px margins, breathing sync, health states, no flicker.
- Completes the UX ledger with each transition recorded as an action and its result, per the localswim
  lesson in `docs/concept.md` section 14.

**Done when:** every ledger row has a passing check or a recorded manual observation. **Survives:** the
checks and the ledger.

## T6: qualification

### MVP-12: MVP qualification (2 h)

**Goal:** prove the whole MVP and hand it to Terry.

- Run MVP-09 and MVP-11 against production; confirm MVP-06's real reports for a full turn.
- Terry's hands-on demo on his phone. **Terry owns acceptance.**

**Done when:** both suites pass in production and Terry accepts. **Survives:** the qualification record
that V2 must also meet.
