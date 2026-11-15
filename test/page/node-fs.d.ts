// The one Node API a page test uses: breath-window.test.ts reads two style sheets as text, because
// Vitest hands CSS imports over empty. tsconfig.page.json checks against DOM types, not Node's.
declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}
