// The one HTTP request (contract/cli.md section 6): a single POST, one attempt, redirects never
// followed, a fixed timeout. It returns the status and the body text, or a short reason for a
// network failure; it never throws and never puts a header value in a message.
import type { Config } from "./config.ts";

type Sent =
  | { readonly kind: "response"; readonly status: number; readonly text: string }
  | { readonly kind: "network"; readonly reason: string };

interface PostOptions {
  readonly config: Config;
  readonly path: "/api/report" | "/api/stop";
  readonly body: unknown;
  readonly timeoutMs: number;
}

const TRAILING_SLASHES = /\/+$/u;
const MS_PER_SECOND = 1000;

function reasonFor(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `The request timed out after ${timeoutMs / MS_PER_SECOND} seconds.`;
    }
    const { cause } = error;
    if (cause instanceof Error && "code" in cause) {
      return `The connection failed (${String(cause.code)}).`;
    }
  }
  return "The connection failed.";
}

async function post(options: PostOptions): Promise<Sent> {
  const { config, path, body, timeoutMs } = options;
  try {
    const response = await fetch(`${config.url.replace(TRAILING_SLASHES, "")}${path}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "CF-Access-Client-Id": config.accessClientId,
        "CF-Access-Client-Secret": config.accessClientSecret,
      },
      body: JSON.stringify(body),
    });
    return { kind: "response", status: response.status, text: await response.text() };
  } catch (error) {
    return { kind: "network", reason: reasonFor(error, timeoutMs) };
  }
}

export type { Sent };
export { post };
