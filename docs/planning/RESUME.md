# Resume point

First written 2026-11-13 and kept current since, so the next session starts exactly here. RFC 2119
keywords; the capitals are load-bearing. **Read this first, then `AGENTS.md`.**

## T1 closed (2026-11-14 00:03 UTC)

- `main` at `95d8f08` holds all of T1: PRs #1-#5, each reviewed by Opus 5.5 / high and
  squash-merged into `mvp/integration`, then merged to `main` by the Lead.
- CI run 43531397267 passed `check` and `deploy`; the CI token (Workers Editor) deployed version
  `2c82febc-8c96-47f4-aece-f12f7632c7dc`. The live `/` matches `mocks/index.html` by SHA2-256.
- `mvp/integration` is fast-forwarded to `main` for T2.
- Carried into T2's contract work: Ajv strict mode warns that `project`, `milestone` and `needsMe`
  lack a local `"type": "string"`; the schema says "every code point" but Go cannot test lone
  surrogates; `contract/fixtures/README.md` "Open for Terry" item 1 (midnight) is settled by api.md 6.9.
- **Next: T2** (MVP-03 Board Durable Object, MVP-04 metrics, MVP-05 Access). The Lead writes T2's
  frozen interfaces first. MVP-05's Access steps are Terry's gate and need the Zero Trust
  organization confirmed (risk 2).

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
| Code | **T1 merged and deployed** (see "T1 closed" above). `contract/` holds MVP-01; the Worker scaffold and CI are MVP-02 |

## Blocked on Terry, before T1 can deploy

**All five steps were done on 2026-11-13.** Nothing here blocks T1 any more. MVP-02's first deploy
still needs Terry's go-ahead at the time, because it creates the Worker on his account.

1. **Hostname: decided.** Terry, 2026-11-13: the MVP runs on `*.workers.dev` for now. So no zone, no
   DNS record and no zone-scoped token permissions are needed. A custom hostname MAY come later and
   would add Workers Routes Edit and DNS Edit on that zone.
2. **Create the local token as an account API token, not a personal (user) token** (Cloudflare
   dashboard, Manage Account, Account API Tokens). An account token belongs to the account, not to a
   person, and Cloudflare recommends it for CI and integrations; its compatibility table marks Workers,
   DNS and Access as supported. Give it the **Workers: Admin** role at Entire Account scope, Account
   Settings Read (Wrangler's account lookup), Access: Apps Write, Access: Policies Write and Access:
   Service Tokens Write. All of them sit in ONE policy scoped to **Entire Account**. If a later step is
   refused, add exactly the permission the error names.
   - The policy scope MUST be Entire Account. On 2026-11-13 the scope read "Specified Domains" with no
     domain chosen, and the dashboard kept **Review token** disabled with no message saying why.
   - The dashboard now offers Workers roles (Metadata Read-only, Content Read-only, Editor, Admin) and
     marks the old "Workers Scripts" permission **Legacy**; it MUST NOT be used. Legacy Workers
     Scripts Edit maps to Editor.
   - Admin is required here because Cloudflare's docs say Editor "can read, update, deploy, and
     rename existing Workers" and cannot create one. The first deploy creates the swimcoach Worker.
   - **Done 2026-11-13.** The token and the account ID are files in `%USERPROFILE%\.secrets\swimcoach`:
     `cloudflare-api-token-local.txt` and `cloudflare-account-id.txt`. The folder grants Full Control
     to Terry's account only, with inheritance removed. Cloudflare's `tokens/verify` reported the token
     `active` with no expiry.
3. **Create the CI token:** a second account API token with **Workers: Editor** instead of Admin and
   without the two Access permissions. CI only deploys the Worker the local token created. The docs do
   not say whether a Durable Object migration needs more than Editor; if a CI deploy with a migration
   is refused, raise the CI token to Admin. **Done 2026-11-13:** "swimcoach CI Deploy", Workers Editor
   and Account Settings Read on the entire account, no expiry, all IP addresses (GitHub's runner
   ranges are too wide and too changeable to allow-list). No copy is kept on this machine.
4. **Store the CI token as a GitHub secret. Done 2026-11-13:** Terry ran
   `gh secret set CLOUDFLARE_API_TOKEN --repo SixbucksSolutions/swimcoach`, and `gh secret list` shows
   it, set at 2026-11-13T22:49:41Z.
5. **Give CI the account ID. Done 2026-11-13:** the `CLOUDFLARE_ACCOUNT_ID` Actions secret is set, at
   2026-11-13T22:51:17Z, on Terry's go-ahead. The workflow reads it as a secret. Cloudflare
   does not treat it as a secret, but a GitHub secret masks it in this public repo's workflow logs,
   so it SHOULD be a secret. The value is in `%USERPROFILE%\.secrets\swimcoach\cloudflare-account-id.txt`.

### Local credentials: files, never environment variables

Terry, 2026-11-13: he will not set `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` as User or
Machine environment variables. Storing the token on disk is fine, and an agent reads it when it needs
it. So:

- Every local Wrangler command MUST go through `scripts/wrangler.ps1`, for example
  `pwsh -NoProfile -File scripts/wrangler.ps1 deploy`. The script reads both files, sets the two
  variables at Process scope for one run, and clears them afterward.
- An agent MUST NOT print, copy or commit the token file's contents, and MUST NOT write either value
  to the User or Machine environment.
- Proven 2026-11-13: `wrangler whoami` through the script reports "logged in with an Account API
  Token" for account `Terry.ott@sixbuckssolutions.com's Account`. After the run, neither the calling
  shell nor the User environment held the token, and Wrangler's logs contained no `cfat_` string.
- Wrangler 4.162.0 reads an account token without trouble once `CLOUDFLARE_ACCOUNT_ID` is set. The old
  `wrangler login` on this machine expired on 2026-11-13 and is not needed.

Account changes stay Terry's to approve even with a token: the Access application, its policy, the
service tokens, and the Worker's first `workers.dev` deploy. Prepare each step and ask before running it.

## Risks to finishing in six turns (checked 2026-11-13)

1. **MVP-06's data source: `C:\Projects\localswim`, and nothing else.** Terry, 2026-11-13, in his
   words: "just c:\projects\localswim period". localswim cut over to V2 on the night of 2026-11-12.
   - The reporter MUST use the localswim CLI from `C:\Projects\localswim` (the Go V2,
     `github.com/localswim/localswim`), which reads and writes boards. Its README builds it with
     `go build -o localswim.exe ./cmd/localswim` and points the CLI at the service with `LOCALSWIM_URL`
     and `LOCALSWIM_TOKEN` (`docs/windows-operations.md`). The help is multi-level: append `--help` to
     an object or action.
   - The reporter MUST NOT parse JSON files, and MUST NOT use any other localswim copy:
     not `localswim-v2`, not `localswim-legacy-v1`, not `localswim-state-store` (V1, before the
     cutover), and not the uv-installed `localswim` on `PATH`, a broken Python V1 install whose
     `localswim.pth` points at the removed `C:\Projects\localswim\src`.
   - **Superseded the same day by Terry's data path** (now in `mvp-stories.md` MVP-06): cards are not
     tied to time blocks, and there is **no relay**. Each running project's own agent, in Codex or
     Claude, runs the swimcoach CLI client and pushes its milestone's wall-clock hours and card count per lane
     straight to the Worker's API. No swimcoach agent, no state file on disk. MVP-01 freezes the
     CLI's command line. The localswim notes above are background only; swimcoach does not read
     localswim.
2. **The Zero Trust organization is unconfirmed.** The local token lists Access applications (there are
   none) but gets 403 on `access/organizations`, because it lacks an Organizations Read permission.
   MVP-05 needs an organization with a team domain. Terry SHOULD check the Zero Trust dashboard before
   T2.
3. **MVP-09 needs time control that production cannot give.** The suite replays timed reports, and the
   server computes RTR, staleness and health from its own clock. MVP-01's contract MUST make time an
   input (report timestamps) or MVP-09 MUST run against a separate test Worker with a clock override. A
   second Worker needs the local token: the CI token's Workers Editor cannot create one.
4. **Terry's gates set the pace:** MVP-02's first deploy, the MVP-05 Access steps, the MVP-08 phone
   check, MVP-10 on the phone, and MVP-12 acceptance.

5. **The CI token SHOULD get narrower, not wider.** Workers Editor at Entire Account scope can deploy
   over ANY existing Worker on the account, including FlickrGroupAddr's `fga-api`. Workers Admin would
   add creating and deleting them. After MVP-02's first deploy creates `swimcoach`, Terry SHOULD
   re-scope the CI token's Editor role to that one Worker. Creating any extra Worker (such as a test
   Worker) stays with the local token.

6. **Agent sandboxes and approval prompts can block or nag the CLI (MVP-06).** Codex's default
   workspace sandbox blocks outbound network, so a project agent's `swimcoach` push may fail there.
   Claude Code asks approval for a command it has not been allowed, so every card move could prompt
   Terry. Both need a one-time allow rule for the `swimcoach` command, which is Terry's call per tool.
7. **The CLI must be installed where every project's agent finds it (MVP-06):** on `PATH` for all
   projects, with its Access service token in a file it reads. Its language decides its LSP and linter
   under Terry's global rule.
8. **The iPhone home-screen app keeps its own cookies (MVP-10).** iOS gives a home-screen web app
   storage separate from Chrome, so Terry logs in to Access once more inside it, and the session length
   decides how often. It MUST be tested on the phone, not assumed.
9. **Access in front of `workers.dev` (MVP-05):** believed supported, not yet verified. MVP-05 MUST
   confirm it before building on it; a custom hostname is the fallback.

Checked and fine: the mock and the report agree on lanes. Backlog and Blocked never appear on the
dashboard (`concept.md`, 2026-11-13), and the report carries neither. The account's `workers.dev` subdomain is `sixbuckssolutions`, so the URL will be
`swimcoach.sixbuckssolutions.workers.dev`. The account already runs the `fga-api` and `fga-m28-stage`
Workers.

## Live (2026-11-13)

- **First deploy done** from `mvp/integration` at `c935e71`, by the Lead through `scripts/wrangler.ps1`:
  `https://swimcoach.sixbuckssolutions.workers.dev`, version `146ddcd3-5908-4953-a637-e10abf529c29`.
  `/` serves `mocks/index.html` byte-identical (SHA2-256 match), `/api/health` answers `{"ok":true}`,
  `/tools/` is 404.
- **It is public until MVP-05** puts Access in front of `workers.dev`. Today it serves only the mock,
  which is public in this repo anyway, and the health route.
- Deferred from MVP-02 review: a Vitest test for `GET /` needs `miniflare.assets` in
  `vitest.config.ts`; MVP-11's browser checks cover `/` meanwhile.

## Terry's go-aheads for T1 (2026-11-13)

- **First deploy: pre-approved.** When MVP-02 passes review, the Lead runs the first deploy through
  `scripts/wrangler.ps1` without stopping. It creates only the `swimcoach` Worker.
- **Pacing: the Lead decides** (Terry, 2026-11-13, replacing the earlier "stop after T1"). The Lead
  opens each next turn under relay rule 8 and stops only at Terry's own gates. The first is MVP-05's
  Access steps in T2, which also need the Zero Trust organization confirmed (risk 2).
- **Open questions for Terry** collect in the contract's "Open for Terry" lists and wait for a natural
  stop; work proceeds on the prototype's behavior meanwhile. A decision Terry already made (D1-D3)
  outranks the prototype without asking.
- **Subagents: as planned** in `mvp-staffing-plan.md`, five T1 authors at once.
- A reboot is no longer needed for credentials: nothing reads environment variables.

## Next action when unblocked

Start **MVP T1** per `docs/planning/mvp-staffing-plan.md`: five authors (MVP-01 A, B, C; MVP-02 A, B),
reviewers relaying in as authors finish. Before dispatch, the Lead writes the frozen interfaces the
splits depend on (MVP-02: the npm script names).

## Known loose ends (none block T1)

- **TypeScript language server:** not available on TypeScript 7 (no `tsserver`); recorded, not skipped.
  Biome is the TypeScript linter, wired in MVP-02. Terry said in chat on 2026-11-13: "Waived for now
  until TS 7.1 drop in a few months." By his global rule only an override he writes in this project's
  `CLAUDE.md` counts, and an agent MUST NOT write it for him; until he does, report the gap.
- **Python linting in this repo:** `ruff` and `pyright` are not wired to a gate for `mocks/tools/*.py`
  and `docs/planning/render-plan.py`; checks so far were run by hand.
- **`render-logo.py`** stamps 300 DPI without the retry `render-mock.py` has; it runs rarely.
- **Codex leftovers, by Terry's choice:** the paused `swimcoach-project-watch` Codex automation still
  points at the deleted `v001` folder; `~/.codex` is otherwise untouched.
- **Global hook health:** the `hook-health.py` sweep reported stale at the start of the 2026-11-13 session. It is
  Terry's global setup, not this repo.
- **Rest of the palette and AAA:** only white on the good-news green is held to AAA; the red card's
  white text is 4.83:1 (`docs/brand.md` section 5).
