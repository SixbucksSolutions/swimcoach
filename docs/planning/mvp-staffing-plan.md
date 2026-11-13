# swimcoach MVP staffing plan

Drafted 2026-11-13 for Terry's review, in the shape of localswim's epic #0581 staffing plan. RFC 2119
keywords; the capitals are load-bearing. Stories are in [`mvp-stories.md`](mvp-stories.md); the
dependency diagram is [`mvp-execution-plan-legal-portrait-300ppi.png`](mvp-execution-plan-legal-portrait-300ppi.png)
(print [`mvp-execution-plan-legal-portrait.pdf`](mvp-execution-plan-legal-portrait.pdf), US legal portrait).

All workers are Claude Code subagents. Terry moved fully to Claude on 2026-11-13, so the localswim
plan's Sol and Terra roles map to Claude models: **Opus** where correctness is subtle (contract,
storage, metric math, authentication, qualification) and **Sonnet** for ordinary build and
presentation work. Effort levels follow the same split.

| Turn | Stories | Author packets | Fresh technical reviewers, later | Visual review, later | Maximum initial worker wave |
| --- | --- | --- | --- | --- | --- |
| T1 | 2 | 2 | 2 | 0 | 2 |
| T2 | 3 | 3 | 3 | 0 | 3 |
| T3 | 2 | 3 | 2 | 0 | 3 |
| T4 | 2 | 3 | 2 | 1 | 3 |
| T5 | 2 | 3 | 2 | 1 | 3 |
| T6 | 1 | 1 plus 2 evidence | 1 | 1 | 3 |

Counts exclude the Lead. At most 4 subagents SHOULD run at once: this is a 12-story epic, and the
diagram's widest turn has 3 stories. Future authors start only after their turn's gate opens.

## Roles

| Role | Who | Owns |
| --- | --- | --- |
| **Lead** | The main Claude Code session | Integration, shared files, dispatching packets, turn handoffs |
| **Authors** | Subagents, one packet each | One story or one module of a story, with its own focused checks |
| **Reviewers** | Fresh subagents | Independent review of a finished, integrated story |
| **Visual reviewer** | A fresh subagent with the browser | Matched mock-versus-MVP comparison at 402 × 874 CSS px, 3× |
| **Terry** | Terry | Decisions D1-D3, the T5 phone gate, MVP acceptance, production cutover |

localswim separates an Architect from the UI Lead. At this size one Lead does both, and Terry holds
every acceptance gate.

## Coauthor ownership

Use a second author only where independently owned modules shorten the turn.

| Story | Author A | Author B | Boundary |
| --- | --- | --- | --- |
| MVP-06 | Sonnet / medium: `GET /api/state` assembler | Sonnet / medium: `POST /api/report` and `DELETE` routes | Both call the Board Durable Object's typed methods; neither edits the Object |
| MVP-07 | Sonnet / medium: renderer port of `mocks/index.html` | Opus / high: data, polling, health and breathing controller | The renderer consumes a typed state projection; only the controller advances state |
| MVP-10 | Sonnet / medium: browser checks | Sonnet / medium: UX ledger and matched renders | Checks cite ledger row IDs; the ledger author does not write checks |

Single-author stories and their models:

| Story | Author | Reviewer |
| --- | --- | --- |
| MVP-01 contract | Opus / high | Opus / high |
| MVP-02 scaffold and deploy | Sonnet / medium | Sonnet / medium |
| MVP-03 Board Durable Object | Opus / high | Opus / high |
| MVP-04 metrics module | Opus / high | Opus / high |
| MVP-05 Access and service tokens | Opus / high | Opus / high |
| MVP-08 agent reporter | Sonnet / medium | Sonnet / medium |
| MVP-09 API acceptance suite | Sonnet / medium | Opus / high |
| MVP-11 phone and home screen | Sonnet / medium | Sonnet / medium |
| MVP-12 qualification | Opus / high, plus 2 Sonnet evidence workers | Opus / high |

MVP-09's reviewer is Opus because the suite is what V2 must pass: a gap in it becomes a gap in V2.

## Relay and review

1. Start each eligible author packet with explicit files, interfaces, outputs and completion
   criteria. Two authors MUST NOT hold write ownership of the same file at the same time.
2. Each author supplies its code, focused checks and a short handoff, then exits. Do not keep
   finished authors idle.
3. As slots free, start a fresh reviewer for each completed, integrated story. A reviewer MUST be
   independent of every author of that story.
4. Run the visual reviewer as soon as a rendered surface exists (MVP-07, MVP-10, MVP-12). It compares
   matched states at the recorded viewport, exits, and returns only for a material visual correction.
5. Route findings to bounded corrections, then get an independent re-review. The Lead integrates and
   hands the turn to Terry when a gate is due.

## Integration ownership

The Lead alone edits shared contracts (MVP-01's schemas and types), `wrangler.jsonc`, the Worker's root
router, the build and CI files, and shared styles. Before dispatch, the Lead records the file paths and a
minimal typed interface for each author. Shared state has one owner.

Do not split a renderer from its tightly coupled CSS. Do not invent a second author to fill a slot.

## What crosses to V2

Per `docs/concept.md` section 14, every packet's handoff names what it leaves for V2: contract,
fixtures, schemas, acceptance checks, UX ledger rows. Code and internal tests are throwaway. The
qualification packet (MVP-12) MUST confirm that the acceptance suites import no MVP code.
