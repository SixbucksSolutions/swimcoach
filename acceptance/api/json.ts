// Two small JSON helpers the harness modules share.

type Entry = Readonly<Record<string, unknown>>;

/** U+FEFF, the byte order mark; built from its code so no editor can rewrite the literal. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfe_ff);

function isRecord(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses JSON text after dropping one leading byte order mark; `undefined` when it is not JSON. */
function parseJson(text: string): unknown {
  let json = text;
  if (json.startsWith(BYTE_ORDER_MARK)) {
    json = json.slice(1);
  }
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export type { Entry };
export { BYTE_ORDER_MARK, isRecord, parseJson };
