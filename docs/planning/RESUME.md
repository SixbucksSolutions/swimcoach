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
   - Still open for MVP-06: how a card is tied to a time block, and where the reporter gets the
     service URL and its Bot token. Neither blocks T1 or T2.
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

Checked and fine: the account's `workers.dev` subdomain is `sixbuckssolutions`, so the URL will be
`swimcoach.sixbuckssolutions.workers.dev`. The account already runs the `fga-api` and `fga-m28-stage`
Workers.

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
