// The golden fixtures, read as data from contract/fixtures (format: that folder's README). The
// suite never imports MVP code; MVP-09 B's timed cases replay what this returns.
import { readdirSync, readFileSync } from "node:fs";
import type { Fixture } from "./types.ts";

const FIXTURE_DIR = new URL("../../contract/fixtures/", import.meta.url);

function loadFixture(name: string): Fixture {
  const parsed = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURE_DIR), "utf8")) as Fixture;
  return parsed;
}

/** Every `contract/fixtures/*.json`, sorted by file name. */
function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .toSorted()
    .map((file) => loadFixture(file.slice(0, -".json".length)));
}

export { loadFixture, loadFixtures };
