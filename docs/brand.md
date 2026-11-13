# swimcoach brand guide

Started 2026-11-13. It records what Terry has chosen, with the measurements behind each choice, so the
app, the docs and any later surface stay one family with each other and with localswim. RFC 2119
keywords; the capitals are load-bearing.

**Status of each section:** *Settled* means Terry chose it. *Open* means it is waiting on him.

## 1. The family

swimcoach is a sibling of [localswim](https://github.com/TerryOtt/localswim): localswim is the board,
swimcoach watches many boards. The family shows in three shared things: the localswim mark, the
localswim bar colors, and the Inter typeface. A new surface SHOULD reuse one of those before it invents
anything.

## 2. The mark (settled)

![The swimcoach mark](../design/logo/swimcoach-512.png)

The localswim mark, unchanged, on a stack of two gray boards stepping up and right. Full construction,
regeneration commands and rejected ideas: [`design/logo/README.md`](../design/logo/README.md).

- `design/logo/swimcoach.svg` is the **one definition**. Every other copy MUST be generated from it.
- The mark MUST NOT be recolored, redrawn, outlined or placed on a busy background.
- Minimum size: 16 px, the browser tab. It was tested there on dark and light tab bars.
- In the app header the mark is 26 × 26 px, 8 px from the wordmark.
- The iPhone home-screen icon is `swimcoach-touch-180.png`: full bleed on `#0b0f14`.

## 3. The wordmark (open)

- Always one lowercase word, **swimcoach**, set in Inter 700, with `letter-spacing:.02em` in the header.
- **Two tones: "swim" and "coach" in different colors.** Terry, 2026-11-13: "I love offsetting colors of
  swim vs coach." The two colors are not chosen yet; candidates are in
  `design/logo/candidates-wordmark.png`.
- Neither wordmark color SHOULD be a status color (section 5), or the name reads as a status.

## 4. Typeface (settled)

**Inter**, v4.1, Latin subset, embedded in the page. Credit and license: `THIRD-PARTY-NOTICES.md` and
`third_party/inter/`. Numbers that change in place (RTR, counts, times) use `font-variant-numeric:
tabular-nums` so they do not jitter.

## 5. Color

### Brand colors (settled)

The localswim bar colors, measured on the mark's `#1D2125` ground by localswim:

| Name | Hex | On `#1D2125` |
|---|---|---|
| Lane blue | `#85B8FF` | 7.94:1 |
| Lane amber | `#E2A100` | 7.20:1 |
| Lane green | `#4BCE97` | 8.16:1 |
| Board | `#1D2125` | (mark ground) |
| Stack | `#3B4550`, `#5A6573` | (back boards) |

### Status colors (settled in part)

Status colors carry meaning on the phone and MUST NOT be used for decoration.

| Meaning | Fill | Text on it | Contrast |
|---|---|---|---|
| Good news: LIVE, on time | `#166534` (`--ok-fill`) | white, full opacity | 7.13:1, AAA |
| Toss-up, running late, silent agent | `#facc15` | `#231a00` | 11.25:1 |
| Needs Terry | `#dc2626` | white | 4.83:1, **not yet AAA** |

- **Good news is one green.** A second fill green MUST NOT be introduced. `--ok` `#4ade80` is for green
  *text* on the dark page only.
- **Two near-identical colors MUST NOT sit side by side** when they mean different things. The eye reads
  the pair as a mistake. This is why the LIVE box and the green cards now share one green.

### Contrast (settled)

- White on the good-news green MUST clear WCAG AAA (7:1), at full opacity. Terry, 2026-11-13.
- AAA for the other pairings is not yet required. Measured shortfalls are listed in `docs/concept.md`
  section 13 for when it is.

## 6. Motion (settled)

- The page appears once, finished: hidden until the font file and the first render are ready, then a
  single 0.2 s `ease-in` fade of the whole page. Polls MUST NOT fade or flash. Full rules:
  `docs/concept.md` section 3.4.
- Motion SHOULD be skipped under `prefers-reduced-motion: reduce`.

## 7. Voice

- The phone is "simple, at a glance". A label SHOULD be one or two words.
- US English. Sentence case for messages; capitals only for the two alarm words, **LIVE** and
  **GO TO KEYBOARD**, and the other health states.
