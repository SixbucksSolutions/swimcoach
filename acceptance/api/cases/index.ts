// The black-box API acceptance cases (MVP-09 B). The harness imports `cases` and registers each
// one; it filters by `tier`. IDs are never renumbered. Each area keeps its own block:
//   API-001 to 006  access and /healthz        API-100 to 112  golden fixtures (timed)
//   API-010 to 016  routing                    API-120 to 125  test clock and time (timed)
//   API-020 to 030  validation                 API-130 to 141  feed and spark (timed)
//   API-040 to 049  names and limits           API-150 to 151  needs_me (timed)
//   API-060 to 066  lifecycle
//   API-080         production's test_clock_disabled
import type { Case } from "../types.ts";
import { accessCases } from "./access.ts";
import { feedCases } from "./feed.ts";
import { goldenCases } from "./golden.ts";
import { lifecycleCases } from "./lifecycle.ts";
import { nameCases } from "./names.ts";
import { needsMeCases } from "./needs-me.ts";
import { productionCases } from "./production.ts";
import { routingCases } from "./routing.ts";
import { timeCases } from "./time.ts";
import { validationCases } from "./validation.ts";

function uniqueIds(list: Case[]): Case[] {
  const seen = new Set<string>();
  for (const entry of list) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate case ID ${entry.id}`);
    }
    seen.add(entry.id);
  }
  return list;
}

export const cases: Case[] = uniqueIds([
  ...accessCases,
  ...routingCases,
  ...validationCases,
  ...nameCases,
  ...lifecycleCases,
  ...productionCases,
  ...goldenCases(),
  ...timeCases,
  ...feedCases,
  ...needsMeCases,
]);
