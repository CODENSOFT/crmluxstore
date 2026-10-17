import connectDB from "@/lib/mongodb";
import { authenticateApiKey } from "@/lib/apiKeys";
import { matchRoute, logApiCall } from "@/lib/apiV1";
import { errorResponse } from "@/lib/api";

export const maxDuration = 300;

function describe(res) {
  const d = res?.data;
  if (d && typeof d === "object" && "total" in d && "errors" in d) {
    return { message: `total ${d.total}, noi ${d.created}, actualizate ${d.updated}, erori ${d.errors}`, count: d.total, status: d.errors ? "error" : "ok" };
  }
  if (d?.number) return { message: `${d.number}${res.meta?.duplicate ? " (duplicat — deja existent)" : ""}`, count: 1, status: "ok" };
  return { message: "ok", count: undefined, status: "ok" };
}

async function handle(req, ctx, method) {
  const { path = [] } = await ctx.params;
  const route = matchRoute(method, "/" + path.join("/"));
  if (!route) {
    return Response.json({ ok: false, error: "Endpoint inexistent. Documentația: /api/v1/openapi.json" }, { status: 404 });
  }
  if (route.methodNotAllowed) return Response.json({ ok: false, error: `Metoda ${method} nu este permisă aici` }, { status: 405 });

  const started = Date.now();
  let key = null;
  try {
    await connectDB();
    if (route.scope) key = await authenticateApiKey(req, route.scope);
    let body = null;
    if (method === "POST" || method === "PATCH" || method === "PUT") {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return Response.json({ ok: false, error: "Corpul cererii nu este JSON valid (UTF-8)" }, { status: 400 });
        }
      }
    }
    const res = await route.handler({ req, query: new URL(req.url).searchParams, params: route.params, body, key });
    if (res.raw) return res.raw;
    if (route.log) {
      const d = describe(res);
      await logApiCall(key, method, route.pattern, d.status, d.message, Date.now() - started, d.count);
    }
    return Response.json({ ok: true, data: res.data, ...(res.meta ? { meta: res.meta } : {}) }, { status: res.status || 200 });
  } catch (e) {
    if (route.log && key) await logApiCall(key, method, route.pattern, "error", e.message, Date.now() - started);
    return errorResponse(e);
  }
}

export const GET = (req, ctx) => handle(req, ctx, "GET");
export const POST = (req, ctx) => handle(req, ctx, "POST");
export const PATCH = (req, ctx) => handle(req, ctx, "PATCH");
export const PUT = (req, ctx) => handle(req, ctx, "PUT");
export const DELETE = (req, ctx) => handle(req, ctx, "DELETE");
