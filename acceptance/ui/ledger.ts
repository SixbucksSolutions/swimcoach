// The UX ledger as data (contract/ux-ledger.md): which rows exist and which are live. A UI case MAY
// prove only a live row, one whose V1 cell reads Pending or Yes; a superseded or retired row is
// proven through its successor.
import { readFileSync } from "node:fs";

const LEDGER = new URL("../../contract/ux-ledger.md", import.meta.url);
const ROW = /^\| (?<id>UX-\d{3}) \|.*\| (?<v1>[^|]+) \|$/u;

/** Every ledger row's ID mapped to its V1 cell. */
function ledgerRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of readFileSync(LEDGER, "utf8").split(/\r?\n/u)) {
    const groups = ROW.exec(line)?.groups;
    if (groups?.id !== undefined && groups.v1 !== undefined) {
      rows.set(groups.id, groups.v1.trim());
    }
  }
  return rows;
}

/** Throws unless every ID names a live row. */
function expectLiveRows(ids: readonly string[], where: string): void {
  const rows = ledgerRows();
  for (const id of ids) {
    const v1 = rows.get(id);
    if (v1 === undefined) {
      throw new TypeError(`${where}: ${id} is not a row of contract/ux-ledger.md.`);
    }
    if (v1 !== "Pending" && v1 !== "Yes") {
      throw new TypeError(`${where}: ${id} is not live (V1: ${v1}); prove its successor instead.`);
    }
  }
}

export { expectLiveRows, ledgerRows };
