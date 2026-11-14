import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

// Two projects. The Worker tests run inside workerd. The CLI is a Node program, so test/cli runs
// under plain Node: it spawns the CLI against a local mock HTTP server.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: {
          name: "worker",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "test/cli/**"],
        },
      },
      {
        test: { name: "cli", environment: "node", include: ["test/cli/**/*.test.ts"] },
      },
    ],
  },
});
