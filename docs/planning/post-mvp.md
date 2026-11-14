# Punted to after the MVP

The MVP exists to kick the tires and formalize requirements, not to polish (Terry, 2026-11-14:
"this isn't a big splashy V1"). When something is real but not needed to learn what Terry wants, it
is **punted here instead of built**: "punt with a doc for post MVP is a button we should press
often/aggressively" (Terry, 2026-11-14). RFC 2119 keywords; the capitals are load-bearing.

- Any agent MAY add an entry, and SHOULD prefer adding one to opening another review round.
- Each entry MUST say what it is, where it came from, and why it can wait.
- The gaps V2 MUST close are not repeated here: they live in the qualification record,
  [`docs/qualification/README.md`](../qualification/README.md).

## Entries

| Item | Source | Why it can wait |
| --- | --- | --- |
| Refuse the attached (`-pFGA`) and equals (`--project=FGA`) value forms, so only `-p FGA` / `--project FGA` parse | Terry, 2026-11-14, "only want that if free" | Commander 15 has no setting for it; it would take our own parsing code. The docs show only the spaced form |
| A UI case for the slot refit across SIGN IN and back | PR #48 review | STALE and OFFLINE cases cover the same code path (the warning line changing the card area) |
| A hidden tab does not run the slot refit until shown again, which can leave a gap under the last slot for up to 30 s | PR #48 review | Never cuts a slot off, and corrects itself when the tab is shown |
| `npm ci` reports the esbuild and workerd install scripts as blocked by `allowScripts` | T5 close, 2026-11-14 | Check, build and deploy all work without them; approving them edits `package.json`, which is Terry's call |
