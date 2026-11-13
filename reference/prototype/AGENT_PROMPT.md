# Add this to each monitoring agent's 10-minute task

Paste the block below into the scheduled task of every monitoring agent (Claude Code, Codex, anything
that can run `curl`). Replace `SWIMCOACH_URL` with the board's address, e.g. `http://nas.local:8787`.

---

After you finish each board check and before you post the chat TL;DR, also report every in-flight
project to the swimcoach status board. Send one JSON object per project (or a JSON array of them in a
single request), using the same numbers you put in the chat post:

```bash
curl -sS -X POST "$SWIMCOACH_URL/api/report" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "source": "codex",
  "project": "FGA T04",
  "hours": { "used": 1.85, "allocated": 4.0 },
  "lanes": {
    "Backlog": 0,
    "Ready For Work": 2,
    "In progress": 1,
    "Blocked": 0,
    "Needs Terry": 0,
    "Ready for review": 4
  }
}
JSON
```

Rules:

- `project` (required): the same name every time. It is the key; a changed name creates a new project.
- `source`: which agent system you are (`claude-code`, `codex`, ...).
- `hours.used` / `hours.allocated`: wall-clock hours spent so far and the block allocated for this work.
- `lanes`: the localswim card count per swimlane, in board order, using the lane names exactly as
  above. **Count only the cards that belong to this time block's work**, the same set you use for the
  chat TL;DR. Do not send whole-board totals (the board's lifetime Completed count would swamp the
  ratio).
- How the dashboard treats each lane:
  - `Ready For Work`, `In progress`: unfinished work.
  - `Ready for review`: finished work. If cards from this block have already moved on to `Completed`,
    include that count too; it also counts as finished.
  - `Needs Terry`: unfinished work, and any card here raises the red GO TO KEYBOARD alert.
  - `Blocked`, `Backlog`: shown, but left out of the RTR math.
- Do not skip a report because nothing changed: a silent agent is flagged after 25 minutes.

Optional:

- `needs_me`: one sentence saying exactly what Terry must do. It is shown in the alert in place of
  "1 ticket in Needs Terry". It also raises the alert by itself if no card is in that lane.
- `tldr`: a one- or two-sentence summary to show on the project's detail display.
- `status`: `on_track`, `at_risk`, `behind`, `blocked` or `done`. Normally leave it out; the dashboard
  works it out. Send `done` when the block's work is finished.
- `cards`: instead of `lanes`, every card as `{ "id", "title", "lane" }`.
- `block`: `{ "start", "end" }` as ISO 8601 times with a UTC offset, instead of `hours`.
- `done_lanes`, `attention_lanes`, `parked_lanes`: lists of lane names, only needed if the board's lanes
  are ever renamed.
- If a write token is configured, add `-H "Authorization: Bearer $SWIMCOACH_TOKEN"`.
- If the POST fails, mention it in the chat TL;DR and carry on. Never skip the report because nothing
  changed: a silent agent is flagged as stale after 25 minutes.
