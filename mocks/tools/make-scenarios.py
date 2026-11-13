#!/usr/bin/env python3
"""Build the mock's sample data with the prototype's own math.

For each scenario this starts reference/prototype/server.py on a throwaway database, posts a backdated
history of reports, reads back GET /api/state, and writes all of it into mocks/index.html between the
SCENARIOS markers. The mock then shifts every timestamp so the data always looks current.

    python mocks/tools/make-scenarios.py
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "reference" / "prototype" / "server.py"
MOCK = ROOT / "mocks" / "index.html"
PORT = 8799
STEP_MIN = 10  # one report every 10 minutes, like the monitoring agents


def P(name, source, alloc, total, hist, held_from=None, blocked=0, silent=0, needs=None, done=False, backlog=2):
    """One project. hist = tickets in Ready for review at each report, oldest first; the last is now.
    held_from = report index from which one ticket sits in Needs Terry. silent = minutes since the last report."""
    return dict(name=name, source=source, alloc=alloc, total=total, hist=hist, held_from=held_from,
                blocked=blocked, silent=silent, needs=needs, done=done, backlog=backlog)


AFTERNOON = [
    P("FGA T04", "claude-code", 4.0, 7, [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4], blocked=1),
    P("search-index", "codex", 2.0, 5, [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], held_from=8,
      needs="Pick an index strategy: per-tenant or shared"),
    P("docs-site", "claude-code", 3.0, 6, [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 4]),
    P("mobile-onboarding", "codex", 3.0, 9, [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3]),
    P("auth-refresh", "codex", 4.0, 6, [0, 1]),
    P("localswim v2", "claude-code", 2.0, 5, [0, 1, 1, 2, 3, 3, 4, 5], done=True),
]

SCENARIOS = {
    "afternoon": ("A typical afternoon", "One of every card: red, green, two yellows, gray and done.", AFTERNOON),
    "allgreen": ("All green", "The goal: everything on time, nothing to do. Back to the game.", [
        P("FGA T04", "claude-code", 4.0, 7, [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4]),
        P("docs-site", "claude-code", 3.0, 6, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]),
        P("localswim v2", "codex", 2.5, 6, [0, 1, 1, 2, 2, 3, 4, 4, 5]),
    ]),
    "keyboard": ("Go to keyboard", "Two projects are waiting on you: one with an agent's ask, one with just a ticket in Needs Terry.", [
        P("FGA T04", "claude-code", 4.0, 7, [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4]),
        P("search-index", "codex", 2.0, 5, [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], held_from=8,
          needs="Pick an index strategy: per-tenant or shared"),
        P("localswim v2", "codex", 2.5, 6, [0, 1, 1, 2, 2, 3, 3, 3, 4], held_from=7),
    ]),
    "silent": ("One agent silent", "mobile-onboarding's monitoring agent stopped reporting 32 minutes ago. The rest are live.", [
        P("FGA T04", "claude-code", 4.0, 7, [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4]),
        P("docs-site", "claude-code", 3.0, 6, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]),
        P("mobile-onboarding", "codex", 3.0, 9, [0, 0, 1, 1, 2, 2, 3, 3, 4], silent=32),
    ]),
    "morning": ("Early morning", "Blocks just started. Every card is too early to call, whatever RTR says.", [
        P("FGA T05", "claude-code", 4.0, 7, [0, 1, 1]),
        P("docs-site", "claude-code", 3.0, 6, [0, 0]),
        P("search-index", "codex", 2.0, 5, [0, 0, 1]),
    ]),
    "alldone": ("All done", "Every block is finished. The header says IDLE instead of LIVE.", [
        P("FGA T04", "claude-code", 4.0, 7, [0, 1, 2, 3, 4, 5, 6, 7], done=True),
        P("docs-site", "claude-code", 3.0, 6, [0, 1, 2, 3, 4, 5, 6], done=True),
    ]),
}


def post(report):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/report", json.dumps(report).encode(),
                                 {"Content-Type": "application/json"})
    urllib.request.urlopen(req).read()


def build(projects):
    db = tempfile.mktemp(suffix=".db")
    env = dict(os.environ, SWIMCOACH_PORT=str(PORT), SWIMCOACH_DB=db)
    srv = subprocess.Popen([sys.executable, str(SERVER)], cwd=SERVER.parent, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/healthz"); break
            except OSError:
                time.sleep(0.1)
        now = datetime.now().astimezone()
        for p in projects:
            n = len(p["hist"])
            for i, done in enumerate(p["hist"]):
                mins_ago = (n - 1 - i) * STEP_MIN + p["silent"]
                held = 1 if p["held_from"] is not None and i >= p["held_from"] else 0
                wip = 1 if done + held < p["total"] else 0
                report = {
                    "source": p["source"], "project": p["name"],
                    "hours": {"used": round((i + 1) * STEP_MIN / 60, 2), "allocated": p["alloc"]},
                    "lanes": {"Backlog": p["backlog"], "Ready For Work": p["total"] - done - wip - held,
                              "In progress": wip, "Blocked": p["blocked"], "Needs Terry": held,
                              "Ready for review": done},
                    "at": (now - timedelta(minutes=mins_ago)).isoformat(timespec="seconds"),
                }
                if held and p["needs"]:
                    report["needs_me"] = p["needs"]
                if p["done"] and i == n - 1:
                    report["status"] = "done"
                post(report)
        state = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/state?since=0").read())
        state.pop("events", None)  # the phone shows no activity log
        for pr in state["projects"]:
            pr.pop("cards", None)
        return state
    finally:
        srv.terminate(); srv.wait()
        for suffix in ("", "-wal", "-shm"):
            Path(db + suffix).unlink(missing_ok=True)


def main():
    out = {}
    for key, (title, blurb, projects) in SCENARIOS.items():
        out[key] = {"title": title, "blurb": blurb, "state": build(projects)}
        print("built", key, [(p["project"], round(p["trend"]["chance"], 2) if p.get("trend") else None)
                             for p in out[key]["state"]["projects"]])
    html = MOCK.read_text(encoding="utf-8")
    blob = json.dumps(out, separators=(",", ":"))
    new, n = re.subn(r"(/\*SCENARIOS:BEGIN\*/).*?(/\*SCENARIOS:END\*/)", lambda m: m.group(1) + blob + m.group(2),
                     html, flags=re.S)
    if n != 1:
        sys.exit("SCENARIOS markers not found in " + str(MOCK))
    MOCK.write_text(new, encoding="utf-8")
    print("wrote", MOCK)


if __name__ == "__main__":
    main()
