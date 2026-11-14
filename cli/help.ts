// The text of `swimcoach help`, `help report` and `help stop` (contract/cli.md sections 1 to 3).

const COMMON = `Common options:
  -n, --dry-run        Validate and print the JSON body that would be sent. Sends nothing and reads no config.
  -j, --json           Print the server's JSON response instead of the one-line summary.
  -c, --config <path>  Read this config file instead of the default. The only way to reach another service.`;

const REPORT = `Usage:
  swimcoach report --file <path|-> [common options]
  swimcoach report --agent <codex|claude> --project <name> --milestone <name>
                   --active-hours <hours> --cap-hours <hours>
                   --ready-for-work <n> --in-progress <n> --needs-terry <n>
                   --ready-for-review <n> --completed <n>
                   [--needs-me <sentence>] [common options]

Every status update is complete. Give EITHER --file OR every field flag below except --needs-me.
--file reads one report as UTF-8 JSON ("-" reads standard input) and cannot be combined with field flags.

Field flags (each value is the next argument):
  -a, --agent <codex|claude>
  -p, --project <name>          1 to 64 characters
  -m, --milestone <name>        1 to 32 characters
  -u, --active-hours <hours>    hours used so far, 0 to 168
  -b, --cap-hours <hours>       the time budget, over 0 and at most 168
  -w, --ready-for-work <n>      lane counts: whole numbers, 0 to 999
  -i, --in-progress <n>
  -t, --needs-terry <n>
  -r, --ready-for-review <n>
  -d, --completed <n>
  -q, --needs-me <sentence>     optional; one sentence of 1 to 200 characters, left out when there is no ask
  -f, --file <path|->

${COMMON}`;

const STOP = `Usage:
  swimcoach stop --project <name> --milestone <name> [common options]
  swimcoach stop -p <name> -m <name> [common options]

Stops tracking one milestone and deletes its history. Run it only after Terry says the milestone is
complete. A milestone that is not tracked exits 3.

${COMMON}`;

const GENERAL = `Usage:
  swimcoach report ...       Send one complete status report.
  swimcoach stop ...         Stop tracking one milestone.
  swimcoach -v, --version
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
