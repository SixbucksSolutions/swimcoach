// Chance on time: docs/concept.md section 4.4, a port of chance_to_finish() in
// reference/prototype/server.py.
//
// RFC 2119 keywords; the capitals are load-bearing. The port MUST keep the prototype's numerics, so
// the golden fixtures and V2 agree to the last bit where the platform's Math.log and Math.exp allow.
// JavaScript has no lgamma and no compensated sum, so this file carries ports of the two pieces of
// CPython the prototype leans on:
//
// - math.lgamma: CPython's own Lanczos implementation (Modules/mathmodule.c, m_lgamma), not the C
//   library's. Same coefficients, same branch points, same order of operations.
// - sum() over floats: since CPython 3.12 it is Neumaier's compensated sum (Python/bltinmodule.c),
//   not a plain running total.

import type { ChanceToFinish } from "../contract.ts";

// CPython's lanczos_g and the Lanczos numerator and denominator coefficients, written as the shortest
// literals that round-trip to the same doubles as the C source's 50-digit ones. Each pair is
// [numerator, denominator], lowest power first.
const LANCZOS_G = 6.024_680_040_776_73;
const LANCZOS: readonly (readonly [number, number])[] = [
  [23_531_376_880.410_76, 0],
  [42_919_803_642.6491, 39_916_800],
  [35_711_959_237.355_67, 120_543_840],
  [17_921_034_426.037_21, 150_917_976],
  [6_039_542_586.352_028, 105_258_076],
  [1_439_720_407.311_721_6, 45_995_730],
  [248_874_557.862_054_17, 13_339_535],
  [31_426_415.585_400_194, 2_637_558],
  [2_876_370.628_935_372_5, 357_423],
  [186_056.265_395_223_48, 32_670],
  [8071.672_002_365_816, 1925],
  [210.824_277_751_579_36, 66],
  [2.506_628_274_631_000_2, 1],
];
const LANCZOS_REVERSED = LANCZOS.toReversed();
const LOG_PI = 1.144_729_885_849_400_2;

/** CPython's lanczos_sum(): the Lanczos rational function, rescaled by 1/x above 5 to avoid overflow. */
function lanczosSum(x: number): number {
  let num = 0;
  let den = 0;
  if (x < 5) {
    for (const [n, d] of LANCZOS_REVERSED) {
      num = num * x + n;
      den = den * x + d;
    }
  } else {
    for (const [n, d] of LANCZOS) {
      num = num / x + n;
      den = den / x + d;
    }
  }
  return num / den;
}

/**
 * CPython's m_sinpi() for x > 0, the only way logGamma calls it: sin(pi * x), reduced before the
 * multiply so it stays accurate for large x. C's copysign(1.0, x) is 1 for such x, so it is left out.
 */
function sinPi(x: number): number {
  const y = x % 2;
  switch (Math.round(2 * y)) {
    case 0:
      return Math.sin(Math.PI * y);
    case 1:
      return Math.cos(Math.PI * (y - 0.5));
    case 2:
      return Math.sin(Math.PI * (1 - y));
    case 3:
      return -Math.cos(Math.PI * (y - 1.5));
    default:
      return Math.sin(Math.PI * (y - 2));
  }
}

/**
 * Python's `math.lgamma(x)`: the log of the absolute value of the gamma function.
 *
 * Where Python raises (x a non-positive integer), this returns `Infinity`, the value CPython computes
 * before it raises. Exported for the tests, which compare it with Python value for value.
 */
export function logGamma(x: number): number {
  if (Number.isNaN(x)) {
    return x;
  }
  if (!Number.isFinite(x)) {
    return Number.POSITIVE_INFINITY;
  }
  if (x === Math.floor(x) && x <= 2) {
    if (x <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return 0;
  }
  const absx = Math.abs(x);
  if (absx < 1e-20) {
    return -Math.log(absx);
  }
  let r = Math.log(lanczosSum(absx)) - LANCZOS_G;
  r += (absx - 0.5) * (Math.log(absx + LANCZOS_G - 0.5) - 1);
  if (x < 0) {
    r = LOG_PI - Math.log(Math.abs(sinPi(absx))) - Math.log(absx) - r;
  }
  return r;
}

/**
 * The chance that the `toGo` remaining tickets all land in the `remaining` time, given that
 * `recentDone` landed in the recent `span` (docs/concept.md section 4.4).
 *
 * Completions arrive at an unknown steady rate (Poisson) with a Jeffreys prior, so the count in the
 * time left is negative binomial with `r = recentDone + 0.5` and `p = span / (span + remaining)`.
 * `span` and `remaining` only need to share a unit. The result is not rounded.
 *
 * The inputs are counts and clock shares as api.md section 6.3 derives them: `recentDone >= 0` and
 * `toGo` whole numbers. Two inputs differ from the prototype, which raises on both:
 * - `remaining` so small beside `span` that `1 - p` rounds to 0 gives 0, the limit as time runs out.
 * - `span` so small beside `remaining` that `p` rounds to 0 gives 1, the limit as the pace grows.
 */
export const chanceToFinish: ChanceToFinish = (recentDone, span, toGo, remaining) => {
  if (toGo <= 0) {
    return 1;
  }
  if (remaining <= 0 || span <= 0) {
    return 0;
  }
  const r = recentDone + 0.5;
  const p = span / (span + remaining);
  if (p === 1) {
    return 0;
  }
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  const lgammaR = logGamma(r);
  // Neumaier's sum, as CPython's sum() does it, of the negative-binomial terms for j < toGo.
  let below = 0;
  let compensation = 0;
  for (let j = 0; j < toGo; j += 1) {
    const term = Math.exp(logGamma(r + j) - logGamma(j + 1) - lgammaR + r * logP + j * logQ);
    const total = below + term;
    if (Math.abs(below) >= Math.abs(term)) {
      compensation += below - total + term;
    } else {
      compensation += term - total + below;
    }
    below = total;
  }
  if (compensation !== 0 && Number.isFinite(compensation)) {
    below += compensation;
  }
  // Python's max(0.0, min(1.0, x)): a NaN falls through to 1.0, exactly as the prototype's does.
  const chance = 1 - below;
  if (!(chance < 1)) {
    return 1;
  }
  return Math.max(0, chance);
};
