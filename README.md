# swimcoach

A self-hosted, mobile-first status board for agent-run software work.

Monitoring agents (one per agent-based dev system, such as Codex or Claude Code) report a snapshot of
each in-flight project every few minutes. You keep the page open on a phone or tablet and can see at a
glance whether everything is still moving and which project needs you.

<img src="docs/img/display-1-all-projects.png" alt="The all-projects display, rendered from the prototype on sample data" width="280">

> **Status:** concept stage. Nothing has been built for v1 yet. The design and a runnable reference
> prototype are captured below.

## Start here

- **[AGENTS.md](AGENTS.md)**: working agreements and the mock workflow, for any agent working here.
- **[docs/concept.md](docs/concept.md)**: the full concept, including the problem, displays, card
  rules, RTR math, the localswim lane mapping, the architecture, the decisions and their reasons, open
  questions, and what's out of scope.
- **[mocks/index.html](mocks/index.html)**: the clickable mock. It's one self-contained file: open it in
  a browser (phone or desktop) and switch scenarios to see each state. It needs no server.
- **[docs/img/](docs/img/)**: screenshots of every display, rendered from the prototype on sample data
  at iPhone 16 size.
- **[reference/prototype/](reference/prototype/)**: the prototype from the design conversation. It's
  kept so it can be run and read, not as the codebase going forward.

## In one paragraph

Agents POST per-project lane counts and hours to the server. The server computes **RTR** (share of
tickets Ready for Review ÷ share of the time block used), a five-bin trend, a projection, and the
chance of landing inside the block, and holds back a verdict while history is thin. The phone shows a
ruthlessly minimal row of project cards (green, yellow, red only for *Needs Terry*), a GO TO KEYBOARD
banner when Terry has to act, one swipe-over detail display per project, and a LIVE indicator so a
stalled feed never reads as all-good.

## Data source

Project status comes from [localswim](https://github.com/localswim/localswim), a swimlane board that
agents update through its CLI.

## License

[MIT](LICENSE)
