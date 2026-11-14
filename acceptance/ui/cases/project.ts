// Project display checks (MVP-11 B owns this file; t5-interfaces.md). The cases live in the
// project-*.ts files beside it, split by display part so each file stays under Biome's length limit.
import type { UiCase } from "../types.ts";
import { heroCases } from "./project-hero.ts";
import { laneCases } from "./project-lanes.ts";
import { navCases } from "./project-nav.ts";
import { sectionCases } from "./project-sections.ts";
import { smallCases } from "./project-small.ts";

export const projectCases: UiCase[] = [
  ...heroCases,
  ...sectionCases,
  ...laneCases,
  ...navCases,
  ...smallCases,
];
