# AGENTS.md

**Resuming work? Read [`docs/planning/RESUME.md`](docs/planning/RESUME.md) first:** where things
stand, what is blocked on Terry, and the next action.

Guidance for any agent (Claude, Codex, ...) working in this repo. Read this first, then
[docs/concept.md](docs/concept.md).

## What this is

swimcoach is a self-hosted, mobile-first status board for Terry's agent-run software projects.
Each project's own agent reports its milestone with the swimcoach CLI; Terry watches a page on his
phone. There is no swimcoach agent and no monitoring agent. The full concept
(displays, card rules, RTR math, localswim lane mapping, architecture, decisions, open questions) is in
`docs/concept.md`.

## Current phase: MVP shipped, V1 next

- **The MVP is built, deployed and qualified** (turns T1 to T6, shipped 2026-11-14): a Cloudflare
  Worker with one SQLite-backed Durable Object, in TypeScript, behind Cloudflare Access, at
  `https://swimcoach.sixbuckssolutions.workers.dev`. The qualification record is
  `docs/qualification/README.md`. **Terry has not yet accepted it**; RESUME says what is open.
- **The sequence is MVP, then V1, then V2** (Terry, 2026-11-14): "V1 is semi-stable and V2 will be
  rewrite", and "V1 will extend MVP code". So V1 works on this codebase. V2 is the greenfield,
  zero-reuse rewrite of `docs/concept.md` section 14. Whether V2 reproduces the MVP's behavior or V1's
  is Terry's call and not yet recorded.
- **V1's requirements** are the UX ledger rows marked `Yes` at MVP acceptance
  (`contract/ux-ledger.md`, V1 column). The contract, schemas, ledger and the two black-box suites in
  `acceptance/` are the behavior; they move together, never by drift.
- **The mock phase closed on 2026-11-13.** `mocks/index.html` is the approved design, with every
  decision and its reason in `docs/concept.md` sections 2 and 3 and `docs/brand.md`.
- **Real use has begun:** the first project agent (localswim V2 UI, on Codex) reports through the CLI
  following `README.md`'s "Agents Directed To Post Updates".
- `reference/prototype/` is the earlier "super prototype": a runnable reference and a spec, not code to
  extend. Its known defects are in concept.md section 11.

## Repo map

| Path | What |
|---|---|
| `docs/concept.md` | The concept and knowledge transfer. Keep it current when decisions change |
| `docs/brand.md` | The brand guide: mark, wordmark, typeface, colors, motion, voice. Check it before adding any visual |
| `docs/planning/post-mvp.md` | Work punted to after the MVP. Punt real-but-not-needed work here instead of building it (Terry: press that button often) |
| `docs/qualification/` | The MVP-12 qualification record: what passed, where, and the gaps V2 MUST close |
| `docs/img/` | Screenshots of the prototype |
| `public/` | The MVP page (MVP-08), served from `GET /`, `/css/*.css` and `/js/*.js`: `index.html`, `css/`, and `js/` ES modules checked by `tsc -p tsconfig.page.json` (`// @ts-check` plus JSDoc, no build step) |
| `acceptance/` | The black-box API acceptance suite (MVP-09); `acceptance/api/types.ts` is its frozen case format |
| `mocks/index.html` | The clickable mock: one self-contained file, no server. The approved design; no longer deployed |
| `mocks/tools/make-scenarios.py` | Builds the mock's sample data with the prototype's math and writes it into `mocks/index.html` |
| `mocks/tools/render-mock.py` | Renders every mock screen to `design/ui-mock/` |
| `mocks/tools/embed-font.py` | Writes the Inter font file into `mocks/index.html` between the `FONT` markers; `--target public/index.html` for the page |
| `design/logo/` | The swimcoach mark: `swimcoach.svg` is the one definition; PNGs, design history and rules in its README |
| `mocks/tools/render-logo.py` | Renders the mark to PNG, including the iPhone home-screen icon |
| `mocks/tools/embed-logo.py` | Writes the mark into `mocks/index.html` between the `LOGO` markers: favicon, touch icon, header `--brand`; `--target public/index.html` for the page |
| `third_party/inter/` | The Inter font file (Latin subset), its OFL license, and how it was made |
| `THIRD-PARTY-NOTICES.md` | Credits and licenses for everything not under swimcoach's MIT license |
| `design/ui-mock/` | PNG renders of the mock, with an index README |
| `reference/prototype/` | The prototype (reference only) |
| `scripts/wrangler.ps1` | Runs Wrangler with the Cloudflare token and account ID read from files in `%USERPROFILE%\.secrets\swimcoach`. Every local Wrangler command MUST use it; Terry keeps these credentials out of environment variables |
| `scripts/localswim.ps1` | Runs the shared localswim service's CLI as Bot, for swimcoach's own work cards (board `swimcoach`). Every localswim call MUST use it; RESUME says where the service and credentials live |

## Working agreements

- **Push every commit to GitHub right away.** The repo is public and pushes are Terry's backups.
- **`C:\Projects\swimcoach` on Terry's laptop is the authoritative working copy.** Keep it and
  `github.com/SixbucksSolutions/swimcoach` in sync; after pushing from anywhere else, pull it there.
- **Don't force-push** unless Terry explicitly asks. History was reset once, on Terry's instruction, when
  the current design started and an earlier chatops collector was retired.
- **Images and diagrams are PNGs at 300 DPI.**
- **US English spelling.**
- **Windows commands are for cmd, not PowerShell.** Use `cd /d`, and `python` or `py` rather than
  `python3`.
- **Terry's viewer is Chrome on an iPhone 16 Pro.** Chrome on iOS runs on WebKit, so treat it like
  Safari: no vibration API, and audio needs a tap first. Design and test at 402 × 874 CSS px (1206 ×
  2622 at 3×). Earlier docs said iPhone 16 at 393 × 852; Terry corrected the model on 2026-11-13.
- **Colors come from the palette tokens in `docs/brand.md` section 5, never a new hex.** RFC 2119
  keywords; the capitals are load-bearing. The good-news fill is `--ok-fill` `#1B6445` with pure white
  text: it MUST clear WCAG AAA (7:1) and measures 7.11:1. Text on it MUST stay at full opacity. A second
  green MUST NOT be introduced. Terry's requirement, 2026-11-13.
- **Text is set in the Inter typeface.** A third-party asset MUST NOT be added without its license beside
  it and an entry in `THIRD-PARTY-NOTICES.md`.
- **Terry gives concepts, not designs.** He asks the agent to turn them into good UI, and to hold the
  phone view to "simple, at a glance" even when he is tempted by more detail.
- Agent-made commits end with a `Co-Authored-By:` trailer for the agent.

## Mock workflow

1. Edit `mocks/index.html`. Everything outside `#phone` is mock chrome (scenario controls), not design.
2. If the sample data changes, edit the scenarios in `mocks/tools/make-scenarios.py` and run it. It
   starts the prototype server on a throwaway database and writes the data between the `SCENARIOS`
   markers.
3. Click-test at 402 × 874: every card opens its project, "‹ All projects" returns, the dots and swipes
   move between displays, and the scenario switcher works.
4. Run `uv run --no-project --with playwright --with pillow python mocks/tools/render-mock.py` to refresh
   `design/ui-mock/`. Terry's Python is uv-managed and marked externally managed (PEP 668), so
   `pip install` into it fails; `uv run --with` gives the script a throwaway environment instead. The
   first time on a machine, also run `uv run --no-project --with playwright python -m playwright install
   chromium`.
5. Republish the hosted mock. Terry checks the mock on desktop and phone at a private claude.ai
   artifact, published from `mocks/index.html`. A Claude session republishes it by publishing that same
   file to the artifact's URL, which keeps the link stable. Ask Terry for the URL if the session does
   not have it. A publish without the URL creates a second artifact and a new link.
6. Commit, push, and pull into `C:\Projects\swimcoach`.

## Pushing from a sandbox without GitHub credentials

If the laptop copy has commits that a credential-less shell cannot push: run `git bundle create
<file> origin/main..main` in `C:\Projects\swimcoach`, fetch the bundle into a clone that can push,
fast-forward `main`, push, then delete the bundle and `git fetch` in `C:\Projects\swimcoach`. Commit
hashes stay identical.

## Open questions waiting on Terry

See concept.md section 8. The two most visible: whether tickets in Needs Terry should count against RTR,
and whether to keep the gray (too early) and dark slate (done) card colors beyond green, yellow and red.
