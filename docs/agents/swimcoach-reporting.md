## Report your milestone to swimcoach

RFC 2119 keywords; the capitals are load-bearing. Paste this section into the project's `AGENTS.md`
(Codex) or `CLAUDE.md` (Claude). Terry watches your milestone on his phone through swimcoach, and you
feed it.

### How it works

- **There is no relay.** You, the project's own agent, run the CLI yourself. Nothing else reports for you.
- **Call it by absolute path:** `C:\Projects\swimcoach\bin\swimcoach.cmd`. You MUST NOT rely on `PATH`.
- **It works the same in cmd and PowerShell.** Put names with spaces in double quotes.
- **You MUST NOT pass a URL, a token or any secret.** The CLI has no `--url` flag and refuses one. It reads its
  address and credentials from a file Terry set up. You MUST NOT read that file, print it or copy it.

### When to report

You MUST report:

1. **At milestone start.**
2. **On every card move.** Above all when a card moves to Ready For Review or to Needs Terry. A card in
   Needs Terry raises GO TO KEYBOARD on his phone, so report it at once.
3. **As a heartbeat at least every 10 minutes while you work**, even when nothing changed. Silence for 25
   minutes turns the milestone gray and marks it STALE.

### What to send

- **Every report is complete.** Send all fields every time. You MUST NOT send only what changed. The CLI refuses
  a report that lacks any field, and a lane you forgot is an error, never a zero.
- **Count only this milestone's epic.** Send the five lanes of THIS milestone's epic: Ready For Work, In
  Progress, Needs Terry, Ready For Review, Completed. You MUST NOT send whole-board counts; the board is
  cumulative and those numbers wreck the math.
- `--agent` is `codex` or `claude`. `--project` is the project's stable name (1-64 characters) and
  `--milestone` is the milestone name (1-32 characters). Use the exact same spelling every time. A
  changed spelling creates a second card.
- `--active-hours` is the total active time spent on this milestone so far, in decimal hours (`1.85`).
  `--cap-hours` is the milestone's maximum time (`4`). Use `.` as the decimal point and no unit.
- Lane counts are whole numbers: `2`, not `2.0`.

### The Needs Terry rule (decision D3)

- **Count a card in `--needs-terry`, and send `--needs-me`, only for a gate waiting on Terry himself:**
  visual confirmation, Completed, cutover, a demo.
- **An agent-owned gate changes nothing.** An Architect release, for example, is not Terry's.
- **A card in Ready For Review is not by itself a request.** You MUST NOT send `--needs-me` for it.
- `--needs-me` is one sentence of 1-200 characters that says exactly what Terry must do, for example
  `"Confirm the M12 demo build on your phone."`. Leave the flag out when there is no ask. You MUST NOT pass an
  empty value.
- You SHOULD NOT put `%` in the sentence: cmd expands it as a variable. Rephrase it, or use `--file`.

### Commands

```bat
C:\Projects\swimcoach\bin\swimcoach.cmd report --agent codex --project "localswim V2" --milestone T06 --active-hours 1.85 --cap-hours 4 --ready-for-work 2 --in-progress 1 --needs-terry 0 --ready-for-review 3 --completed 1
```

```bat
C:\Projects\swimcoach\bin\swimcoach.cmd report --agent claude --project FGA --milestone M12 --active-hours 3.1 --cap-hours 4 --ready-for-work 0 --in-progress 1 --needs-terry 1 --ready-for-review 4 --completed 0 --needs-me "Confirm the M12 demo build on your phone."
```

```bat
C:\Projects\swimcoach\bin\swimcoach.cmd stop --project FGA --milestone M12
```

Add `--dry-run` to check a command without sending anything. It prints the JSON body it would send.

### Exit codes

Success prints one line on stdout. Errors print to stderr. The CLI makes one attempt and never retries.

| Exit | Meaning | What you do |
| --- | --- | --- |
| 0 | Stored, stopped, or a valid `--dry-run` | Carry on |
| 1 | The CLI itself failed | Carry on; mention it in your next status line to Terry |
| 2 | Usage error: a missing or unknown flag, or a bad value | Fix the command, using the message. Run it once more |
| 3 | `stop` for a milestone that is not tracked | Check the project and milestone spelling. You MUST NOT retry blindly |
| 4 | The server refused the body | Fix the body, using the printed `problems`. Run it once more |
| 5 | Authentication failed | Stop reporting. Tell Terry; it is his to fix |
| 6 | The config file is missing or broken | Stop reporting. Tell Terry; it is his to fix |
| 7 | The server was unreachable or failed | **The only transient code.** Do nothing special: your next push replaces the lost one |

- **You MUST NOT loop on a failure.** You MUST NOT retry in a loop, sleep and retry, or hunt for another route. On any
  failure, carry on with the milestone's real work.
- Exit 5 and 6 are Terry's to fix. Report them to Terry once, then stop sending until he says it is fixed.
- A failure MUST NOT stop your work on the milestone.

### Stopping

- **Run `stop` only after Terry tells you the milestone is complete.** The server deletes the milestone
  and its history, and the card leaves his phone.
- **The one other use:** removing a stray card that a mistyped name created. Stop that exact mistyped
  pair, then report again with the correct names.
- You MUST NOT run `stop` because your own work is finished. Finished work sits in Ready For Review and
  Completed until Terry says it is done.
