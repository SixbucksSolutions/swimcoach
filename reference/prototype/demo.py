#!/usr/bin/env python3
"""Post an hour of sample history so you can see the board working:
   python3 demo.py [http://host:8787] [token]"""
import json, sys, urllib.request
from datetime import datetime, timedelta

base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"
token = sys.argv[2] if len(sys.argv) > 2 else ""
now = datetime.now().astimezone()
STEPS = [60, 50, 40, 30, 20, 10, 0]  # minutes ago

# name, source, hours allocated, tickets, hours used now, tickets Ready for Review at each step, whether a ticket lands in the needs-you lane
PROJECTS = [
 ("demo: search-index",      "codex",       2.0, 5, 1.80, [1, 1, 1, 1, 1, 1, 1], True),
 ("demo: mobile-onboarding", "codex",       3.0, 9, 2.10, [0, 1, 2, 2, 3, 4, 5], None),   # RTR under 0.8, but climbing
 ("demo: docs-site",         "claude-code", 3.0, 6, 2.00, [3, 3, 3, 3, 4, 4, 4], None),   # RTR 1.00, but slowing
 ("demo: FGA T04",           "claude-code", 4.0, 7, 1.85, [1, 2, 2, 3, 3, 4, 4], None),
 ("demo: auth-refresh",      "codex",       4.0, 6, 0.35, [0, 0, 0, 0, 0, 0, 1], None),   # started 20 minutes ago
]

def post(report):
    req = urllib.request.Request(base + "/api/report", json.dumps(report).encode(),
                                 {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    urllib.request.urlopen(req).read()

for name, source, alloc, total, used_now, rfr, ask in PROJECTS:
    for i, mins in enumerate(STEPS):
        used = round(used_now - mins / 60, 2)
        if used <= 0:
            continue  # this project had not started yet
        done = rfr[i]
        wip = 1 if done < total else 0
        held = 1 if (ask and mins <= 20) else 0   # a ticket parked in the lane that means "Terry, act"
        report = {"source": source, "project": name,
                  "hours": {"used": used, "allocated": alloc},
                  "lanes": {"Backlog": 2, "Ready For Work": total - done - wip - held, "In progress": wip,
                            "Blocked": 1 if name.endswith("FGA T04") else 0,
                            "Needs Terry": held, "Ready for review": done}}
        if mins:
            report["at"] = (now - timedelta(minutes=mins)).isoformat(timespec="seconds")
        post(report)
    print("posted", name)
print("Open", base, "- remove a sample later with: curl -X DELETE '" + base + "/api/projects/demo:%20FGA%20T04'")
