// Placeholder Worker. Static assets answer "/" before this handler runs; MVP-07 owns the real API.
// The Lead owns this router (mvp-staffing-plan.md, "Integration ownership").

// biome-ignore lint/performance/noBarrelFile: workerd finds a Durable Object class only as an export of the main module.
export { Board } from "./board/board.ts";

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/healthz") {
      // contract/api.md section 1: every API answer carries Cache-Control: no-store.
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
