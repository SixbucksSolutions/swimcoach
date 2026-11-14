// Overview display checks (MVP-11 A owns this file and the overview-*.ts files it joins). One case per
// behavior, each citing the UX ledger rows it proves; the split is only so no file outgrows Biome's
// file-length limit. Rows a browser cannot prove (the chime's sound, the real phone) are listed in the
// pull request, not here.
import type { UiCase } from "../types.ts";
import { alertCases } from "./overview-alerts.ts";
import { breathCases } from "./overview-breath.ts";
import { cardCases } from "./overview-cards.ts";
import { healthCases } from "./overview-health.ts";
import { keyboardCases } from "./overview-keyboard.ts";
import { layoutCases } from "./overview-layout.ts";
import { loadCases } from "./overview-load.ts";
import { slotCases } from "./overview-slots.ts";
import { smallCases } from "./overview-small.ts";
import { statusCases } from "./overview-status.ts";
import { warnCases } from "./overview-warn.ts";

const overviewCases: UiCase[] = [
  ...statusCases,
  ...healthCases,
  ...cardCases,
  ...smallCases,
  ...keyboardCases,
  ...layoutCases,
  ...slotCases,
  ...warnCases,
  ...breathCases,
  ...loadCases,
  ...alertCases,
];

export { overviewCases };
