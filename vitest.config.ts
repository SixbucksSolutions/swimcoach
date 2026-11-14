import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

// Three projects. The Worker tests run inside workerd. The CLI is a Node program, so test/cli runs
// under plain Node: it spawns the CLI against a local mock HTTP server. The page's modules
// (public/js) are pure functions over a View, so test/page runs under plain Node too; a test that
// needs a DOM (morph.test.ts) opts into happy-dom with a "// @vitest-environment happy-dom" comment
// at the top of its file.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: {
          name: "worker",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "test/cli/**", "test/page/**"],
        },
      },
      {
        test: { name: "cli", environment: "node", include: ["test/cli/**/*.test.ts"] },
      },
      {
        test: { name: "page", environment: "node", include: ["test/page/**/*.test.ts"] },
      },
    ],
  },
});
