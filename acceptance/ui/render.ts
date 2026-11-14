// Production renders (MVP-12 C): PNG screenshots of a deployed page at 402 x 874 CSS px, device scale
// 3 (1206 x 2622 px), for the contract examples and one project display. It answers the page's state
// polls through the UI harness exactly as the suite does, so it never writes to the server. It imports
// the harness and Node built-ins only. Run it from the repository root:
//
//   node acceptance/ui/render.ts --config <file> [--out <dir>]
//
// The config file has cli.json's shape. --out defaults to docs/qualification/renders. Every PNG gets a
// pHYs chunk of 300 DPI (AGENTS.md: images are PNGs at 300 DPI).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { crc32 } from "node:zlib";
import { type CaseContext, startUi, type Target } from "./harness.ts";

type Page = CaseContext["page"];

const EXAMPLES = ["afternoon", "allgreen", "stale", "silent", "small-blocks"] as const;
const PROJECT_EXAMPLE = "afternoon";
const PROJECT_DISPLAY = 1;
const PAGE_WIDTH = 402;
const SETTLE_STEP_MS = 50;
const SETTLE_STEPS = 100;
const PAINT_MS = 400;
const USAGE_ERROR = 2;

// 300 dots per inch is 11811 pixels per meter (300 / 0.0254, rounded).
const PIXELS_PER_METER = 11_811;
const PNG_SIGNATURE_BYTES = 8;
const IHDR_END = 33;

/** The PNG with a pHYs chunk (300 DPI) placed straight after IHDR, as the PNG specification requires. */
function stamp300Dpi(png: Buffer): Buffer {
  // biome-ignore lint/security/noSecrets: the eight-byte PNG signature, not a secret.
  if (png.subarray(0, PNG_SIGNATURE_BYTES).toString("latin1") !== "\u0089PNG\r\n\u001a\n") {
    throw new Error("The screenshot is not a PNG.");
  }
  const data = Buffer.alloc(9);
  data.writeUInt32BE(PIXELS_PER_METER, 0);
  data.writeUInt32BE(PIXELS_PER_METER, 4);
  data.writeUInt8(1, 8); // unit: the meter
  const typeAndData = Buffer.concat([Buffer.from("pHYs", "latin1"), data]);
  const chunk = Buffer.alloc(typeAndData.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), typeAndData.length + 4);
  return Buffer.concat([png.subarray(0, IHDR_END), chunk, png.subarray(IHDR_END)]);
}

function fail(message: string): never {
  process.stderr.write(
    `${message}\nUsage: node acceptance/ui/render.ts --config <file> [--out <dir>]\n`,
  );
  process.exit(USAGE_ERROR);
}

/** The deployment named by a config file, as the suite's own runner reads it. Never echoes the file. */
async function targetFrom(path: string): Promise<Target> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return fail(`The config file ${path} is missing or is not valid JSON.`);
  }
  const { url, access_client_id: id, access_client_secret: secret } = parsed;
  if (typeof url !== "string" || typeof id !== "string" || typeof secret !== "string") {
    return fail(`The config file ${path} lacks url, access_client_id or access_client_secret.`);
  }
  return {
    url: url.replace(/\/+$/u, ""),
    headers: { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret },
  };
}

const { values } = parseArgs({
  options: { config: { type: "string" }, out: { type: "string" } },
  strict: true,
});
if (values.config === undefined) {
  fail("Give --config <file>.");
}
const outDir = resolve(
  values.out ?? fileURLToPath(new URL("../../docs/qualification/renders/", import.meta.url)),
);
await mkdir(outDir, { recursive: true });

const ui = await startUi(await targetFrom(values.config), "webkit");
const written: string[] = [];

async function save(png: Buffer, name: string): Promise<void> {
  const file = resolve(outDir, name);
  await writeFile(file, stamp300Dpi(png));
  written.push(file);
}

/** Lets real time pass: the page's clock is paused, so a scroll or a paint needs this. */
async function quiet(page: Page, ms: number): Promise<void> {
  // biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: the page clock is paused, so only real time moves a scroll or a paint; there is no event to wait on.
  await page.waitForTimeout(ms);
}

/** Waits until the displays strip rests on display number `index` (0 is the overview). */
async function settleOn(page: Page, index: number, tries = SETTLE_STEPS): Promise<void> {
  const left = Number(await page.evaluate(`document.querySelector("#pages").scrollLeft`));
  if (left === index * PAGE_WIDTH) {
    return;
  }
  if (tries <= 0) {
    throw new Error(`The strip did not come to rest on display ${index}.`);
  }
  await quiet(page, SETTLE_STEP_MS);
  await settleOn(page, index, tries - 1);
}

/** One example as the page draws it, then (for the project example) one project's display. */
async function renderExample(name: string): Promise<void> {
  const ctx = await ui.newContext();
  try {
    ctx.answer({ body: ctx.example(name) });
    await ctx.open();
    await quiet(ctx.page, PAINT_MS);
    await save(await ctx.page.screenshot(), `overview-${name}.png`);
    if (name === PROJECT_EXAMPLE) {
      // The way Terry moves: a tap on the dot of the first project's display.
      await ctx.page.locator("#dots button").nth(PROJECT_DISPLAY).tap();
      await settleOn(ctx.page, PROJECT_DISPLAY);
      await quiet(ctx.page, PAINT_MS);
      await save(await ctx.page.screenshot(), `project-${name}.png`);
    }
  } finally {
    await ctx.close();
  }
}

/** The examples one after another: each gets its own context, and the order is the order given. */
async function renderAll(names: readonly string[]): Promise<void> {
  const [first, ...rest] = names;
  if (first === undefined) {
    return;
  }
  await renderExample(first);
  await renderAll(rest);
}

try {
  await renderAll(EXAMPLES);
} finally {
  await ui.close();
}
process.stdout.write(`${written.join("\n")}\n`);
