// @ts-check
// The project display (concept.md section 3.3): a pure port of chart() and detail() from the approved
// mock (mocks/index.html, lines 354-428). It reads only the frozen View and CardView; it never touches
// the DOM, a timer or the network.

/** @import { CardView, View } from "./view.js" */

import {
  ALL,
  clockRtr,
  dur,
  esc,
  hm,
  hoursOfCap,
  LANE_LABELS,
  pct,
  TONE,
  TREND,
} from "./format.js";

/**
 * The lanes that become rows, in board order. Completed is never a row (Terry, 2026-11-13; UX-093,
 * UX-094): a milestone is closed before its tickets reach it, so it is 0, and it has hundreds of
 * tickets when it is not. It still counts as finished in the numbers the display shows.
 * @type {readonly (keyof CardView["lanes"])[]}
 */
const ROW_LANES = ["ready_for_work", "in_progress", "needs_terry", "ready_for_review"];

/** The lanes that hold finished work. Completed is one, though it has no row. */
const DONE_LANES = new Set(["ready_for_review", "completed"]);

/** The one lane that asks Terry for something. */
const ATTENTION_LANE = "needs_terry";

/** Neutral shades for lanes that are neither done nor attention, in row order (docs/brand.md section 5). */
const SHADES = ["var(--stack-2)", "var(--dim)", "var(--text)"];

/** A tile that spans both columns of the grid. */
const WIDE = 'class="tile" style="grid-column:1/-1"';

/**
 * A time as a percent of the chart's width.
 * @param {number} t
 * @param {number} t0  the first sample's time
 * @param {number} t1  the last sample's time
 * @returns {number}
 */
function chartX(t, t0, t1) {
  return ((t - t0) / Math.max(t1 - t0, 1)) * 100;
}

/**
 * A ratio as a percent of the chart's height, measured from the top.
 * @param {number} v
 * @param {number} lo  the bottom of the scale
 * @param {number} hi  the top of the scale
 * @returns {number}
 */
function chartY(v, lo, hi) {
  return (1 - (v - lo) / (hi - lo)) * 100;
}

/**
 * The RTR today line chart, or the placeholder until a second report exists (UX-084).
 * @param {CardView} card
 * @param {string} tone  a palette token, such as "--ok"
 * @returns {string}
 */
function chart(card, tone) {
  const points = card.spark.map(([at, ratio]) => ({ at, ratio: Math.min(ratio, 3) }));
  const [first, ...rest] = points;
  const last = rest.at(-1);
  if (first === undefined || last === undefined) {
    return '<div class="empty">The RTR timeline appears after the second report.</div>';
  }
  const { at: t0 } = first;
  const { at: t1 } = last;
  const values = points.map((p) => p.ratio);
  let lo = Math.min(0.5, ...values);
  let hi = Math.max(1.5, ...values);
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const end = last.ratio;
  const yOne = chartY(1, lo, hi);
  const yEnd = chartY(end, lo, hi);
  const line = points
    .map((p) => `${chartX(p.at, t0, t1).toFixed(2)},${chartY(p.ratio, lo, hi).toFixed(2)}`)
    .join(" ");
  let endLabel = "";
  if (Math.abs(yEnd - yOne) > 9) {
    endLabel = `<span style="top:${yEnd}%;color:var(${tone});font-weight:700">${end.toFixed(2)}</span>`;
  }
  return (
    // biome-ignore lint/security/noSecrets: an HTML fragment; its punctuation reads as high entropy.
    '<div class="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
    `<line x1="0" x2="100" y1="${yOne}" y2="${yOne}" stroke="var(--dim)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` +
    `<polyline fill="none" stroke="var(${tone})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${line}"/></svg>` +
    `<span class="one" style="top:${yOne}%">1.00</span>${endLabel}</div>` +
    `<div class="xax"><span>${hm(t0)}</span><span>${hm(t1)}</span></div>`
  );
}

/**
 * The hero: the big RTR with its clock hand and a label, or the card's `why` alone in small-block mode
 * (UX-134). A needs_terry card shows its `callWhy` instead: the flag below already carries the ask, and
 * the mock's hero always showed the call (visual review MVP-08, item 2).
 * @param {CardView} card
 * @param {string} tone
 * @returns {string}
 */
function hero(card, tone) {
  let big = "";
  let label = "";
  if (card.mode === "ratio" && card.rtr !== null) {
    big = `<div class="big">${clockRtr(card.rtr, card.dir)}</div>`;
    label = "RTR";
    if (card.dir !== null) {
      label += ` &middot; ${TREND[card.dir][0].toLowerCase()}`;
    }
  }
  let words = card.why;
  if (card.reason === "needs_terry") {
    words = card.callWhy;
  }
  return `<div class="hero" style="--c:var(${tone})">${big}<div class="lab">${label}<b>${esc(words)}</b></div></div>`;
}

/**
 * The Projection tiles (UX-085 to UX-088).
 * @param {CardView} card
 * @param {View} view
 * @returns {string}
 */
function projection(card, view) {
  const { trend } = card;
  let tiles = "";
  if (card.level === "done") {
    tiles = `<div ${WIDE}><small>The call</small><b>Done</b><span>Every ticket in this block is finished.</span></div>`;
  } else if (card.tooEarly) {
    const gates = `Needs ${view.thresholds.minHistoryMinutes}m of history and ${Math.round(view.thresholds.minBlockUsed * 100)}% of the time block used.`;
    tiles = `<div ${WIDE}><small>The call</small><b>Too early to call</b><span>${gates}</span></div>`;
  } else if (trend) {
    let odds = "&ndash;";
    if (card.chance !== null) {
      odds = `${Math.min(99, Math.max(1, Math.round(card.chance * 100)))}%`;
    }
    let lands = "No progress";
    let landsNote = "at the recent pace";
    if (card.marginSeconds !== null) {
      landsNote = "projected landing";
      if (card.marginSeconds >= 0) {
        lands = `${dur(card.marginSeconds)} early`;
      } else {
        lands = `${dur(-card.marginSeconds)} late`;
      }
    }
    let proj = "&ndash;";
    if (trend.proj !== null) {
      proj = trend.proj.toFixed(2);
    }
    let sign = "&minus;";
    if (trend.delta >= 0) {
      sign = "+";
    }
    tiles =
      `<div class="tile"><small>Chance on time</small><b>${odds}</b><span>${trend.recentDone} landed in last ${trend.minutes}m, ${trend.toGo} to go</span></div>` +
      `<div class="tile"><small>Lands</small><b>${lands}</b><span>${landsNote}</span></div>` +
      `<div class="tile"><small>RTR at end of block</small><b>${proj}</b><span>if the recent pace holds</span></div>` +
      `<div class="tile"><small>RTR trend</small><b>${sign}${Math.abs(trend.delta).toFixed(2)}</b><span>over the last ${trend.minutes}m</span></div>`;
  } else {
    tiles = `<div ${WIDE}><small>The call</small><b>${esc(card.why)}</b></div>`;
  }
  return `<h4>Projection</h4><div class="tiles">${tiles}</div>`;
}

/**
 * Work against time: the tickets bar and the hours bar (UX-089, UX-090).
 * @param {CardView} card
 * @param {string} tone
 * @returns {string}
 */
function workAgainstTime(card, tone) {
  let rows = "";
  if (card.work !== null) {
    rows += `<label>Work</label><div class="bar"><i style="width:${pct(card.work)}%"></i></div><div class="cap"><b>${card.finished} of ${card.total}</b> tickets &middot; ${Math.round(card.work * 100)}%</div>`;
  }
  const hours = `<b>${hoursOfCap(card.activeHours, card.capHours)}</b> hrs &middot; ${Math.round(card.clock * 100)}%`;
  rows += `<label>Time</label><div class="bar t"><i style="width:${pct(card.clock)}%"></i></div><div class="cap">${hours}</div>`;
  return `<h4>Work against time</h4><div class="meter" style="--c:var(${tone})">${rows}</div>`;
}

/**
 * Swimlanes (UX-093 to UX-101). One row per lane with its own bar, then one 100% bar below the rows.
 * Color follows message (docs/brand.md section 5): done lanes take the display's own color on green and
 * yellow and the lightest neutral elsewhere; the attention lane is red only when it holds a ticket.
 * An empty attention lane is hidden, and Completed is never a row.
 * @param {CardView} card
 * @param {string} tone
 * @returns {string}
 */
function swimlanes(card, tone) {
  let doneColor = "var(--text)";
  if (card.level === "green" || card.level === "yellow") {
    doneColor = `var(${tone})`;
  }
  let neutral = 0;
  const shown = ROW_LANES.filter((lane) => lane !== ATTENTION_LANE || card.lanes[lane] > 0);
  const rows = shown.map((lane) => {
    const count = card.lanes[lane];
    let color = "var(--me)";
    if (DONE_LANES.has(lane)) {
      color = doneColor;
    } else if (lane !== ATTENTION_LANE) {
      color = SHADES[neutral % SHADES.length] ?? "var(--dim)";
      neutral += 1;
    }
    let share = 0;
    if (card.total) {
      share = count / card.total;
    }
    return { name: LANE_LABELS[lane], count, color, share };
  });
  const list = rows
    .map(
      (r) =>
        `<li><div class="lt"><i style="background:${r.color}"></i>${esc(r.name)}<b>${r.count}</b><span>${Math.round(r.share * 100)}%</span></div>` +
        `<div class="lbar"><i style="width:${pct(r.share)}%;background:${r.color}"></i></div></li>`,
    )
    .join("");
  const stack = rows
    .filter((r) => r.count)
    .map((r) => `<i style="background:${r.color};flex:${r.count} 0 0"></i>`)
    .join("");
  return `<h4>Swimlanes</h4><ul class="lanes">${list}</ul><div class="stack" style="margin-top:12px">${stack}</div>`;
}

/**
 * One project's display, as HTML for the section body.
 * @param {CardView} card
 * @param {View} view
 * @returns {string}
 */
export function renderProject(card, view) {
  const tone = TONE[card.level];
  let html = `<button class="back" data-go="${ALL}">&lsaquo; All projects</button><h2>${esc(card.title)}</h2>`;
  html += hero(card, tone);
  if (card.needsMe !== null) {
    html += `<div class="flag me"><b>Go to keyboard:</b> ${esc(card.needsMe)}</div>`;
  }
  if (card.stale) {
    html += `<div class="flag st">No report for ${dur(card.silentSeconds)}. The monitoring agent may have stopped.</div>`;
  }
  if (card.mode === "ratio") {
    html += `<h4>RTR today</h4>${chart(card, tone)}`;
    html += projection(card, view);
  }
  html += workAgainstTime(card, tone);
  html += swimlanes(card, tone);
  html += `<div class="foot">Last ticket move ${hm(card.lastMoveAt || card.updatedAt)} &middot; reported ${hm(card.updatedAt)} by ${esc(card.agent)}</div>`;
  return html;
}
