# UX ledger

The UX ledger lists every screen state and every transition of the swimcoach page, one row each. MVP-11
fills the Check column with a browser check or a manual observation. RFC 2119 keywords; the capitals are
load-bearing.

## How to read this file

- Each row has an ID (`UX-001`, ...). A check in MVP-11 MUST cite the ID it proves. An ID MUST NOT be
  renumbered or reused once a check cites it; a retired row stays, marked `RETIRED`.
- **Rule** names what the row proves and cites a section of [`docs/concept.md`](../docs/concept.md)
  (`c3.2` means concept.md section 3.2) or [`docs/brand.md`](../docs/brand.md) (`b5` means brand.md section 5).
- **Render** is the file in [`design/ui-mock/`](../design/ui-mock/) that shows the state. A dash means no
  render exists; the Notes column then says how to reach the state.
- **Check** is empty here. MVP-11 writes `browser: <test name>` or `manual: <what was observed, date>`.
- Viewer: Chrome on an iPhone 16 Pro, 402 x 874 CSS px (1206 x 2622 px at 3x). A check MUST run at that size.
- Screen-part names follow concept.md section 2 exactly: Status line, Health box, Card display area, Card,
  Title line, Detail blurb. Other terms: Swimlanes, GO TO KEYBOARD (the slot), slot, display.
- Every row describes behavior the MVP MUST show and V2 MUST reproduce. Rows marked **(measured)** carry
  a pixel or time figure from the mock; a check SHOULD allow about 1 px of tolerance on pixel figures and
  MUST NOT relax a time figure.

## Area index

| Area | IDs | Rows |
| --- | --- | --- |
| A. Status line | UX-001 to UX-020 | 20 |
| B. Overview slot modes | UX-021 to UX-030 | 10 |
| C. Card colors, order and contents | UX-031 to UX-046 | 16 |
| D. GO TO KEYBOARD slot | UX-047 to UX-056 | 10 |
| E. Card layout and clock-hand trend arrow | UX-057 to UX-070 | 14 |
| F. Breathing sync | UX-071 to UX-076 | 6 |
| G. Project display parts | UX-077 to UX-092 | 16 |
| H. Swimlanes | UX-093 to UX-102 | 10 |
| I. No-flicker load and polling | UX-103 to UX-112 | 10 |
| J. Navigation | UX-113 to UX-124 | 12 |
| K. Alerts | UX-125 to UX-130 | 6 |
| **Total** | | **130** |

## A. Status line

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-001 | Status line on the overview: mark and wordmark alone on the left; clock, Health box and bell locked together on the right, 8 px apart | c3.1 layout | `afternoon-00-all-projects.png` | |
| UX-002 | Status line on a project display looks and sits the same as on the overview | c3.1 "on every display" | `afternoon-03-fga-t04-bottom.png` | |
| UX-003 | Clock is left of the Health box, never right of it; the page MUST NOT show "LIVE 2:25 PM" order | c3.1 why the clock stays left | `afternoon-00-all-projects.png` | |
| UX-004 | Wordmark: "swim" in lane blue `#85B8FF`, "coach" in lane amber `#E2A100` | b3, c13 | `afternoon-00-all-projects.png` | |
| UX-005 | Mark beside the wordmark at 26 px | c13, `design/logo/README.md` | `afternoon-00-all-projects.png` | |
| UX-006 | Clock format `H:mm`, lowercase am/pm, no space, 12-hour: 1:32am | c3.1 clock format | `afternoon-00-all-projects.png` | Also check 12:47pm and 12:05am |
| UX-007 | Midnight and noon: 12:00am and 12:00pm, never 0:00 | c3.1 clock format | - | Manual or injected clock |
| UX-008 | Every other time on the page (chart ends, footer) uses the same formatter as the clock | c3.1 `fmtTime()` | `afternoon-03-fga-t04-bottom.png` | Footer and chart labels read `H:mm` am/pm |
| UX-009 | Health box LIVE: bold white "LIVE" on `--ok-fill` `#1B6445`, breathing dot, no age while newest report is under 1 min | c3.1 table | `afternoon-00-all-projects.png` | Fresh state needs a report under 1 min old |
| UX-010 | Health box LIVE with age: "LIVE 7m" once the newest report is 1 min or older | c3.1 table | - | Reach with a report 7 min old |
| UX-011 | LIVE requires both: last poll succeeded within 30 s AND newest report under 25 min old | c3.1 table | `afternoon-00-all-projects.png` | |
| UX-012 | Health box STALE: dark orange box, warning text, every display grayed to 40%; word only, no age | c3.1 table | `stale-00-all-projects.png` | Trigger: no report for over 25 min with an unfinished project |
| UX-013 | Warning line under the Status line gives the exact STALE duration | c3.1 "warning line" | `stale-00-all-projects.png` | |
| UX-014 | Health box OFFLINE: dark red box, warning text, every display grayed; word only, no age | c3.1 table | `offline-00-all-projects.png` | Trigger: three polls in a row fail (30 s) |
| UX-015 | OFFLINE with a long outage ("1h 05m") still fits: at least 35 px between wordmark and clock at 402 px **(measured)** | c3.1 | `offline-00-all-projects.png` | |
| UX-016 | Health box IDLE: neutral box when every project reported today is done | c3.1 table | `alldone-00-all-projects.png` | |
| UX-017 | Health box NO DATA: neutral box when no reports exist today | c3.1 table | - | No render; reach with an empty database |
| UX-018 | STALE does not fire when every project is done (IDLE wins over STALE) | c3.1 STALE "while some project is unfinished" | `alldone-00-all-projects.png` | |
| UX-019 | Recovery: first successful poll after OFFLINE returns the box to LIVE and removes the gray | c3.1 | - | Transition; no render |
| UX-020 | Silent agent alone (one project over 25 min silent, another fresh) keeps the box LIVE and makes that Card yellow | c3.1, c3.2 yellow rules | `silent-00-all-projects.png` | |

## B. Overview slot modes

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-021 | One slot (one project, or only GO TO KEYBOARD): four-slot mode, full-height slot | c3.2 4/8 grid | - | No render of exactly one; reach with one project |
| UX-022 | Two slots: four-slot mode, two full-height slots, empty space below | c3.2 4/8 grid | `keyboard-00-all-projects.png` | |
| UX-023 | Three slots: four-slot mode, three full-height slots | c3.2 4/8 grid | `allgreen-00-all-projects.png` | |
| UX-024 | Four slots: four-slot mode fills the Card display area exactly | c3.2 4/8 grid | - | Reach with four projects |
| UX-025 | Five or more slots: eight-slot mode, half-height slots; a fifth slot flips every Card to half height | c3.2 4/8 grid | `afternoon-00-all-projects.png` | Seven slots shown; check the 4 to 5 flip |
| UX-026 | Full slots measure 183.3 px and half slots 86.6 px at 402 x 874 **(measured)** | c3.2 more room below status line | `keyboard-00-all-projects.png`, `afternoon-00-all-projects.png` | |
| UX-027 | Every slot on a screen is the same height | c3.2 | `afternoon-00-all-projects.png` | |
| UX-028 | More than eight slots scroll; slots never shrink below the content minimum (101.7 px full, 83.5 px half) | c3.2 | - | Reach with nine projects; no render |
| UX-029 | Card display area starts 24 px below the Health box; the Health box sits 13 px below the top **(measured)** | c3.2 more room | `afternoon-00-all-projects.png` | The two breathing widgets MUST NOT be pulled back together |
| UX-030 | Detail blurb: two lines in a full slot, one line ending in "..." in a half slot; all Cards on a screen show the same line count | c3.2 | `keyboard-00-all-projects.png`, `afternoon-00-all-projects.png` | |

## C. Card colors, order and contents

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-031 | Cards sit in fixed alphabetical order by project name | c3.2 one card per non-red project | `afternoon-00-all-projects.png` | |
| UX-032 | A Card never changes position when its color changes | c3.2 | - | Transition: change a project's state, compare order |
| UX-033 | Done Card: dark slate, shows Name only (plus "Done") when status is `done` or every counted ticket is finished | c3.2 states row 1 | `afternoon-00-all-projects.png` (localswim v2) | |
| UX-034 | Done state ranks above red: a done project with a stale `needs_me` shows done | c3.2 "first match wins" | - | Contrived; no render |
| UX-035 | Red project: needs-you item (a ticket in Needs Terry, or `needs_me` text) | c3.2 states row 2 | `keyboard-00-all-projects.png` | Red projects leave the list; see area D |
| UX-036 | Yellow: agent silent over 25 min | c3.2 states row 3 | `silent-00-all-projects.png` | Detail blurb names the reason |
| UX-037 | Yellow: status `blocked` | c3.2 states row 3 | - | No render |
| UX-038 | Yellow: the call is "Running late" | c3.2 states row 3 | `afternoon-00-all-projects.png` (mobile-onboarding) | |
| UX-039 | Yellow: no ticket moved in 45 min | c3.2 states row 3 | - | No render |
| UX-040 | Yellow: the call is "Toss-up" | c3.2 states row 3 | `afternoon-00-all-projects.png` (docs-site) | |
| UX-041 | Gray: too early to call; Detail blurb "Too early to call", RTR shown, no arrow | c3.2 states row 4 | `morning-00-all-projects.png` | |
| UX-042 | Green: the call is "On time"; shows Name, RTR, arrow, no Detail blurb | c3.2 states row 5 | `allgreen-00-all-projects.png` | |
| UX-043 | Green fill is `--ok-fill` `#1B6445` with pure white text at full opacity; contrast 7:1 or better **(measured 7.11:1)** | AGENTS.md, b5 | `allgreen-00-all-projects.png` | A second green MUST NOT appear |
| UX-044 | Backlog and Blocked never appear on any Card or display; no "1 blocked" note | c3.2 | `afternoon-00-all-projects.png` | |
| UX-045 | Precedence: the first matching rule wins (done, red, yellow, gray, green) | c3.2 | - | Table-driven check over the fixture set |
| UX-046 | Cards that mix all five looks side by side read at a glance | c3.2 | `afternoon-00-all-projects.png` | One of every card |

## D. GO TO KEYBOARD slot

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-047 | One red project: first slot is a red, breathing Card with Title line GO TO KEYBOARD and the project name as Detail blurb | c3.2 GO TO KEYBOARD | `afternoon-00-all-projects.png` | |
| UX-048 | Two or more red projects: Detail blurb lists their names joined by a middle dot | c3.2 | `keyboard-00-all-projects.png` | |
| UX-049 | Names that do not all fit end in "..." | c3.2 | - | No render; reach with many red projects |
| UX-050 | No red project: no slot is reserved; row one is the first green or yellow Card | c3.2 "no space is reserved" | `allgreen-00-all-projects.png` | |
| UX-051 | Red projects leave the ordinary list; they do not also appear as their own Cards | c3.2 | `keyboard-00-all-projects.png` | |
| UX-052 | Remaining Cards keep alphabetical order below it, even if a project between two others went red | c3.2 | `afternoon-00-all-projects.png` | |
| UX-053 | GO TO KEYBOARD takes one of the 4 or 8 slots and counts toward the five-slot threshold | c3.2 4/8 grid | `afternoon-00-all-projects.png` | |
| UX-054 | Tapping GO TO KEYBOARD opens the first red project's display | c3.2 "Tap goes to the first one" | - | Transition |
| UX-055 | A red project's own display shows its full ask | c3.2 | `keyboard-01-fga-t04-top.png` | |
| UX-056 | GO TO KEYBOARD never grows with the number of asks (one Detail blurb line of names) | c3.2 OBE note | `keyboard-00-all-projects.png` | |

## E. Card layout and clock-hand trend arrow

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-057 | Trend arrow is a clock hand around the RTR's final digit: strong up at 12 | c3.2 clock hand | - | Reach with a strong-up trend |
| UX-058 | Up trend at 1:30 | c3.2 clock hand | `afternoon-00-all-projects.png` (FGA T04) | |
| UX-059 | Flat trend at 3 | c3.2 clock hand | - | Reach with a flat trend |
| UX-060 | Down trend at 4:30 | c3.2 clock hand | `afternoon-00-all-projects.png` (mobile-onboarding) | |
| UX-061 | Hard-down trend at 6 | c3.2 clock hand | `afternoon-00-all-projects.png` (docs-site) | Check which bin each shows against the fixtures |
| UX-062 | Up arrows sit above the number and down arrows below it; the arrow MUST NOT sit beside the number | c3.2 why position carries trend | `afternoon-00-all-projects.png` | |
| UX-063 | Gray (too early) Card shows the RTR and no arrow | c3.2 states row 4 | `morning-00-all-projects.png` | |
| UX-064 | RTR block takes the same place and reserved room on every Card, so numbers line up | c3.2 | `afternoon-00-all-projects.png` | |
| UX-065 | RTR weight 900; size scales with Card height, 52 px full and 21.4 px half **(measured)**, between 18 and 52 px | c3.2 second tier | `keyboard-00-all-projects.png`, `afternoon-00-all-projects.png` | |
| UX-066 | The hand stays at least 16 px from the Card edge; 13 px minimum with six Cards on screen | c3.2 | `afternoon-00-all-projects.png` | |
| UX-067 | Side margins match: 18 px before the name, 18 px from the inked tip of a 3 o'clock hand to the right edge **(measured at ink level)** | c3.2 | `afternoon-00-all-projects.png` | |
| UX-068 | Title line on one line at 24 px (full) or 20 px (half); a long name shrinks to 14 px, then ends in "..." | c3.2 name stays on one line | `afternoon-00-all-projects.png` | Use "mobile-onboarding-redesign" |
| UX-069 | Detail blurb is 14 px, weight 500, indented 12 px under the Title line; no separator line between them | c3.2 | `afternoon-00-all-projects.png` | |
| UX-070 | Inside a Card: 18 px above the Title line and 18 px below the last Detail blurb line at the content minimum **(measured)** | c3.2 | `afternoon-00-all-projects.png` | |

## F. Breathing sync

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-071 | The LIVE dot and GO TO KEYBOARD breathe in step: same 2 s `ease-in-out` cycle, same peak, 8 cycles | c3.2 breathing sync | `keyboard-00-all-projects.png` | Compare both animations' current time; MUST agree to the millisecond |
| UX-072 | Each successful poll restarts both animations together | c3.1, c3.2 | - | Transition |
| UX-073 | The animation runs a fixed 16 s (8 cycles) and then stops, so a frozen page stops by itself | c3.1 | - | Freeze the page script and watch |
| UX-074 | GO TO KEYBOARD breathes only while the Health box says LIVE | c3.2 | `stale-00-all-projects.png`, `offline-00-all-projects.png` | Both animations stopped in STALE and OFFLINE |
| UX-075 | Under `prefers-reduced-motion: reduce`, no breathing and no fade | b6, c3.4 | - | Emulate the media query |
| UX-076 | Between polls the two animations stay in phase after load, after a poll and after a pause | c3.2 | - | |

## G. Project display parts

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-077 | Top of a project display: "All projects" back link, then the project name | c3.3 part 1 | `afternoon-03-fga-t04-top.png` | |
| UX-078 | Large RTR in the state color with a clock-hand arrow, weight 900 | c3.2 decided, c3.3 part 2 | `afternoon-03-fga-t04-top.png` | |
| UX-079 | Trend bin in words and the call in words beside the large RTR | c3.3 part 2 | `afternoon-03-fga-t04-top.png` | |
| UX-080 | Large RTR padding reserves the hand's reach; the hand never touches the name or the label; the label is centered on the number | c3.2 decided | `afternoon-03-fga-t04-top.png` | |
| UX-081 | Needs-you text shows when the project is red | c3.3 part 3 | `keyboard-01-fga-t04-top.png` | |
| UX-082 | Stale-agent warning shows when the agent is silent | c3.3 part 3 | `silent-01-docs-site-top.png` | |
| UX-083 | Agent `tldr` shows when sent | c3.3 part 3 | - | Check with and without `tldr` |
| UX-084 | RTR today: line chart across the day, dashed line at 1.00, start and end times | c3.3 part 4 | `afternoon-03-fga-t04-bottom.png` | |
| UX-085 | Projection tiles: chance on time, with "3 landed in last 60m, 3 to go" | c3.3 part 5 | `afternoon-03-fga-t04-bottom.png` | |
| UX-086 | Projection tile: lands, "1h 10m early" or late | c3.3 part 5 | `afternoon-03-fga-t04-bottom.png` | |
| UX-087 | Projection tiles: RTR at end of block, and RTR trend as a signed change | c3.3 part 5 | `afternoon-03-fga-t04-bottom.png` | |
| UX-088 | Too early to call: one tile says so and states the gates | c3.3 part 5, c4.6 | `morning-01-docs-site-top.png` | |
| UX-089 | Work against time: two bars, tickets done of total and hours used of allocated | c3.3 part 6 | `afternoon-03-fga-t04-bottom.png` | |
| UX-090 | Work bar takes the display's color on green and yellow only | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-091 | Footer: last ticket move, last report time, reporting agent | c3.3 part 8 | `afternoon-03-fga-t04-bottom.png` | |
| UX-092 | A done project's display shows done styling (lightest neutral, no state color) | c3.3 | `alldone-01-docs-site-top.png`, `alldone-01-docs-site-bottom.png` | |

## H. Swimlanes

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-093 | Green or yellow display: exactly three rows: Ready For Work, In progress, Ready for review | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-094 | Each row shows name, count, share, and its own bar under the row | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-095 | The 100% bar sits below the rows and is split into those lanes | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-096 | Backlog and Blocked lanes are not shown | c3.3 part 7, c3.2 | `afternoon-03-fga-t04-bottom.png` | |
| UX-097 | An empty Needs Terry lane is not shown | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-098 | Needs Terry is red only when it holds a ticket | c3.3 part 7 | `keyboard-01-fga-t04-bottom.png` | |
| UX-099 | Done lanes (Ready for review) take the display's color on green displays | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |
| UX-100 | Done lanes take the display's color on yellow displays, so a yellow display never shows green | c3.3 part 7, b5 | `afternoon-02-docs-site-bottom.png` | |
| UX-101 | Done lanes use the lightest neutral on red, gray and done displays; never red | c3.3 part 7 | `keyboard-01-fga-t04-bottom.png`, `morning-01-docs-site-bottom.png`, `alldone-01-docs-site-bottom.png` | |
| UX-102 | Tile captions never strand a single word on a line (`text-wrap:pretty`) | c3.3 part 7 | `afternoon-03-fga-t04-bottom.png` | |

## I. No-flicker load and polling

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-103 | The page stays hidden until the DOM is built, the font is ready and the first render is done | c3.4 | - | Record frames during load; no partial frame |
| UX-104 | Inter uses `font-display:block`; no frame draws text in a fallback font | c3.4 | - | |
| UX-105 | The page fades in as a whole, 0.2 s `ease-in`, once per page load | c3.4 | - | |
| UX-106 | No layout jump as content fills in | c3.4 | - | Compare layout before and after data arrives |
| UX-107 | If the font is not ready within 3 s, the page reveals anyway in the fallback font | c3.4 | - | Block the font request |
| UX-108 | Under `prefers-reduced-motion: reduce` the fade is skipped | c3.4 | - | |
| UX-109 | The 10-second poll never fades, blanks or flashes the page | c3.4 | - | Observe across several polls |
| UX-110 | A poll changes only the values that changed (the real page, not the mock's whole-HTML rewrite) | c3.4 | - | Mutation observer: unchanged nodes stay untouched |
| UX-111 | The slot mode is chosen in the same step that draws the Cards, before first paint | c3.2, c3.4 | - | No eight-to-four reflow after paint |
| UX-112 | Polling runs every 10 s against `GET /api/state` | c3.1 | - | |

## J. Navigation

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-113 | Overview is the first display; its dot is square | c3 | `afternoon-00-all-projects.png` | |
| UX-114 | One further dot per project; the active dot is highlighted | c3 | `afternoon-03-fga-t04-bottom.png` | |
| UX-115 | Tapping a Card opens that project's display | c3 | - | Transition |
| UX-116 | Tapping "All projects" returns to the overview | c3.3, c13 | - | Transition; the old `\u0000all` key defect MUST NOT recur |
| UX-117 | Swipe left moves to the next display | c3 | - | Transition |
| UX-118 | Swipe right moves to the previous display | c3 | - | Transition |
| UX-119 | Tapping a dot jumps to that display | c13 | - | Transition |
| UX-120 | Swiping right on the overview does nothing (no wrap) | c3 | - | |
| UX-121 | Swiping left on the last display does nothing (no wrap) | c3 | - | |
| UX-122 | A project display scrolls vertically, top to bottom; Status line stays pinned | c3.3 | `afternoon-03-fga-t04-top.png`, `afternoon-03-fga-t04-bottom.png` | |
| UX-123 | The dots stay visible at the bottom on every display | c3 | `afternoon-03-fga-t04-bottom.png` | |
| UX-124 | When a project disappears or appears between polls, the dots and displays update without jumping the viewer away from the current display | c3 | - | No render; the board is expected to change under the viewer |

## K. Alerts

| ID | State or transition | Rule | Render | Check |
| --- | --- | --- | --- | --- |
| UX-125 | Bell is a slashed icon when Alerts are off, plain when on; no text, so the Status line never wraps in OFFLINE | c3.1, c13 | `afternoon-00-all-projects.png` | |
| UX-126 | Alerts on: a new needs-you item plays a two-tone chime | c3.1 | - | Needs a prior tap for audio |
| UX-127 | Alerts on: the page jumps to the overview when the new needs-you item arrives | c3.1 | - | Transition |
| UX-128 | `navigator.vibrate` is called when available; on iOS it is absent and the page does chime only, with no error | c3.1 | - | |
| UX-129 | Sound needs one tap first (browser rule); the bell tap provides it | c3.1 | - | |
| UX-130 | Alerts off: no chime, no jump | c3.1 | - | |
