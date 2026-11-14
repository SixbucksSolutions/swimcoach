// Fails the lint gate when Biome reports any diagnostic, info severity included.
//
// Biome's CLI fails on errors always and on warnings with --error-on-warnings, but has no switch
// for infos, and preset "all" leaves some rules at info severity. Without this step those rules
// would report and never block a merge (found by the T2 review of PR #6, 2026-11-14).
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const biome = fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome"));

function runBiome() {
  try {
    return execFileSync(process.execPath, [biome, "check", "--reporter=json", "."], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    // Biome exits non-zero when it finds errors; the report is still on stdout.
    return String(error.stdout ?? "");
  }
}

function failClosed(why) {
  process.stderr.write(`Biome lint gate: ${why}; failing closed.\n`);
  process.exit(1);
}

function readSummary(raw) {
  const start = raw.indexOf("{");
  if (start === -1) {
    failClosed("Biome produced no JSON report");
  }
  try {
    return JSON.parse(raw.slice(start)).summary;
  } catch {
    return failClosed("Biome's JSON report did not parse");
  }
}

// Every count MUST be a non-negative integer. A missing or renamed field would otherwise sum to
// NaN, and NaN > 0 is false, so a Biome upgrade that changed the report shape would silently
// turn this gate off (found by the second review of PR #6, 2026-11-14).
const summary = readSummary(runBiome());
const counts = ["errors", "warnings", "infos"].map((key) => summary?.[key]);
if (!counts.every((count) => Number.isInteger(count) && count >= 0)) {
  failClosed("Biome's summary lacks integer errors, warnings and infos counts");
}

const [errors, warnings, infos] = counts;
if (errors + warnings + infos > 0) {
  process.stderr.write(
    `Biome reported ${errors} errors, ${warnings} warnings and ${infos} infos; the gate allows none.\n`,
  );
  process.exit(1);
}
