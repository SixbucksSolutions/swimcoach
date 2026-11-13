# Inter

swimcoach uses the **Inter** typeface by Rasmus Andersson and The Inter Project Authors.

| | |
|---|---|
| Project | https://github.com/rsms/inter |
| License | SIL Open Font License 1.1, in [`LICENSE.txt`](LICENSE.txt), copied unchanged from the release |
| Release | v4.1, `Inter-4.1.zip`, 33,707,794 bytes |
| Release zip SHA2-256 | `9883FDD4A49D4FB66BD8177BA6625EF9A64AA45899767DDE3D36AA425756B11E` |
| Vendored | 2026-11-13 |

## The font file here

`InterVariable-latin.woff2` (98,836 bytes) is a subset of the release's `web/InterVariable.woff2` (352,240
bytes): upright only, both variable axes kept (`wght` 100–900, `opsz` 14–32), and every OpenType feature
kept, including `tnum` for tabular numbers. It covers Basic Latin, Latin-1, General Punctuation, the
arrows U+2190–2193 and the minus sign. Inter has no glyph for `▾` (U+25BE), so the browser draws that one
character from a fallback font.

The license reserves no font name, so the subset keeps the name Inter. The OFL requires the license to
travel with the font, which is why `LICENSE.txt` sits beside it and the mock carries a notice next to the
embedded copy.

Made with fontTools 4.68.0:

    uv run --no-project --with fonttools --with brotli pyftsubset web/InterVariable.woff2 ^
      --unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2190-2193,U+2212,U+25BE" ^
      --layout-features="*" --flavor=woff2 --output-file=InterVariable-latin.woff2

`mocks/tools/embed-font.py` writes this file into `mocks/index.html` as a base64 `@font-face` rule.
