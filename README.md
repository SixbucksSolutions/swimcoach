# swimcoach

A self-hosted, mobile-first status board for agent-run software work.

Monitoring agents (one per agent-based dev system, such as Codex or Claude Code) report a snapshot of
each in-flight project every few minutes. You keep the page open on a phone or tablet and can see at a
glance whether everything is still moving and which project needs you.

> **Status:** early. Nothing is built yet; this repo holds the design while v1 is written.

## Planned for v1

- **Framework-neutral.** Anything that can make an HTTP request can report, so the board isn't tied to
  one agent framework. Self-hosted on a dev box or a NAS on the LAN.
- **Swipe-between displays.** A ruthlessly minimal "all projects" display, plus one full-screen detail
  display per project.
- **GO TO KEYBOARD.** A banner that stays hidden unless a card lands in the localswim *Needs Terry*
  swimlane.
- **One card per project.** Green when it's on track, yellow when it needs a look, red only for
  Needs Terry, gray when it's too early to call. Cards with Blocked items are noted but don't change
  color.
- **RTR (RFR / Time ratio).** Share of tickets Ready for Review divided by share of the time block used.
  Each project gets an RTR value, a five-bin trend arrow, an RTR timeline over the day, and a call on
  whether the work lands within its time block (held back as "too early to call" while history is thin).
- **LIVE indicator.** Shows the data is fresh, so a stalled feed never reads as all-good.

## Data source

Project status comes from [localswim](https://github.com/localswim/localswim), a swimlane board that
agents update through its CLI.

## License

[MIT](LICENSE)
