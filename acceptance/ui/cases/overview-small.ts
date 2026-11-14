// Overview checks for small blocks (UX-131): a milestone with fewer than three tickets is in
// count_and_time mode, and its Card says how much is done and how much time is used instead of an RTR.
import assert from "node:assert/strict";
import type { UiCase } from "../types.ts";
import { COLOR, type Json, named, openWith } from "./overview-kit.ts";
import { cardsOf } from "./overview-probe.ts";

/** U+00B7, the separator between the count and the hours. */
const MIDDLE_DOT = String.fromCharCode(0xb7);

/** Each small-blocks milestone's Card: Title line, Detail blurb and fill. */
const ROWS = [
  ["dotfiles M1", `0 of 1 done ${MIDDLE_DOT} 0.75 of 2.0 hrs`, COLOR.okFill],
  ["flickr-sync T01", `1 of 2 done ${MIDDLE_DOT} 2.6 of 2.0 hrs`, COLOR.risk],
] as const;

const smallCases: UiCase[] = [
  {
    ids: ["UX-131"],
    title:
      "A count_and_time Card shows N of M done and the hours of its cap, with no RTR and no clock hand",
    async run(ctx) {
      const body = ctx.example("small-blocks");
      for (const m of body.milestones as Json[]) {
        assert.equal(m.mode, "count_and_time", "Every small-blocks milestone is count_and_time.");
        const { rtr } = m.metrics as Json;
        assert.notEqual(rtr, null, "The server still sends an RTR.");
      }
      await openWith(ctx, body);
      const cards = await cardsOf(ctx.page);
      for (const [name, blurb, fill] of ROWS) {
        const card = named(cards, name);
        assert.equal(card.detail, blurb, `${name} blurb`);
        assert.equal(card.bg, fill, `${name} fill`);
        assert.equal(card.rtr, null, `${name} shows no RTR`);
        assert.equal(card.handBox, null, `${name} draws no clock hand`);
      }
    },
  },
];

export { smallCases };
