#!/bin/bash
# Runs the shared localswim service's CLI as Bot from agentspace, Terry's Linux agent host
# (github.com/SixbucksSolutions/agentspace). RFC 2119 keywords; the capitals are load-bearing.
#
# This is the Linux counterpart of scripts/localswim.ps1, which is Windows-only. Every localswim
# call an agent makes on agentspace MUST go through this script. It hands every argument, unchanged,
# to agentspace's `localswim` wrapper, which runs the CLI as Bot with the URL and token set for that
# one run, and never prints the token. The board runs on Terry's laptop and reaches the box only
# while he is connected over SSH; when it is unreachable the wrapper refuses with a message, and
# the agent MUST stop and report rather than work without a card.
#
# Example:
#   scripts/localswim.sh card list 62728944-eac7-482c-bd46-4d8f206e5381
set -euo pipefail

wrapper=/usr/local/bin/localswim
if [ ! -x "$wrapper" ]; then
  echo "localswim.sh: Missing $wrapper. This script runs only on agentspace; on Windows use scripts/localswim.ps1." >&2
  exit 1
fi
exec "$wrapper" "$@"
