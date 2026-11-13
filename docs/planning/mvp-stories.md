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

- An HTTP contract for `POST /api/report`, `GET /api/state` and `DELETE /api/projects/<name>`, with
  JSON Schema for the report and state bodies. It starts from `docs/concept.md` section 6.3 and adds the
  answers to D1-D3.
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

- SQLite tables `projects`, `samples`, `events` (prototype section 6.4), created by migration.
- Report ingest with validation against MVP-01's schema; arrays of reports; lane overrides.
- A Durable Object alarm deletes samples and events older than 14 days.

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
- One Access service token per monitoring agent.
- The Worker verifies the `Cf-Access-Jwt-Assertion` header on every request and refuses anything
  unsigned, so a misconfigured Access policy fails closed.

**Done when:** an unauthenticated request, a forged header and an expired token are each refused, and
Terry's phone and one service token are each admitted. **Survives:** the rule "every request
authenticated", in the contract.

## T3: API and agents

### MVP-06: Agent reporter (2 h)

**Goal:** a monitoring agent pushes a real time block every 10 minutes.

- A small script the agent runs (PowerShell or Python with `argparse`), reading the current time block
  from localswim's CLI and posting with its service token.
- Text for the agent's scheduled task, replacing `reference/prototype/AGENT_PROMPT.md`, with the
  section 11 defects fixed (no bash heredoc; Windows-safe).

**Done when:** a real localswim time block appears on the phone and updates every 10 minutes.
**Survives:** the report format and the prompt text.

### MVP-07: State and report API (2 h)

**Goal:** the three endpoints, exactly as contracted.

- `GET /api/state?since=` assembles snapshots, trend, `spark`, staleness and the health fields the page
  needs (`docs/concept.md` section 6.3).
- `POST /api/report` and `DELETE /api/projects/<name>` call the Durable Object.

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
