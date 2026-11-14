// The suite's config file: contract/cli.md section 5's shape (url, access_client_id,
// access_client_secret), so the secret goes only to the url beside it. Error messages name keys and
// paths and never echo file content: a JSON parser's own message quotes the text it choked on, and
// that text can hold the secret. The suite MUST NOT import cli/config.ts (a Biome guard enforces
// it), so this is its own small copy of the rule.
import { readFile } from "node:fs/promises";
import { isRecord, parseJson } from "./json.ts";

interface Config {
  readonly url: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
}

type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly message: string };

const KEYS = ["url", "access_client_id", "access_client_secret"] as const;

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
  const parsed = parseJson(text);
  if (parsed === undefined) {
    return { ok: false, message: `The config file ${path} is not valid JSON.` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, message: `The config file ${path} must hold one JSON object.` };
  }
  const { url, access_client_id, access_client_secret } = parsed;
  const bad = KEYS.filter((key) => typeof parsed[key] !== "string" || parsed[key] === "");
  if (
    bad.length > 0 ||
    typeof url !== "string" ||
    typeof access_client_id !== "string" ||
    typeof access_client_secret !== "string"
  ) {
    return {
      ok: false,
      message: `The config file ${path} lacks a non-empty string for: ${bad.join(", ")}.`,
    };
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
export { loadConfig };
