# Resume point

Written 2026-11-13, before Terry rebooted, so the next session starts exactly here. RFC 2119 keywords;
the capitals are load-bearing. **Read this first, then `AGENTS.md`.** Delete or rewrite this file once
MVP T1 is underway, so it never goes stale.

## Where things stand

| Area | State |
| --- | --- |
| UI mocking | **Closed.** `mocks/index.html` is the approved design; every decision and its reason is in `docs/concept.md` sections 2, 3 and 13, and `docs/brand.md` |
| Hosted mock | Private claude.ai artifact, republished after every mock edit. The URL is in the Claude project memory (`swimcoach-mock-artifact-url`), not in this public repo |
| Build plan | MVP, then a greenfield V2: `docs/concept.md` section 14. The MVP is requirements discovery |
| MVP stack | **Decided:** one Cloudflare Worker, one SQLite-backed Durable Object, TypeScript, Cloudflare Access. Leading V2 candidate: Terry's static Go plus SQLite container |
| Decisions D1-D3 | **Decided** (`docs/planning/mvp-stories.md`): count-and-time cards for blocks under 3 stories; count tickets but accept optional `estimate_hours`; only Terry's own gates go red |
| Stories | 12 stories, MVP-01 to MVP-12, in 6 turns: `docs/planning/mvp-stories.md` |
| Diagram | `docs/planning/mvp-execution-plan-legal-portrait.pdf` (print) and the 300 ppi PNG, rendered from `mvp-plan.json` by `render-plan.py` |
| Staffing | `docs/planning/mvp-staffing-plan.md`: a per-turn relay, 28 authors and 18 reviewers, at most 6 at once |
| Code | **None written yet.** Nothing is deployed |

## Blocked on Terry, before T1 can deploy

The next session MUST NOT start MVP-02's deploy until these are done. MVP-01 (the contract) has no
credentials need and MAY start at once.

1. **Pick the hostname:** a subdomain of one of Terry's Cloudflare domains, or a `*.workers.dev`
   address. Asked on 2026-11-13; not yet answered.
2. **Create the local token as an account API token, not a personal (user) token** (Cloudflare
   dashboard, Manage Account, Account API Tokens). An account token belongs to the account, not to a
   person, and Cloudflare recommends it for CI and integrations; its compatibility table marks Workers,
   DNS and Access as supported. Give it Workers Scripts Edit, Account Settings Read (Wrangler's account
   lookup), Access: Apps and Policies Edit, Access: Service Tokens Edit, and, on the one zone, Workers
   Routes Edit and DNS Edit. If a later step is refused, add exactly the permission the error names.
3. **Create the CI token:** a second account API token with the same permissions minus the two Access
   ones.
4. **Store them, never in chat:** user environment variables `CLOUDFLARE_API_TOKEN` (the local token)
   and `CLOUDFLARE_ACCOUNT_ID`; then `gh secret set CLOUDFLARE_API_TOKEN --repo SixbucksSolutions/swimcoach`
   with the CI token. The reboot makes new sessions see the variables.
5. Check, after the reboot: `npx wrangler whoami` reports the account. It MAY show no user email, since
   an account token has no user. `CLOUDFLARE_ACCOUNT_ID` MUST be set, or Wrangler's account lookup can
   fail with code 9109. The old `wrangler login` on this machine expired on 2026-11-13.

Account changes stay Terry's to approve even with a token: the Access application, its policy, the
service tokens and the DNS record. Prepare each step and ask before running it.

## Next action when unblocked

Start **MVP T1** per `docs/planning/mvp-staffing-plan.md`: five authors (MVP-01 A, B, C; MVP-02 A, B),
reviewers relaying in as authors finish. Before dispatch, the Lead writes the frozen interfaces the
splits depend on (MVP-02: the npm script names).

## Known loose ends (none block T1)

- **TypeScript language server:** not available on TypeScript 7 (no `tsserver`); recorded, not skipped.
  Biome is the TypeScript linter, wired in MVP-02.
- **Python linting in this repo:** `ruff` and `pyright` are not wired to a gate for `mocks/tools/*.py`
  and `docs/planning/render-plan.py`; checks so far were run by hand.
- **`render-logo.py`** stamps 300 DPI without the retry `render-mock.py` has; it runs rarely.
- **Codex leftovers, by Terry's choice:** the paused `swimcoach-project-watch` Codex automation still
  points at the deleted `v001` folder; `~/.codex` is otherwise untouched.
- **Global hook health:** the `hook-health.py` sweep reported stale at the start of the 2026-11-13 session. It is
  Terry's global setup, not this repo.
- **Rest of the palette and AAA:** only white on the good-news green is held to AAA; the red card's
  white text is 4.83:1 (`docs/brand.md` section 5).
