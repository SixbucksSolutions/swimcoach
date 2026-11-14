// Placeholder Worker. Static assets answer "/" before this handler runs; MVP-07 owns the real API.
// The Lead owns this router (mvp-staffing-plan.md, "Integration ownership").

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/healthz") {
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
