#!/usr/bin/env python3
# pyright: strict
"""Generate swimcoach's golden metric fixtures from the prototype's own math.

Each fixture in contract/fixtures/ is one (project, milestone): a cap, a timed series of reports, and
the metrics the prototype computes after the newest report. This script owns the inputs. Every
expected value comes from reference/prototype/server.py, loaded as a module and called directly:
normalize() reads each report, progress() makes the stored sample, trend_of() makes the trend,
projection and chance, and lane_sig() decides when a lane last moved. Only the page-side rules (the
five trend bins, the call cutoffs) are restated here, because the prototype keeps them in
reference/prototype/static/index.html, which Python cannot call. Each one cites its source line.

The card's display verdict (mode, color, reason) does not come from the prototype. It follows
contract/api.md sections 6.5 and 6.6, which carry Terry's decision D1 (docs/planning/mvp-stories.md):
a milestone with fewer than 3 stories is green while under budget, yellow once over it, and red only for
Needs Terry. D1 outranks the prototype. The metric keys ignore D1 on purpose (api.md 6.3).

    uv run --no-project python contract/tools/make-fixtures.py            # write every fixture
    uv run --no-project python contract/tools/make-fixtures.py --check    # exit 1 if a file differs
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, TypedDict, cast

if TYPE_CHECKING:
    from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "reference" / "prototype" / "server.py"
OUT = ROOT / "contract" / "fixtures"

STEP_MIN = 10  # one report every 10 minutes, as in mocks/tools/make-scenarios.py
EPS = 1e-6  # a value this close to a threshold makes a fixture fragile across implementations

# Thresholds the prototype keeps in its page, static/index.html lines 160 and 167, not in server.py.
BIN_SHARP = 0.2  # |delta| at or above this is a sharp arrow
BIN_PLAIN = 0.05  # |delta| at or above this is a plain arrow; below it is flat
CALL_ON_TIME = 0.7  # chance at or above this is "on time"
CALL_LATE = 0.3  # chance at or below this is "running late"

# Decision D1, contract/api.md 6.5 and 6.8: below this many stories the card is in count_and_time mode.
MIN_STORIES_FOR_RTR = 3

# The frozen lane keys (docs/planning/t1-interfaces.md) and the prototype lane name each maps to.
# The prototype's own regexes then classify them: DONE_RE makes "Ready for review" and "Completed"
# done lanes, ATTN_RE makes "Needs Terry" an attention lane, and none matches PARK_RE.
LANE_NAMES = {
    "ready_for_work": "Ready For Work",
    "in_progress": "In progress",
    "needs_terry": "Needs Terry",
    "ready_for_review": "Ready for review",
    "completed": "Completed",
}

# The prototype reads these at import time. Clearing them pins its documented defaults.
PROTOTYPE_ENV = (
    "SWIMCOACH_STALE_MINUTES",
    "SWIMCOACH_STALL_MINUTES",
    "SWIMCOACH_TREND_MINUTES",
    "SWIMCOACH_MIN_HISTORY_MINUTES",
    "SWIMCOACH_MIN_BLOCK_USED",
)

Lanes = dict[str, int]
Sample = tuple[float, float, float, int, int]  # (ts, work, clock, done, total), as stored by ingest()
Snapshot = dict[str, object]
type JsonValue = str | int | float | bool | dict[str, JsonValue] | None


class Trend(TypedDict):
    """The dict server.trend_of() returns."""

    delta: float
    minutes: int
    pace: float | None
    proj: float | None
    finish: float | None
    recent_done: int
    to_go: int
    chance: float


@dataclass(frozen=True)
class Report:
    """One fixture sample: a report and when it arrived."""

    at_hours: float
    active_hours: float
    lanes: Lanes


@dataclass(frozen=True)
class Spec:
    """One fixture's inputs.

    The series follows make-scenarios.py's P() exactly: `hist` is the finished count at each report,
    oldest first; from report `held_from` on, one card sits in Needs Terry; one card is in progress
    while any card is unfinished and not held; the rest are ready for work.
    """

    name: str
    description: str
    cap_hours: float
    total: int
    hist: tuple[int, ...]
    held_from: int | None = None


def load_prototype() -> ModuleType:
    """Import reference/prototype/server.py as a module, with its tunables at their defaults."""
    for key in PROTOTYPE_ENV:
        os.environ.pop(key, None)
    spec = importlib.util.spec_from_file_location("swimcoach_prototype_server", SERVER)
    if spec is None or spec.loader is None:
        sys.exit(f"Cannot load {SERVER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    defaults: dict[str, float] = {"TREND_MIN": 60, "MIN_HISTORY_MIN": 45, "MIN_CLOCK": 0.15, "STALL_MIN": 45}
    for attr, want in defaults.items():
        if getattr(module, attr) != want:
            sys.exit(f"Prototype {attr} is {getattr(module, attr)!r}, expected {want!r}")
    return module


PROTO = load_prototype()
STALL_SECONDS = float(PROTO.STALL_MIN) * 60


def proto_normalize(report: Report, cap_hours: float) -> Snapshot:
    """server.normalize() on the report the prototype would have received."""
    body: dict[str, object] = {
        "project": "fixture",
        "hours": {"used": report.active_hours, "allocated": cap_hours},
        "lanes": {LANE_NAMES[key]: count for key, count in report.lanes.items()},
    }
    snap, _events = cast("tuple[Snapshot, list[object]]", PROTO.normalize(body))
    return snap


def proto_progress(snap: Snapshot, now: float) -> tuple[float, float, int, int] | None:
    """server.progress(): (work, clock, done, total), or None when no sample is stored."""
    return cast("tuple[float, float, int, int] | None", PROTO.progress(snap, now))


def proto_trend(samples: list[Sample]) -> Trend | None:
    """server.trend_of(): trend, projection and chance, or None while it is too early to call."""
    return cast("Trend | None", PROTO.trend_of(samples))


def proto_lane_sig(snap: Snapshot) -> object:
    """server.lane_sig(): what ingest() compares to decide whether a lane moved."""
    return cast("object", PROTO.lane_sig(snap))


def trend_bin(delta: float) -> str:
    """Bin an RTR change into five arrows, as static/index.html line 160 does."""
    if delta >= BIN_SHARP:
        return "sharp_up"
    if delta >= BIN_PLAIN:
        return "up"
    if delta <= -BIN_SHARP:
        return "sharp_down"
    if delta <= -BIN_PLAIN:
        return "down"
    return "flat"


def the_call(chance: float) -> str:
    """Make the call from the chance on time, with static/index.html line 167's cutoffs."""
    if chance >= CALL_ON_TIME:
        return "on_time"
    if chance <= CALL_LATE:
        return "running_late"
    return "toss_up"


@dataclass(frozen=True)
class CardInputs:
    """What contract/api.md 6.5 and 6.6 read to decide the card's mode, color and reason."""

    done: bool
    needs_me: bool
    stale: bool
    total: int
    active_hours: float
    cap_hours: float
    call: str | None
    stalled: bool
    too_early: bool


def card_mode(total: int) -> str:
    """Pick the card's mode by decision D1, as contract/api.md 6.5 does."""
    return "ratio" if total >= MIN_STORIES_FOR_RTR else "count_and_time"


def card_verdict(card: CardInputs) -> tuple[str, str]:
    """Return (color, reason) by contract/api.md 6.6's table: the first matching row wins.

    The rows below are that table's ten rows, in order. In count_and_time mode (D1) only rows 1, 2, 3, 5
    and 10 apply: green while under budget, yellow once over it, red only for Needs Terry.
    """
    ratio = card_mode(card.total) == "ratio"
    rows: tuple[tuple[str, str, bool], ...] = (
        ("done", "done", card.done),
        ("red", "needs_terry", card.needs_me),
        ("yellow", "silent", card.stale),
        ("yellow", "running_late", ratio and card.call == "running_late"),
        ("yellow", "over_budget", not ratio and card.active_hours > card.cap_hours),
        ("yellow", "stalled", ratio and card.stalled),
        ("yellow", "toss_up", ratio and card.call == "toss_up"),
        ("gray", "too_early", ratio and card.too_early),
        ("green", "on_time", ratio),
        ("green", "under_budget", True),
    )
    return next((color, reason) for color, reason, hit in rows if hit)


def reports_of(spec: Spec) -> list[Report]:
    """Build the fixture's reports the way make-scenarios.py builds the mock's."""
    out: list[Report] = []
    for i, done in enumerate(spec.hist):
        held = 1 if spec.held_from is not None and i >= spec.held_from else 0
        wip = 1 if done + held < spec.total else 0
        lanes: Lanes = {
            "ready_for_work": spec.total - done - wip - held,
            "in_progress": wip,
            "needs_terry": held,
            "ready_for_review": done,
            "completed": 0,
        }
        out.append(
            Report(
                at_hours=round(i * STEP_MIN / 60, 4),
                active_hours=round((i + 1) * STEP_MIN / 60, 2),
                lanes=lanes,
            ),
        )
    return out


def check_robust(name: str, samples: list[Sample], trend: Trend | None) -> None:
    """Refuse a fixture whose verdict hangs on a value within EPS of a threshold."""
    problems: list[str] = []
    if samples:
        t1, _w1, c1, _d1, _n1 = samples[-1]
        if abs(c1 - float(PROTO.MIN_CLOCK)) < EPS:
            problems.append("clock sits on the block-used gate")
        history = float(PROTO.MIN_HISTORY_MIN) * 60
        window = float(PROTO.TREND_MIN) * 60
        gaps = sorted(abs((t1 - s[0]) - window) for s in samples[:-1] if t1 - s[0] >= history)
        if any(abs((t1 - s[0]) - history) < 1 for s in samples[:-1]):
            problems.append("a sample sits on the history gate")
        if len(gaps) > 1 and gaps[1] - gaps[0] < 1:
            problems.append("two samples tie for closest to the trend window")
    if trend is not None:
        if any(abs(abs(trend["delta"]) - b) < EPS for b in (BIN_SHARP, BIN_PLAIN)):
            problems.append("delta sits on a trend-bin edge")
        if any(abs(trend["chance"] - b) < EPS for b in (CALL_ON_TIME, CALL_LATE)):
            problems.append("chance sits on a call edge")
    if problems:
        sys.exit(f"{name}: fragile fixture: " + "; ".join(problems))


def expected_of(spec: Spec, reports: list[Report]) -> dict[str, JsonValue]:
    """Replay the reports through the prototype and read the metrics after the newest one."""
    samples: list[Sample] = []
    snap: Snapshot = {}
    prev_sig: object = None
    last_move = 0.0
    now = 0.0
    for i, report in enumerate(reports):
        now = report.at_hours * 3600
        snap = proto_normalize(report, spec.cap_hours)
        sig = proto_lane_sig(snap)
        if i == 0 or sig != prev_sig:  # ingest(): last_move_at moves only when a lane count changes
            last_move = now
        prev_sig = sig
        pr = proto_progress(snap, now)
        if pr is not None:  # ingest() stores a sample only when progress() returns one
            samples.append((now, *pr))
    trend = proto_trend(samples)
    check_robust(spec.name, samples, trend)

    latest = proto_progress(snap, now)
    rtr = latest[0] / latest[1] if latest is not None else None
    newest = reports[-1].lanes
    lanes_total = sum(newest.values())
    lanes_finished = newest["ready_for_review"] + newest["completed"]
    finished = lanes_total > 0 and lanes_finished == lanes_total  # "done" in contract/api.md 6.2
    if finished != (str(snap["status"]) == "done"):
        sys.exit(f"{spec.name}: api.md's done and the prototype's status disagree")
    stalled = not finished and now - last_move > STALL_SECONDS
    # The metrics do not depend on whether the card is finished; the color does.
    chance = trend["chance"] if trend is not None else None
    call = the_call(chance) if chance is not None else None
    finish = trend["finish"] if trend is not None else None
    trend_out: dict[str, JsonValue] | None = None
    if trend is not None:  # trend_of()'s dict, less chance, which is chance_on_time above
        trend_out = {
            "delta": trend["delta"],
            "minutes": trend["minutes"],
            "pace": trend["pace"],
            "proj": trend["proj"],
            "finish": trend["finish"],
            "recent_done": trend["recent_done"],
            "to_go": trend["to_go"],
        }
    mode = card_mode(lanes_total)
    color, reason = card_verdict(
        CardInputs(
            done=finished,
            needs_me=newest["needs_terry"] > 0,  # api.md 6.4; the fixtures send no needs_me text
            stale=False,  # "now" is the newest report's arrival, so the agent is never silent here
            total=lanes_total,
            active_hours=reports[-1].active_hours,
            cap_hours=spec.cap_hours,
            call=call,
            stalled=stalled,
            too_early=trend is None,
        ),
    )
    return {
        # The frozen keys.
        "rtr": rtr,
        "trend_bin": trend_bin(trend["delta"]) if trend is not None else None,
        "projection_hours": finish * spec.cap_hours if finish is not None else None,
        "chance_on_time": chance,
        "call": call,
        "too_early": trend is None,
        # Added keys: the rest of what the prototype computes for the newest report.
        "work": latest[0] if latest is not None else None,
        "clock": latest[1] if latest is not None else None,
        "finished": latest[2] if latest is not None else None,
        "total": latest[3] if latest is not None else None,
        "trend": trend_out,
        "stalled": stalled,
        # The card's display verdict: contract/api.md 6.5 and 6.6, decision D1 included.
        "mode": mode,
        "color": color,
        "reason": reason,
    }


def render(spec: Spec) -> str:
    """One fixture as JSON text: the frozen key order, one line per sample."""
    reports = reports_of(spec)
    expected = expected_of(spec, reports)
    sample_lines = [
        "    "
        + json.dumps(
            {"at_hours": r.at_hours, "active_hours": r.active_hours, "lanes": r.lanes},
            separators=(", ", ": "),
        )
        for r in reports
    ]
    expected_lines = [f"    {json.dumps(k)}: {json.dumps(v)}" for k, v in expected.items()]
    return "\n".join(
        [
            "{",
            f'  "name": {json.dumps(spec.name)},',
            f'  "description": {json.dumps(spec.description)},',
            f'  "cap_hours": {json.dumps(spec.cap_hours)},',
            '  "samples": [',
            ",\n".join(sample_lines),
            "  ],",
            '  "expected": {',
            ",\n".join(expected_lines),
            "  }",
            "}",
            "",
        ],
    )


# The mock's eight scenarios (mocks/index.html ORDER), one representative project each, with the
# exact inputs mocks/tools/make-scenarios.py gives that project. Then the four edge cases.
FGA_T04 = (4.0, 7, (0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4))
SPECS: tuple[Spec, ...] = (
    Spec(
        "afternoon",
        "Mock 'A typical afternoon', project mobile-onboarding: 9 stories, 3 done after 2h10m of a 3h cap.",
        3.0,
        9,
        (0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3),
    ),
    Spec(
        "allgreen",
        "Mock 'All green', project FGA T04: 7 stories, 4 done after 1h50m of a 4h cap.",
        *FGA_T04,
    ),
    Spec(
        "keyboard",
        "Mock 'Go to keyboard', project localswim v2: one card has sat in Needs Terry for the last two reports.",
        2.5,
        6,
        (0, 1, 1, 2, 2, 3, 3, 3, 4),
        held_from=7,
    ),
    Spec(
        "silent",
        "Mock 'One agent silent', project mobile-onboarding: its agent's last report, 32 minutes before now.",
        3.0,
        9,
        (0, 0, 1, 1, 2, 2, 3, 3, 4),
    ),
    Spec(
        "morning",
        "Mock 'Early morning', project FGA T05: one story done 30 minutes into a 4h cap.",
        4.0,
        7,
        (0, 1, 1),
    ),
    Spec(
        "stale",
        "Mock 'Feed went stale' (the afternoon, 35 minutes later), project docs-site: 4 of 6 done, no lane moved in the last 30 minutes.",
        3.0,
        6,
        (0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 4),
    ),
    Spec(
        "offline",
        "Mock 'Board unreachable' (the afternoon, last data held), project search-index: 1 of 5 done, one card waiting on Terry.",
        2.0,
        5,
        (0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1),
        held_from=8,
    ),
    Spec(
        "alldone",
        "Mock 'All done', project FGA T04: all 7 stories finished at 1h20m of a 4h cap.",
        4.0,
        7,
        (0, 1, 2, 3, 4, 5, 6, 7),
    ),
    Spec(
        "one-story",
        "A one-story milestone, still in progress after 2h10m of a 4h cap: RTR is 0 and the chance is a coin "
        "toss, but by decision D1 the card is green while under budget.",
        4.0,
        1,
        (0,) * 13,
    ),
    Spec(
        "zero-progress",
        "Six stories and none finished after 2h10m of a 4h cap.",
        4.0,
        6,
        (0,) * 13,
    ),
    Spec(
        "over-cap",
        "A 2h cap overrun: 4 of 5 stories done after 2h50m of active time.",
        2.0,
        5,
        (0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4),
    ),
    # MVP-09 MUST replay this fixture with the first report at 22:40:00 UTC, set through the
    # Swimcoach-Test-Now header (contract/api.md section 9), so the series crosses 00:00 UTC at
    # at_hours 1.3333. A Worker's clock is UTC and the contract has no local time, so naming the instant
    # is what keeps an implementation that wrongly cuts at UTC midnight from passing. MVP-09 SHOULD
    # replay it a second time with the first report at 22:40 in the phone's time zone.
    Spec(
        "midnight-rollover",
        "First report at 22:40 UTC, last at 00:20 UTC: the series crosses 00:00 UTC at at_hours 1.3333 "
        "and the trend MUST use the samples from before it.",
        4.0,
        7,
        (0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4),
    ),
)


def main(argv: list[str]) -> int:
    """Write every fixture, or with --check report which files differ and exit 1."""
    check = "--check" in argv[1:]
    stale: list[str] = []
    OUT.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        path = OUT / f"{spec.name}.json"
        text = render(spec)
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == text:
            continue
        if check:
            stale.append(path.name)
            continue
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print(f"Wrote {path.relative_to(ROOT)}")
    if stale:
        print("Out of date: " + ", ".join(stale))
        return 1
    print(f"{len(SPECS)} fixtures {'checked' if check else 'current'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
