# AGENTS.md

Guidance for any agent (Claude, Codex, ...) working in this repo. Read this first, then
[docs/concept.md](docs/concept.md).

## What this is

swimcoach is a self-hosted, mobile-first status board for Terry's agent-run software projects.
Monitoring agents report each in-flight project; Terry watches a page on his phone. The full concept
(displays, card rules, RTR math, localswim lane mapping, architecture, decisions, open questions) is in
`docs/concept.md`.

## Current phase: clickable mocks, not the app

- **Nothing is built for v1 yet, and nothing should be until Terry says so.** The current phase is HTML
  clickable mocks, so Terry and the agent agree on look, feel and UX intent before any build.
- The stack for v1 has not been chosen (concept.md section 8).
- `reference/prototype/` is the earlier "super prototype": a runnable reference and a spec, not code to
  extend. Its known defects are in concept.md section 11.

## Repo map

| Path | What |
|---|---|
| `docs/concept.md` | The concept and knowledge transfer. Keep it current when decisions change |
| `docs/img/` | Screenshots of the prototype |
| `mocks/index.html` | The clickable mock: one self-contained file, no server |
| `mocks/tools/make-scenarios.py` | Builds the mock's sample data with the prototype's math and writes it into `mocks/index.html` |
| `mocks/tools/render-mock.py` | Renders every mock screen to `design/ui-mock/` |
| `design/ui-mock/` | PNG renders of the mock, with an index README |
| `reference/prototype/` | The prototype (reference only) |

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
- **Terry's viewer is Chrome on an iPhone 16.** Chrome on iOS runs on WebKit, so treat it like Safari:
  no vibration API, and audio needs a tap first. Design and test at 393 × 852 CSS px.
- **Terry gives concepts, not designs.** He asks the agent to turn them into good UI, and to hold the
  phone view to "simple, at a glance" even when he is tempted by more detail.
- Agent-made commits end with a `Co-Authored-By:` trailer for the agent.

## Mock workflow

1. Edit `mocks/index.html`. Everything outside `#phone` is mock chrome (scenario controls), not design.
2. If the sample data changes, edit the scenarios in `mocks/tools/make-scenarios.py` and run it. It
   starts the prototype server on a throwaway database and writes the data between the `SCENARIOS`
   markers.
3. Click-test at 393 × 852: every card opens its project, "‹ All projects" returns, the dots and swipes
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
