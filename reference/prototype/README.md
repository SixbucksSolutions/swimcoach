> **Reference only.** This is the prototype from the design conversation, kept so its behavior can be run
> and read while v1 is designed. It is not the code going forward. Gaps and known defects are listed in
> [docs/concept.md, section 11](../../docs/concept.md#11-known-gaps-and-defects-in-the-prototype). On Windows,
> use `python` (or `py`) where this file says `python3`.

# swimcoach

A self-hosted, mobile-first status board for agent-run software work. Monitoring agents POST a snapshot
of each in-flight project every few minutes; you keep the page open on a phone or tablet.

It is deliberately framework-neutral: anything that can make an HTTP request can report. One Python file,
standard library only, SQLite for storage, no build step.

## What you see

RTR below means the RFR / Time ratio: share of tickets Ready for Review divided by share of the time
block used.

The site is a row of full-screen displays. Swipe left and right to move between them; the dots at the
bottom show where you are.

### Display 1: all projects

Deliberately minimal.

- **GO TO KEYBOARD**: a red banner, hidden unless a card is sitting in the Needs Terry swimlane (or an
  agent sets `needs_me`). It names the project and the ask. Tap "Alerts off" in the header to add a chime
  and vibration when it appears.
- **One card per project**, in a fixed alphabetical order so a card never moves. The card's background
  is the whole message:
  - **Green**: projected to land inside its time block. Shows only the name, RTR and the trend arrow.
  - **Yellow**: needs a look. Toss-up or running late on landing in time, no ticket moved in 45 minutes,
    or its monitoring agent silent for 25 minutes. One line says which.
  - **Red**: Needs Terry. Reserved for that and nothing else.
  - **Gray**: too early to call.
  A card with something in Blocked adds a small "1 blocked" note without changing color. Tap a card to
  jump to that project's display.

### How the localswim swimlanes are used

| Swimlane | In RTR | Effect |
|---|---|---|
| Backlog | No | Shown on the project display only |
| Ready For Work | Yes, unfinished | |
| In progress | Yes, unfinished | |
| Blocked | No | Shown on the card ("1 blocked") and the project display; never changes the color |
| Needs Terry | Yes, unfinished | Any card here turns the project red and raises GO TO KEYBOARD |
| Ready for review | Yes, finished | The "RFR" in RTR |
| Completed | Yes, finished | Only if the agent includes this block's completed cards |

Lanes are matched by name, so the defaults follow the board. A report can override them with
`done_lanes`, `attention_lanes` and `parked_lanes`.

### Displays 2 and on: one project each

A full-phone page of numbers and graphs for a single project: RTR with its trend arrow and the call, the
RTR timeline for the day against 1.00, the projection (chance of landing on time, how early or late,
projected RTR at the end of the block, RTR trend), work against time, and each swimlane's count and
share.

### Always on screen

- **LIVE box** (header): bold white LIVE on dark green only while the page is reaching the board *and*
  an agent has reported within the last 25 minutes; the number beside it is the age of the newest
  report. Otherwise it reads STALE or OFFLINE, a warning appears and every display is grayed out. The
  dot breathes for about 16 seconds after each successful refresh and then stops on its own, so a
  frozen page cannot keep looking alive.

### The call, the trend and "too early to call"

- **RTR trend** is an arrow in five bins, from the change over the last hour: sharp up (+0.20 or more),
  up (+0.05 or more), flat, down, sharp down.
- **The call** answers: will the work land at or before the end of the time block? "On time" is a 70%
  or better chance, "Running late" 30% or less, "Toss-up" in between.
- **Too early to call**: until a project has 45 minutes of history, at least 4 reports in it and 15% of
  its block used, the board makes no call and shows no trend. One early ticket can make RTR look great
  or terrible.

There is no activity log on the page; `GET /api/state` still returns today's events if you want them.
The board shows projects reported since local midnight; yesterday's drop off on their own.

## How the projection and the chance are worked out

At the end of the block the time used is 100%, so RTR at that moment equals the share of tickets done.
"Will RTR be at or above 1.0 when the block ends" is therefore the same question as "will every ticket
be done by then".

- **Projection**: take the tickets finished and the time spent over the last hour, assume that pace
  holds, and see when the last ticket lands.
- **Chance**: the pace is a guess built from a handful of events, so it is treated as an uncertain rate.
  If only 2 tickets landed in the last hour the true rate could easily be 1 or 4; if 8 landed it is much
  better pinned down. The board models completions as a steady random process with that uncertainty
  (Poisson rate, Jeffreys prior, negative-binomial prediction) and reports the probability that all
  remaining tickets land in the time left.

Treat the percentage as a rough guide. Real work is burstier than the model, tickets differ in size, and
it knows nothing about a ticket that is 90% done.

## Run it

Dev box:

    python3 server.py                 # http://<this-machine>:8787

QNAP (Container Station) or any Docker host: copy this folder over, then

    docker compose up -d --build

Data lives in `./data/swimcoach.db`. Set `TZ` in `docker-compose.yml` to your timezone.

See it with sample data: `python3 demo.py http://<host>:8787`

On the phone or tablet, open the URL and use "Add to Home Screen" for a full-screen view.

## Wire up the agents

Give each monitoring agent the text in `AGENT_PROMPT.md`. That is the whole integration.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/report` | One report object or an array of them. Schema in `AGENT_PROMPT.md`. |
| GET | `/api/state?since=<epoch>` | Everything the page renders, as JSON. |
| DELETE | `/api/projects/<name>` | Remove a project and its timeline. |
| GET | `/healthz` | Liveness check. |

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `SWIMCOACH_PORT` | `8787` | Listen port |
| `SWIMCOACH_DB` | `data/swimcoach.db` | SQLite file |
| `SWIMCOACH_TOKEN` | empty | If set, writes need `Authorization: Bearer <token>` |
| `SWIMCOACH_STALE_MINUTES` | `25` | Silence before a project is flagged stale |
| `SWIMCOACH_STALL_MINUTES` | `45` | No ticket movement before a project counts as stalled |
| `SWIMCOACH_TREND_MINUTES` | `60` | Look-back window for the RTR trend and projection |
| `SWIMCOACH_MIN_HISTORY_MINUTES` | 75% of the trend window | History needed before a projection is made |
| `SWIMCOACH_MIN_BLOCK_USED` | `0.15` | Share of the time block that must be used before a projection is made |
| `SWIMCOACH_KEEP_DAYS` | `14` | Timeline retention |

Reads are unauthenticated and the server speaks plain HTTP, so keep it on your LAN or behind a VPN or
reverse proxy rather than exposing it to the internet.
