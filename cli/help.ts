// The text of `swimcoach help`, `help report` and `help stop` (contract/cli.md sections 1 to 3).

const COMMON = `Common options:
  --dry-run        Validate and print the JSON body that would be sent. Sends nothing and reads no config.
  --json           Print the server's JSON response instead of the one-line summary.
  --config <path>  Read this config file instead of the default. The only way to reach another service.`;

const REPORT = `Usage:
  swimcoach report --agent <codex|claude> --project <name> --milestone <name>
                   --active-hours <hours> --cap-hours <hours>
                   --ready-for-work <n> --in-progress <n> --needs-terry <n>
                   --ready-for-review <n> --completed <n>
                   [--needs-me <sentence>] [common options]
  swimcoach report --file <path|-> [common options]

Every status update is complete. Every flag except --needs-me is required and has no default.
--file reads one report as UTF-8 JSON ("-" reads standard input) and cannot be combined with field flags.
--needs-me is one sentence of 1 to 200 characters; leave it out when there is no ask.

${COMMON}`;

const STOP = `Usage:
  swimcoach stop --project <name> --milestone <name> [common options]

Stops tracking one milestone and deletes its history. Run it only after Terry says the milestone is
complete. A milestone that is not tracked exits 3.

${COMMON}`;

const GENERAL = `Usage:
  swimcoach report ...       Send one complete status report.
  swimcoach stop ...         Stop tracking one milestone.
  swimcoach --version
  swimcoach help [report | stop]

Exit codes: 0 success, 1 unexpected failure, 2 usage or validation error, 3 not tracked,
4 refused by the server, 5 authentication failed, 6 config file problem, 7 server unreachable or failed.`;

function helpText(topic: string | undefined): string | undefined {
  if (topic === undefined) {
    return GENERAL;
  }
  if (topic === "report") {
    return REPORT;
  }
  if (topic === "stop") {
    return STOP;
  }
  return undefined;
}

export { helpText };
