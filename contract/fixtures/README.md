# Golden metric fixtures

RFC 2119 keywords; the capitals are load-bearing.

Each file here is one (project, milestone) as a series of timed reports, plus the metrics the
prototype computes after the newest report. The MVP's metrics module (MVP-04), the API acceptance
suite (MVP-09) and V2 MUST all reproduce every `expected` value. The values were not typed by hand:
`contract/tools/make-fixtures.py` replays each series through the prototype's own code in
`reference/prototype/server.py` and writes what it returns.

## Format

The format is frozen in `docs/planning/t1-interfaces.md`:

| Field | Meaning |
| --- | --- |
| `name` | The file name without `.json` |
| `description` | One sentence: which mock scenario and project, or which edge case |
| `cap_hours` | The milestone's `cap_hours` |
| `samples[]` | One report each, oldest first |
| `samples[].at_hours` | Wall-clock hours since the milestone's first report, so the first is `0.0`. Rounded to 4 places |
| `samples[].active_hours` | The report's `active_hours`. Rounded to 0.01 h, exactly as the mock posted it |
| `samples[].lanes` | The report's `lanes`: all five frozen keys |
| `expected` | The metrics after the newest sample, below |

A replay MUST send each sample as one report, received at `at_hours` after the first. A test MUST
compare numbers with an absolute tolerance of `1e-9`, and MUST compare `null`, strings and booleans
exactly. `null` means the prototype produced no value.

### How the lanes reach the prototype

The prototype takes free-form lane names and classifies them with regexes. The generator sends the
frozen keys under these names, and the prototype's own regexes do the rest:

| Frozen key | Prototype name | Prototype treats it as |
| --- | --- | --- |
| `ready_for_work` | `Ready For Work` | Unfinished |
| `in_progress` | `In progress` | Unfinished |
| `needs_terry` | `Needs Terry` | Unfinished, and an attention lane (`ATTN_RE`): the card goes red |
| `ready_for_review` | `Ready for review` | Finished (`DONE_RE`) |
| `completed` | `Completed` | Finished (`DONE_RE`) |

So finished = `ready_for_review` + `completed`, and total = all five. No frozen lane matches the
prototype's parked lanes (`PARK_RE`: Backlog, Blocked), so nothing is left out of the total. The mock's
Backlog and Blocked counts are dropped; the prototype left them out of every metric anyway.

## Expected keys

The generator runs each report through `normalize()` (with `hours.used` = `active_hours` and
`hours.allocated` = `cap_hours`), stores a sample whenever `progress()` returns one, exactly as
`ingest()` does, and then calls `trend_of()` on the whole series. The prototype keeps the trend bins,
the call and the card color in its page, `reference/prototype/static/index.html`, which Python cannot
call. The generator restates those three rules and cites the page's lines.

### The frozen keys

| Key | Value | Prototype source |
| --- | --- | --- |
| `rtr` | `work / clock` for the newest report; `null` when total or clock is 0 | `progress()` |
| `trend_bin` | `sharp_up`, `up`, `flat`, `down`, `sharp_down`; `null` while too early | `trend_of()` `delta`, binned at +-0.20 and +-0.05 as page line 160 does |
| `projection_hours` | Active hours at which the last story lands: `finish * cap_hours`; `null` when the recent pace is 0 ("No progress") | `trend_of()` `finish` |
| `chance_on_time` | Chance every story lands within the cap, 0 to 1 | `trend_of()` `chance`, from `chance_to_finish()` |
| `call` | `on_time` (chance >= 0.7), `toss_up`, or `running_late` (chance <= 0.3); `null` while too early | Cutoffs from page line 167 |
| `too_early` | `true` exactly when `trend_of()` returned nothing | `trend_of()` |

### Keys this generator added

The interfaces document allows extra `expected` keys that the prototype computes. These are all of
them. Their names match MVP-01 A's draft `contract/schemas/state.schema.json` (`metrics` and the
milestone's `finished`, `total`, `stalled` and `color`):

| Key | Value | Prototype source |
| --- | --- | --- |
| `work`, `clock` | The newest stored sample's share of stories finished and share of the cap used | `progress()` |
| `finished`, `total` | The newest stored sample's counts | `progress()` |
| `trend` | `trend_of()`'s own dict without `chance` (that is `chance_on_time`): `delta`, `minutes`, `pace`, `proj`, `finish`, `recent_done`, `to_go`; `null` while too early | `trend_of()` |
| `stalled` | No lane count changed in 45 minutes, measured at the newest report | `lane_sig()`, as `ingest()` uses it |
| `color` | Card color: `done`, `red`, `yellow`, `gray` or `green` | Page lines 165 and 169-171 |

Two of these need a clock, and the format carries none. `stalled` and `color` are measured with
"now" equal to the newest report's arrival, so `color` never reflects a silent agent.

The metric keys do not change when a milestone finishes; only `color` does. `trend_of()` keeps
returning a trend after the last story lands, so `alldone` carries `sharp_up`, a chance of 1.0 and
`on_time`, with `color` `done`. The prototype's page hides all of that once a milestone is done.

## The scenarios

The mock's eight scenarios (`mocks/index.html`, `ORDER`) each hold several projects, and a fixture
holds one. Each mock fixture is the one project in that scenario that carries the scenario's point,
with the exact inputs `mocks/tools/make-scenarios.py` gives it. Before writing these, every one of the
mock's 20 project series was replayed and matched the trend embedded in `mocks/index.html` (delta,
pace, projection, finish, chance) within `1e-9`.

| File | Source | RTR | Trend | Chance | Call | Color |
| --- | --- | --- | --- | --- | --- | --- |
| `afternoon` | Mock: mobile-onboarding | 0.46 | down | 2.0% | running_late | yellow |
| `allgreen` | Mock: FGA T04 | 1.25 | sharp_up | 87.5% | on_time | green |
| `keyboard` | Mock: localswim v2, a card in Needs Terry | 1.11 | sharp_up | 75.7% | on_time | red |
| `silent` | Mock: mobile-onboarding | 0.89 | sharp_up | 51.1% | toss_up | yellow |
| `morning` | Mock: FGA T05, too early | 1.14 | null | null | null | gray |
| `stale` | Mock: docs-site, from the afternoon | 1.00 | sharp_down | 38.1% | toss_up | yellow |
| `offline` | Mock: search-index, from the afternoon | 0.22 | sharp_down | 0.01% | running_late | red |
| `alldone` | Mock: FGA T04, finished | 3.01 | sharp_up | 100% | on_time | done |
| `one-story` | Edge: 1 story, unfinished at 2h10m of 4h | 0.00 | flat | 40.6% | toss_up | yellow |
| `zero-progress` | Edge: 6 stories, none finished at 2h10m of 4h | 0.00 | flat | 2.5% | running_late | yellow |
| `over-cap` | Edge: 2h cap, 2h50m used, 4 of 5 done | 0.57 | down | 0.0% | running_late | yellow |
| `midnight-rollover` | Edge: 22:40 to 00:20 local | 1.25 | down | 73.4% | on_time | green |

The `silent`, `stale` and `offline` scenarios differ from the others by time passing after the last
report, or by the page losing the board. The frozen format has no "now", so those fixtures carry only
the metrics, which the page shows unchanged. A later format MAY add a top-level `now_hours` to cover
staleness; that is the Lead's call, because the format is frozen.

`midnight-rollover` crosses midnight at `at_hours` 1.3333, and its comparison sample (60 minutes back)
is from before midnight. To exercise the rollover, MVP-09 MUST start the replay at 22:40 local time.

## Regenerate

```
uv run --no-project python contract/tools/make-fixtures.py
uv run --no-project python contract/tools/make-fixtures.py --check
```

The first writes every fixture. The second writes nothing and exits 1, naming each file that differs
from what the prototype computes now. The inputs live in `SPECS` in the generator; a new fixture is a
new `Spec`.

The generator pins the prototype's tunables to their defaults (trend window 60 minutes, history 45
minutes, block used 15%, stall 45 minutes) and exits if they differ. It also refuses any fixture whose
verdict sits within `1e-6` of a threshold (a trend-bin edge, a call edge, the block-used gate), or
whose samples sit within one second of the history gate or tie for the comparison sample. A value on
an edge would flip between two correct implementations on floating-point noise alone.

## Open for Terry

Where the prototype and `docs/concept.md` disagree, the fixture keeps the prototype's value.

1. **D1, the small-block rule (concept.md section 8, item 10).** D1 says a milestone with fewer than 3
   stories shows no RTR and no clock hand, shows "0 of 1 done" and hours used, and is green while under
   the cap. The prototype has no such rule: `one-story` gets RTR 0.00, a flat arrow, a 40.6% chance,
   `toss_up`, and a yellow card at 2h10m of a 4h cap. The fixture keeps the prototype's numbers. A's
   draft schema keeps the metrics and moves D1 into `mode`, `color` and `reason`, so the MVP's metrics
   SHOULD match this fixture while its card shows green under budget, not this fixture's `color`.
2. **Midnight rollover (concept.md section 11).** The prototype's page fetches samples since local
   midnight, so it would show `midnight-rollover` as too early to call (3 samples, 20 minutes of
   history). The concept lists that as a defect. `trend_of()` itself has no day boundary, so the
   fixture expects the full-series value: `on_time`. If Terry wants the day boundary kept, this fixture
   flips to `too_early`.
3. **Needs Terry counts against RTR (concept.md section 8, item 1, still unanswered).** The prototype
   counts a Needs Terry card as unfinished. `keyboard` and `offline` depend on it. If Terry rules that
   those cards leave the total, both change.
4. **"At least 4 samples lie in that span" (concept.md section 4.6).** The prototype counts the samples
   from the comparison sample (the one closest to 60 minutes back) through the newest, both included,
   not the samples in the 45-minute history span. The concept's wording allows either reading.
5. **No time span gives no chance (concept.md section 4.4).** The concept says only that no time left
   gives 0. `chance_to_finish()` also returns 0 when the clock did not move over the look-back. No
   fixture hits this.
6. **Almost every arrow is sharp (concept.md section 4.2, a known weakness).** Six of the eleven
   fixtures with a trend are `sharp_up` or `sharp_down`. The bins are untuned, as the concept says.

## Notes for the Lead

- **`call` is one of the concept's calls, not a color.** The frozen example shows `"call": "green"`
  beside a 50% chance, which section 4.5 makes a toss-up. The fixtures use `on_time`, `toss_up` and
  `running_late` (the prototype's `on`, `toss`, `late`), `null` while too early, and put the color in
  the added `color` key. This matches A's draft schema.
- **Two definitions follow A's draft schema rather than the prototype's page.** The page sets "too
  early" only when RTR exists, and nulls the call once a milestone is done. A defines `too_early` as
  exactly "no trend", and computes the metrics whatever the card shows. The fixtures follow A. Only
  `alldone` sees a difference (`call` is `on_time`, where the page shows none); no fixture has a total
  of 0, where the two `too_early` rules part.
- **`projection_hours` is the landing point in active hours**, `finish * cap_hours`, as in A's draft.
  The margin the phone shows is `cap_hours - projection_hours`.

## What survives into V2

All of this directory survives: the fixtures are the metric contract. V2 MUST pass every fixture
unchanged. The generator survives as the record of where the numbers came from; V2 needs it only to
add a fixture while the prototype is still the reference.
