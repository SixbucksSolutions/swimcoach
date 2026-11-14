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

const raw = runBiome();
const start = raw.indexOf("{");
if (start === -1) {
  process.stderr.write("Biome produced no JSON report; failing closed.\n");
  process.exit(1);
}

const { errors, warnings, infos } = JSON.parse(raw.slice(start)).summary;
if (errors + warnings + infos > 0) {
  process.stderr.write(
    `Biome reported ${errors} errors, ${warnings} warnings and ${infos} infos; the gate allows none.\n`,
  );
  process.exit(1);
}
