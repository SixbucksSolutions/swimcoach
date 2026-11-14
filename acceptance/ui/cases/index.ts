// Every UI case the suite runs (t5-interfaces.md). The Lead owns this file; MVP-11 A and B own the
// two case files it joins.
import type { UiCase } from "../types.ts";
import { overviewCases } from "./overview.ts";
import { projectCases } from "./project.ts";

export const cases: UiCase[] = [...overviewCases, ...projectCases];
