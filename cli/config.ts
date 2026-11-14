// The config file (contract/cli.md section 5): the service URL and the Access service token, read
// from one JSON file and never from a flag or an environment variable. Error messages here name
// keys and paths and never echo file content: a JSON parser's own message quotes the text it
// choked on, and that text can hold the secret.
import { readFile } from "node:fs/promises";

interface Config {
  readonly url: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
}

type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly message: string };

const KEYS = ["url", "access_client_id", "access_client_secret"] as const;
/** U+FEFF, the byte order mark; built from its code so no editor can rewrite the literal. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfe_ff);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripByteOrderMark(text: string): string {
  if (text.startsWith(BYTE_ORDER_MARK)) {
    return text.slice(1);
  }
  return text;
}

function isHttpUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

async function loadConfig(path: string): Promise<ConfigResult> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  } catch {
    return { ok: false, message: `The config file ${path} is missing or cannot be read as UTF-8.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripByteOrderMark(text));
  } catch {
    return { ok: false, message: `The config file ${path} is not valid JSON.` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, message: `The config file ${path} must hold one JSON object.` };
  }
  const bad = KEYS.filter((key) => typeof parsed[key] !== "string" || parsed[key] === "");
  if (bad.length > 0) {
    return {
      ok: false,
      message: `The config file ${path} lacks a non-empty string for: ${bad.join(", ")}.`,
    };
  }
  const { url, access_client_id, access_client_secret } = parsed;
  if (
    typeof url !== "string" ||
    typeof access_client_id !== "string" ||
    typeof access_client_secret !== "string"
  ) {
    return { ok: false, message: `The config file ${path} is malformed.` };
  }
  if (!isHttpUrl(url)) {
    return { ok: false, message: `The key "url" in ${path} is not an http or https address.` };
  }
  return {
    ok: true,
    config: { url, accessClientId: access_client_id, accessClientSecret: access_client_secret },
  };
}

export type { Config, ConfigResult };
export { loadConfig, stripByteOrderMark };
