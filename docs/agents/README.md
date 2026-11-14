# Agent instructions

RFC 2119 keywords; the capitals are load-bearing.

This folder holds the text that tells a project's agent how to report its milestone to swimcoach. It
replaces `reference/prototype/AGENT_PROMPT.md` for real use; the prototype file stays as reference.

| File | What |
| --- | --- |
| [`swimcoach-reporting.md`](swimcoach-reporting.md) | The instruction text, ready to paste |

## How Terry adds it to a project

1. Open the project's `AGENTS.md` (for Codex) or `CLAUDE.md` (for Claude).
2. Paste the whole of `swimcoach-reporting.md` into it.
3. Tell the agent the project name and the milestone name to use. They MUST stay the same spelling for
   the whole milestone.

The command line the text uses is fixed by [`contract/cli.md`](../../contract/cli.md), so the pasted text
does not change when V2 replaces the MVP.

## Prerequisites

- **Node 26 on `PATH`.** The CLI runs on it. Nothing else to install.
- **`cli.json` already in `%USERPROFILE%\.secrets\swimcoach`.** It holds the service address and the
  Access service token. The agents MUST NOT read it, and nothing is passed on the command line.
- **The CLI at `C:\Projects\swimcoach\bin\swimcoach.cmd`.** Agents call it by that absolute path.
