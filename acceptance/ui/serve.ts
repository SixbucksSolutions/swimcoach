// A local static server for developing UI cases without a deployment or a secret: it serves a
// directory (normally public/) at http://127.0.0.1:<port>, "/" as index.html. It reads the files as
// data at run time; nothing is imported. The state route is never reached: the harness answers it.
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** Serves `dir` on a free local port; resolves with the origin and a stop function. */
async function serveDirectory(dir: string): Promise<{ url: string; stop: () => Promise<void> }> {
  const root = resolve(dir);
  const server: Server = createServer(async (request, response) => {
    let path = new URL(request.url ?? "/", "http://local").pathname;
    if (path === "/") {
      path = "/index.html";
    }
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) || request.method !== "GET") {
      response.writeHead(HTTP_NOT_FOUND).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(HTTP_OK, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      response.end(bytes);
    } catch {
      response.writeHead(HTTP_NOT_FOUND).end();
    }
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The local server has no TCP port.");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}

export { serveDirectory };
