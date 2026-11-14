# swimcoach CLI command line

The command line project agents run to put their milestone on Terry's phone, written by MVP-01 A on
2026-11-13. RFC 2119 keywords; the capitals are load-bearing. V2 MUST keep this command line, so the
agents' instructions never change. The CLI's language, packaging and install location are MVP-06's
call; this document fixes only what an agent types and what it gets back.

The data path (Terry, 2026-11-13): **no relay.** The agent working a project runs `swimcoach` itself,
and the CLI posts straight to the API in [`api.md`](api.md). There is no swimcoach agent and no state
file on disk.

## 1. Synopsis

```text
swimcoach report --agent <codex|claude> --project <name> --milestone <name>
                 --active-hours <hours> --cap-hours <hours>
                 --ready-for-work <n> --in-progress <n> --needs-terry <n>
                 --ready-for-review <n> --completed <n>
                 [--needs-me <sentence>] [common options]

swimcoach report --file <path|-> [common options]

swimcoach stop --project <name> --milestone <name> [common options]

swimcoach --version
swimcoach help [report | stop]
```

### Short forms

Every flag has exactly one short form: one dash and one lowercase letter (Terry, 2026-11-14). A letter
means the same flag in every command, and no letter is used twice.

| Short | Long | Short | Long |
| --- | --- | --- | --- |
| `-a` | `--agent` | `-d` | `--completed` (done) |
| `-p` | `--project` | `-q` | `--needs-me` (question) |
| `-m` | `--milestone` | `-f` | `--file` |
| `-u` | `--active-hours` (used) | `-c` | `--config` |
| `-b` | `--cap-hours` (budget) | `-n` | `--dry-run` |
| `-w` | `--ready-for-work` | `-j` | `--json` |
| `-i` | `--in-progress` | `-v` | `--version` |
| `-t` | `--needs-terry` | | |
| `-r` | `--ready-for-review` | | |

- **A short form behaves exactly like its long form**, in every rule of this document: the same value,
  the same refusals, the same exit codes. The two MAY be mixed in one command, and giving one flag in
  both forms is the same error as giving it twice.
- **A short form's value is always the next argument** (`-p FGA`). The CLI MUST refuse an attached
  value (`-pFGA`, `-p=FGA`) and bundled switches (`-nj`) with exit 2. `--name=value` stays valid for
  long forms.
- An argument that is a short form (one dash and one letter) is never taken as the previous flag's
  value, just as an argument starting with two dashes is not. A name that looks like a flag goes in
  with an equals sign on the long form: `--project=-x`.
- Error messages name the long form.

Common options, on `report` and `stop`:

| Option | Meaning |
| --- | --- |
| `-n`, `--dry-run` | Validate and print the JSON body that would be sent, then exit. Nothing is sent, and the config file is not read |
| `-j`, `--json` | Print the server's JSON response body on stdout instead of the one-line summary |
| `-c`, `--config <path>` | Read this config file instead of the default (section 5). It is the only way to reach a different service |

There is **no `--url` option**, and the CLI MUST refuse one as an unknown flag (exit 2). Section 5 says
why.

There is **no create command.** The first `report` for a (project, milestone) adds it to the board, and
`stop` removes it.

## 2. `swimcoach report`

Sends one complete status report to `POST /api/2026-11-14/report`.

| Flag | Report field | Value |
| --- | --- | --- |
| `--agent` | `agent` | `codex` or `claude` |
| `--project` | `project` | 1-64 characters, for example `"localswim V2"` |
| `--milestone` | `milestone` | 1-32 characters, for example `T06` |
| `--active-hours` | `active_hours` | Decimal hours, 0 to 168, for example `1.85` |
| `--cap-hours` | `cap_hours` | Decimal hours, over 0 and at most 168, for example `4` |
| `--ready-for-work` | `lanes.ready_for_work` | Whole number, 0 to 999 |
| `--in-progress` | `lanes.in_progress` | Whole number, 0 to 999 |
| `--needs-terry` | `lanes.needs_terry` | Whole number, 0 to 999 |
| `--ready-for-review` | `lanes.ready_for_review` | Whole number, 0 to 999 |
| `--completed` | `lanes.completed` | Whole number, 0 to 999 |
| `--needs-me` | `needs_me` | Optional. One sentence, 1-200 characters |

**Every status update is complete, never incremental** (Terry, 2026-11-13).

- **Every flag except `--needs-me` is required, and none has a default.** The CLI MUST refuse a report
  that lacks any of them, MUST name every missing flag in one message, and MUST exit 2 without sending
  anything. A lane the agent forgot is an error, never a zero.
- **The CLI MUST validate the body against [`report.schema.json`](schemas/report.schema.json) before
  sending**, so it refuses exactly what the server would refuse, with the same reasons, and sends nothing.
- **Numbers** use `.` as the decimal point, with no unit, no thousands separator and no sign. Lane
  counts MUST be whole numbers: `2`, not `2.0`.
- **`--needs-me` with an empty value MUST be refused.** Leave the flag out when there is no ask.
- Names and the sentence are passed through exactly as given. The CLI MUST NOT trim, case-fold or
  repair them; it refuses a value the schema refuses.
- **`--file <path>`** reads one report as a UTF-8 JSON file (a leading byte order mark is accepted and
  ignored) and validates and sends it unchanged. `--file -` reads standard input. `--file` and any
  field flag MUST NOT be combined; the CLI exits 2 if they are.
- The CLI MUST NOT send any field the schema does not define. In particular it sends no timestamp: the
  server stamps receive time.

## 3. `swimcoach stop`

Tells swimcoach to stop tracking one (project, milestone), through `POST /api/2026-11-14/stop`. Both flags are
required. The server deletes the milestone and its history, and the card leaves the phone.

When to run it (Terry, 2026-11-13): only after Terry tells the project's agent the milestone is
complete. It is also the way to remove a stray card that a mistyped name created.

A stop for a milestone that is not tracked exits 3, never 0, so a typo cannot pass for success while the
real card stays on the phone.

## 4. Output and exit codes

- **Success prints one line on stdout**, unless `--json` is given. The wording is MVP-06's, and it MUST
  start with a capital and name the milestone, for example `Reported FGA T04: 4 of 7 finished, 1.85 of
  4 h used.` or `Stopped tracking FGA M12.`
- **Errors go to stderr**, one sentence per line, each starting with a capital. On a server refusal the
  CLI MUST print the server's `message` and each `problems` entry.
- **The CLI MUST NOT print the service token secret**, in any output, any error or `--dry-run`.

| Exit | Meaning | Sent? | Retry? |
| --- | --- | --- | --- |
| 0 | Success: the report was stored (a duplicate counts), the milestone was stopped, or a `--dry-run` body is valid | Yes, or nothing for `--dry-run` | No |
| 1 | The CLI itself failed unexpectedly | Unknown | No |
| 2 | Usage or validation error: a missing or unknown flag, a bad value, `--file` combined with field flags | No | No: fix the command |
| 3 | `stop` for a milestone that is not tracked (`404 not_tracked`) | Yes | No: check the names |
| 4 | The server refused the request with any other `4xx` JSON error | Yes | No: fix the body |
| 5 | Authentication failed: `401`, `403`, or a redirect to the Access login | Yes | No: Terry's to fix |
| 6 | The config file is missing, unreadable or malformed, or lacks a key | No | No: Terry's to fix |
| 7 | The server could not be reached or failed: connection error, timeout, `5xx`, or a response that is not this contract's JSON | Maybe | Yes, by the next push |

**Only exit 7 is transient.** The CLI makes one attempt with a 15-second timeout and MUST NOT retry on its
own. Every report is a complete picture, so the agent's next push, at most 10 minutes later, replaces a
lost one; the agent SHOULD carry on working rather than loop on a failure.

## 5. Configuration and the token file

The CLI reads its URL and its Cloudflare Access service token from **one JSON file**, never from an
environment variable and never from a command-line flag. A secret in a flag lands in process lists and in
agent transcripts; an environment variable is the thing Terry has ruled out (`docs/planning/RESUME.md`,
"Local credentials: files, never environment variables"). This is the same rule `scripts/wrangler.ps1`
follows.

| Platform | Default path |
| --- | --- |
| Windows | `%USERPROFILE%\.secrets\swimcoach\cli.json` |
| Any other | `$HOME/.secrets/swimcoach/cli.json` |

`--config <path>` replaces the default. The file is UTF-8 JSON, a leading byte order mark accepted:

| Key | Meaning |
| --- | --- |
| `url` | The service's base URL, for example `https://swimcoach.sixbuckssolutions.workers.dev` |
| `access_client_id` | The Access service token's client ID, sent as `CF-Access-Client-Id` |
| `access_client_secret` | The Access service token's client secret, sent as `CF-Access-Client-Secret` |

- The file SHOULD be readable only by Terry's own account. The `.secrets\swimcoach` folder already is.
- Unknown keys MUST be ignored, so a later version can add one without breaking an older CLI.
- **No key in the file has a command-line override,** `url` included. The URL and the secret live in the
  same file, so the CLI only ever sends the secret to the `url` beside it. A different service means a
  different config file, passed with `--config`.
- **Why there is no `--url`:** the callers are LLM agents that act on text they read, and an injected
  `--url` would send the Access service token secret to another host.

## 6. HTTP behavior

- `report` sends `POST <url>/api/2026-11-14/report`; `stop` sends `POST <url>/api/2026-11-14/stop`.
  Both carry `Content-Type: application/json`, `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
- The CLI MUST send to the dated paths of the API version it was built for ([`api.md`](api.md),
  "Versioning"). The unversioned `/api/...` paths answer `404`.
- The CLI MUST NOT follow redirects. A redirect means Access wants an interactive login, which is exit 5.
- The CLI MUST NOT send the `Swimcoach-Test-Now` header ([`api.md`](api.md) section 9). The black-box
  suite drives HTTP directly; the CLI only ever talks to the real clock.

## 7. Windows

The prototype's agent prompt used a bash heredoc with curl, which breaks on Windows (`docs/concept.md`
section 11). This command line needs no heredoc and no temporary file, and it works the same in cmd,
PowerShell and POSIX shells. Names with spaces go in double quotes.

```bat
swimcoach report --agent codex --project "localswim V2" --milestone T06 --active-hours 1.85 --cap-hours 4 --ready-for-work 2 --in-progress 1 --needs-terry 0 --ready-for-review 3 --completed 1
```

```bat
swimcoach report --agent claude --project FGA --milestone M12 --active-hours 3.1 --cap-hours 4 --ready-for-work 0 --in-progress 1 --needs-terry 1 --ready-for-review 4 --completed 0 --needs-me "Confirm the M12 demo build on your phone."
```

```bat
swimcoach stop --project FGA --milestone M12
```

In cmd, a `%` inside a value is expanded as a variable; an agent SHOULD avoid `%` in `--needs-me`, or use
`--file`.

## 8. What the agent sends, and when

The full instruction text a project's agent follows is MVP-06's deliverable. These rules from the
contract bind it:

- **Push at milestone start, after card moves, and as a heartbeat at least every 10 minutes while
  working, but never more often than once every 5 minutes** (Terry, 2026-11-14). Each push is the
  complete picture, so moves between pushes land in the next one. A card moving to Ready for review or
  Needs Terry above all: a Needs Terry card raises GO TO KEYBOARD. A milestone silent for 25 minutes goes
  gray and the health box goes STALE.
- **Count only this milestone's epic,** never the whole cumulative board.
- **Decision D3:** count a card in Needs Terry, and send `--needs-me`, only for a gate waiting on Terry
  himself (visual confirmation, Completed, cutover, a demo). An agent-owned gate changes nothing, and a
  card in Ready for review is not by itself a request.
- **Stop only when Terry says the milestone is complete.**
