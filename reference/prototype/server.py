#!/usr/bin/env python3
"""swimcoach - a tiny self-hosted status board for agent-run dev work.

Zero dependencies (Python 3.9+ standard library only).
Agents POST a snapshot per project to /api/report; phones/tablets open /.
"""
import json
import math
import os
import re
import sqlite3
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PORT = int(os.environ.get("SWIMCOACH_PORT", "8787"))
DB_PATH = os.environ.get("SWIMCOACH_DB", "data/swimcoach.db")
TOKEN = os.environ.get("SWIMCOACH_TOKEN", "")
STALE_MIN = int(os.environ.get("SWIMCOACH_STALE_MINUTES", "25"))
STALL_MIN = int(os.environ.get("SWIMCOACH_STALL_MINUTES", "45"))
TREND_MIN = int(os.environ.get("SWIMCOACH_TREND_MINUTES", "60"))
MIN_HISTORY_MIN = int(os.environ.get("SWIMCOACH_MIN_HISTORY_MINUTES", str(round(TREND_MIN * 0.75))))
MIN_CLOCK = float(os.environ.get("SWIMCOACH_MIN_BLOCK_USED", "0.15"))
KEEP_DAYS = int(os.environ.get("SWIMCOACH_KEEP_DAYS", "14"))
STATIC = Path(__file__).parent / "static"
STATUSES = ("on_track", "at_risk", "behind", "blocked", "done")
LABEL = {"on_track": "On track", "at_risk": "At risk", "behind": "Behind",
         "blocked": "Blocked", "done": "Done"}
DONE_RE = re.compile(r"done|complete|shipped|merged|closed|ready for review", re.I)
# Swimlanes that mean "a human has to act". Used when a report does not list attention_lanes itself.
ATTN_RE = re.compile(r"needs? (me|you|terry|human|input|attention|action|decision|keyboard)|action required|"
                     r"waiting (on|for) (me|you|terry|human)|human (review|input|action)|at keyboard", re.I)
# Swimlanes that are watched but left out of the RTR math: nobody can advance them right now.
PARK_RE = re.compile(r"^(backlog|blocked)$", re.I)
write_lock = threading.Lock()


def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("CREATE TABLE IF NOT EXISTS projects("
                    "key TEXT PRIMARY KEY, snapshot TEXT NOT NULL, updated_at REAL NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS events("
                    "id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, project TEXT NOT NULL,"
                    "source TEXT, kind TEXT, text TEXT NOT NULL)")
        con.execute("CREATE INDEX IF NOT EXISTS events_ts ON events(ts)")
        con.execute("CREATE TABLE IF NOT EXISTS samples(key TEXT NOT NULL, ts REAL NOT NULL, work REAL NOT NULL, clock REAL NOT NULL, done INTEGER NOT NULL, total INTEGER NOT NULL)")
        con.execute("CREATE INDEX IF NOT EXISTS samples_key ON samples(key, ts)")


def parse_ts(v):
    """Epoch seconds from a number or ISO-8601 string. Naive times = server local time."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.endswith(("Z", "z")):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.astimezone()
    return dt.timestamp()


def normalize(b):
    if not isinstance(b, dict):
        raise ValueError("body must be a JSON object")
    project = str(b.get("project") or "").strip()
    if not project:
        raise ValueError("'project' is required")
    status = str(b.get("status") or "").strip().lower().replace("-", "_").replace(" ", "_")
    if status and status not in STATUSES:
        raise ValueError("'status' must be one of: " + ", ".join(STATUSES))
    nm = b.get("needs_me")
    if nm is True:
        nm = "Needs your input"
    nm = str(nm).strip()[:500] if nm else ""

    cards = []
    for c in b.get("cards") or []:
        if not isinstance(c, dict):
            continue
        title = str(c.get("title") or c.get("id") or "").strip()
        if not title:
            continue
        cards.append({
            "id": str(c.get("id") or title),
            "title": title[:200],
            "lane": str(c.get("lane") or "").strip(),
            "blocked": bool(c.get("blocked")),
            "needs_me": bool(c.get("needs_me")),
            "note": str(c.get("note") or "").strip()[:300],
        })

    lanes = []
    raw = b.get("lanes")
    if isinstance(raw, dict):
        lanes = [{"name": str(k), "count": max(0, int(v))} for k, v in raw.items()]
    elif isinstance(raw, list):
        for l in raw:
            if isinstance(l, dict) and l.get("name"):
                lanes.append({"name": str(l["name"]), "count": max(0, int(l.get("count") or 0))})
    elif cards:
        counts = {}
        for c in cards:
            counts[c["lane"] or "Unsorted"] = counts.get(c["lane"] or "Unsorted", 0) + 1
        lanes = [{"name": k, "count": v} for k, v in counts.items()]

    dl = b.get("done_lanes") or b.get("done_lane") or []
    done_lanes = [str(x).strip() for x in ([dl] if isinstance(dl, str) else dl) if str(x).strip()]
    if not done_lanes and lanes:
        done_lanes = [l["name"] for l in lanes if DONE_RE.search(l["name"])] or [lanes[-1]["name"]]

    pl = b.get("parked_lanes") or []
    parked_lanes = [str(x).strip() for x in ([pl] if isinstance(pl, str) else pl) if str(x).strip()]
    if not parked_lanes:
        parked_lanes = [l["name"] for l in lanes if PARK_RE.search(l["name"])]
    done_lanes = [n for n in done_lanes if n not in parked_lanes]
    al = b.get("attention_lanes") or []
    attention_lanes = [str(x).strip() for x in ([al] if isinstance(al, str) else al) if str(x).strip()]
    if not attention_lanes:
        attention_lanes = [l["name"] for l in lanes if ATTN_RE.search(l["name"])]
    waiting = [l for l in lanes if l["name"] in attention_lanes and l["count"] > 0]
    if waiting and not nm:  # a ticket sitting in an attention lane raises the flag by itself
        nm = "; ".join("%d ticket%s in %s" % (l["count"], "" if l["count"] == 1 else "s", l["name"]) for l in waiting)

    block = b.get("block") if isinstance(b.get("block"), dict) else {}
    start, end = parse_ts(block.get("start")), parse_ts(block.get("end"))
    if start and end and end <= start:
        raise ValueError("'block.end' must be after 'block.start'")
    hrs = b.get("hours") if isinstance(b.get("hours"), dict) else {}
    used = float(hrs["used"]) if hrs.get("used") is not None else None
    alloc = float(hrs["allocated"]) if hrs.get("allocated") is not None else None
    if alloc is not None and alloc <= 0:
        raise ValueError("'hours.allocated' must be greater than 0")

    if not status:  # not given: derive from work done vs time used
        total = sum(l["count"] for l in lanes if l["name"] not in parked_lanes)
        done = sum(l["count"] for l in lanes if l["name"] in done_lanes)
        clock = None
        if alloc:
            clock = (used or 0) / alloc
        elif start and end:
            clock = (time.time() - start) / (end - start)
        if total and done == total:
            status = "done"
        elif not total or clock is None or clock <= 0:
            status = "on_track"
        else:
            r = (done / total) / clock
            status = "on_track" if r >= 1 else "at_risk" if r >= 0.8 else "behind"

    extra = []
    for e in b.get("events") or []:
        text = str(e.get("text") if isinstance(e, dict) else e or "").strip()
        if text:
            kind = str(e.get("kind") or "note") if isinstance(e, dict) else "note"
            ts = parse_ts(e.get("ts")) if isinstance(e, dict) else None
            extra.append((ts, kind[:20], text[:400]))

    snap = {
        "project": project[:120],
        "source": str(b.get("source") or "agent").strip()[:40],
        "status": status,
        "tldr": str(b.get("tldr") or "").strip()[:1000],
        "needs_me": nm,
        "block_start": start,
        "block_end": end,
        "hours_used": used,
        "hours_alloc": alloc,
        "lanes": lanes,
        "done_lanes": done_lanes,
        "attention_lanes": attention_lanes,
        "parked_lanes": parked_lanes,
        "cards": cards,
    }
    return snap, extra


def done_lanes_of(s):
    return s.get("done_lanes") or [s.get("done_lane")]


def done_count(s):
    return sum(l["count"] for l in s["lanes"] if l["name"] in done_lanes_of(s))


def diff(old, new):
    """Timeline events derived from the change between two snapshots."""
    ev = []
    if old is None:
        ev.append(("start", "Started tracking (" + LABEL[new["status"]].lower() + ")"))
        if new["needs_me"]:
            ev.append(("needs_me", "Needs you: " + new["needs_me"]))
        return ev
    if old["status"] != new["status"]:
        ev.append((new["status"], "Status: %s → %s" % (LABEL[old["status"]], LABEL[new["status"]])))
    if new["needs_me"] and new["needs_me"] != old.get("needs_me"):
        ev.append(("needs_me", "Needs you: " + new["needs_me"]))
    elif old.get("needs_me") and not new["needs_me"]:
        ev.append(("cleared", "No longer waiting on you"))
    if new["cards"] and old.get("cards"):
        prev = {c["id"]: c for c in old["cards"]}
        for c in new["cards"]:
            p = prev.get(c["id"])
            if p is None:
                ev.append(("new", "New card “%s” in %s" % (c["title"], c["lane"] or "board")))
                continue
            if p["lane"] != c["lane"]:
                kind = "done" if c["lane"] in new["done_lanes"] else "move"
                ev.append((kind, "“%s” moved %s → %s" % (c["title"], p["lane"], c["lane"])))
            if c["blocked"] and not p["blocked"]:
                ev.append(("blocked", "Card blocked: “%s”%s" % (c["title"], " — " + c["note"] if c["note"] else "")))
            elif p["blocked"] and not c["blocked"]:
                ev.append(("cleared", "Card unblocked: “%s”" % c["title"]))
            if c["needs_me"] and not p["needs_me"]:
                ev.append(("needs_me", "Card needs you: “%s”%s" % (c["title"], " — " + c["note"] if c["note"] else "")))
    else:
        d0, d1 = done_count(old), done_count(new)
        total = sum(l["count"] for l in new["lanes"] if l["name"] not in new["parked_lanes"])
        if d1 > d0:
            n = d1 - d0
            ev.append(("done", "%d ticket%s reached %s (%d/%d)" % (n, "" if n == 1 else "s", " / ".join(new["done_lanes"]), d1, total)))
    return ev


def progress(s, now):
    """(work, clock, done, total): share of tickets done, share of the time block used, and the counts."""
    total = sum(l["count"] for l in s["lanes"] if l["name"] not in (s.get("parked_lanes") or []))
    if not total:
        return None
    if s.get("hours_alloc"):
        clock = (s.get("hours_used") or 0) / s["hours_alloc"]
    elif s.get("block_start") and s.get("block_end"):
        clock = (now - s["block_start"]) / (s["block_end"] - s["block_start"])
    else:
        return None
    done = done_count(s)
    return (done / total, clock, done, total) if clock > 0 else None


def chance_to_finish(k, span, n, left):
    """Chance that the n remaining tickets all land in the time left, given k landed in the recent span.

    Tickets are counted events, so the recent rate k/span is uncertain, and more so when k is small.
    Model: completions arrive at an unknown steady rate (Poisson) with a Jeffreys prior, which makes the
    count in the time left negative-binomial. `span` and `left` only need to be in the same unit.
    It is a rough guide: real work is burstier than this model.
    """
    if n <= 0:
        return 1.0
    if left <= 0 or span <= 0:
        return 0.0
    r, p = k + 0.5, span / (span + left)
    below = sum(math.exp(math.lgamma(r + j) - math.lgamma(j + 1) - math.lgamma(r) + r * math.log(p) + j * math.log(1 - p))
                for j in range(n))
    return max(0.0, min(1.0, 1 - below))


def trend_of(samples):
    """Recent movement of the ratio (RTR = work / clock) and where the recent pace lands.

    Compares the latest sample with the one closest to TREND_MIN minutes before it.
      delta  - change in RTR over that span
      pace   - RTR of that span alone (work gained / time spent)
      proj   - projected RTR when the block ends, if the recent pace holds. At the end of the
               block clock is 1, so this is simply the projected share of tickets done.
      finish - share of the block at which the last ticket lands (below 1 = early, above 1 = over)
    """
    if len(samples) < 2:
        return None
    t1, w1, c1, d1, n1 = samples[-1]
    # Too early to call: hold off until there is enough history, enough reports in it,
    # and enough of the block has been used for the ratio to have settled.
    older = [s for s in samples[:-1] if t1 - s[0] >= MIN_HISTORY_MIN * 60]
    if not older or c1 < MIN_CLOCK:
        return None
    t0, w0, c0, d0, _ = min(older, key=lambda s: abs((t1 - s[0]) - TREND_MIN * 60))
    if sum(1 for s in samples if s[0] >= t0) < 4:
        return None
    out = {"delta": w1 / c1 - w0 / c0, "minutes": round((t1 - t0) / 60), "pace": None, "proj": None, "finish": None,
           "recent_done": max(0, d1 - d0), "to_go": n1 - d1,
           "chance": chance_to_finish(max(0, d1 - d0), c1 - c0, n1 - d1, 1 - c1)}
    if c1 > c0:
        pace = max(0.0, (w1 - w0) / (c1 - c0))
        out["pace"] = pace
        if c1 < 1:
            out["proj"] = w1 + pace * (1 - c1)
        if w1 >= 1:
            out["finish"] = c1
        elif pace > 0:
            out["finish"] = c1 + (1 - w1) / pace
    return out


def lane_sig(s):
    return ([[l["name"], l["count"]] for l in s["lanes"]], sorted([c["id"], c["lane"]] for c in s.get("cards") or []))


def ingest(body):
    snap, extra = normalize(body)
    now = time.time()
    at = parse_ts(body.get("at"))  # optional: when this snapshot was taken, if not right now
    if at:
        now = min(at, now)
    key = snap["project"].lower()
    with write_lock, db() as con:
        row = con.execute("SELECT snapshot FROM projects WHERE key=?", (key,)).fetchone()
        old = json.loads(row["snapshot"]) if row else None
        moved = old is None or lane_sig(old) != lane_sig(snap)
        snap["last_move_at"] = now if moved else old.get("last_move_at", now)
        events = [(now, k, t) for k, t in diff(old, snap)] + [(ts or now, k, t) for ts, k, t in extra]
        con.execute("INSERT INTO projects(key,snapshot,updated_at) VALUES(?,?,?) "
                    "ON CONFLICT(key) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at",
                    (key, json.dumps(snap), now))
        con.executemany("INSERT INTO events(ts,project,source,kind,text) VALUES(?,?,?,?,?)",
                        [(ts, snap["project"], snap["source"], k, t) for ts, k, t in events])
        pr = progress(snap, now)
        if pr:
            con.execute("INSERT INTO samples(key,ts,work,clock,done,total) VALUES(?,?,?,?,?,?)", (key, now) + pr)
        con.execute("DELETE FROM events WHERE ts < ?", (now - KEEP_DAYS * 86400,))
        con.execute("DELETE FROM samples WHERE ts < ?", (now - KEEP_DAYS * 86400,))
    return {"ok": True, "project": snap["project"], "events_added": len(events)}


def state(since):
    now = time.time()
    with db() as con:
        projects = []
        rows = con.execute("SELECT key, snapshot, updated_at FROM projects WHERE updated_at >= ? ORDER BY key", (since,)).fetchall()
        for r in rows:
            p = json.loads(r["snapshot"])
            p["updated_at"] = r["updated_at"]
            p["stale"] = p["status"] != "done" and (now - r["updated_at"]) > STALE_MIN * 60
            samples = [tuple(x) for x in con.execute(
                "SELECT ts, work, clock, done, total FROM samples WHERE key=? AND ts>=? ORDER BY ts", (r["key"], since))]
            p["trend"] = trend_of(samples)
            step = max(1, len(samples) // 80)
            p["spark"] = [[round(t), round(w / c, 4)] for t, w, c, _, _ in (samples[:-1][::step] + samples[-1:])]
            projects.append(p)
        events = [dict(r) for r in con.execute(
            "SELECT id, ts, project, source, kind, text FROM events WHERE ts >= ? ORDER BY ts DESC, id DESC LIMIT 300",
            (since,))]
        last = con.execute("SELECT MAX(updated_at) FROM projects").fetchone()[0]
    return {"now": now, "stale_minutes": STALE_MIN, "stall_minutes": STALL_MIN, "trend_minutes": TREND_MIN, "min_history_minutes": MIN_HISTORY_MIN, "min_block_used": MIN_CLOCK,
            "last_report_at": last, "projects": projects, "events": events}


class Handler(BaseHTTPRequestHandler):
    server_version = "swimcoach/1.0"

    def log_message(self, fmt, *args):
        if self.command != "GET":
            super().log_message(fmt, *args)

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        if not TOKEN or self.headers.get("Authorization", "") == "Bearer " + TOKEN:
            return True
        self.send_json(401, {"ok": False, "error": "missing or wrong bearer token"})
        return False

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/state":
            try:
                since = float(parse_qs(u.query).get("since", ["0"])[0])
            except ValueError:
                since = 0.0
            return self.send_json(200, state(since))
        if u.path == "/healthz":
            return self.send_json(200, {"ok": True})
        if u.path in ("/", "/index.html"):
            data = (STATIC / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/report":
            return self.send_json(404, {"ok": False, "error": "not found"})
        if not self.authed():
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 1_000_000:
                raise ValueError("body must be 1 byte to 1 MB of JSON")
            body = json.loads(self.rfile.read(n))
            reports = body if isinstance(body, list) else [body]
            self.send_json(200, {"ok": True, "results": [ingest(r) for r in reports]})
        except (ValueError, TypeError, AttributeError) as e:
            self.send_json(400, {"ok": False, "error": str(e)})

    def do_DELETE(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/projects/"):
            return self.send_json(404, {"ok": False, "error": "not found"})
        if not self.authed():
            return
        key = unquote(u.path[len("/api/projects/"):]).strip().lower()
        with write_lock, db() as con:
            n = con.execute("DELETE FROM projects WHERE key=?", (key,)).rowcount
            con.execute("DELETE FROM events WHERE lower(project)=?", (key,))
            con.execute("DELETE FROM samples WHERE key=?", (key,))
        self.send_json(200 if n else 404, {"ok": bool(n)})


if __name__ == "__main__":
    init_db()
    print("swimcoach listening on http://0.0.0.0:%d  (db: %s, write token: %s)"
          % (PORT, DB_PATH, "on" if TOKEN else "off"), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
