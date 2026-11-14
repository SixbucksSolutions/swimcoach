// Entry point: node cli/swimcoach.ts <command> [flags]. Node 26 strips the types; there is no build.
import { Buffer } from "node:buffer";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { run } from "./main.ts";

const TIMEOUT_MS = 15_000;

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

process.exitCode = await run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readStdin,
  // os.homedir() reads USERPROFILE on Windows and HOME elsewhere, which is the path cli.md section 5 fixes.
  defaultConfigPath: join(homedir(), ".secrets", "swimcoach", "cli.json"),
  timeoutMs: TIMEOUT_MS,
});
