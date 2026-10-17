import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import { connectDB } from "./mongodb";
import { startOfDay, endOfDay } from "./time";

// Raspunsuri JSON consistente: { ok, data, meta? } / { ok:false, error }
export function ok(data, init, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, init);
}

export function fail(message, status = 400, extra) {
  return NextResponse.json({ ok: false, error: message, ...(extra || {}) }, { status });
}

// Eroare cu status HTTP — aruncata din logica de business, prinsa de `route()`
export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const forbidden = (msg = "Acces interzis") => new HttpError(403, msg);
export const notFound = (msg = "Înregistrare inexistentă") => new HttpError(404, msg);

export function assert(cond, msg, status = 400) {
  if (!cond) throw new HttpError(status, msg);
}

// Transforma orice eroare intr-un raspuns JSON clar
export function errorResponse(e) {
  if (e instanceof HttpError) return fail(e.message, e.status, e.extra);
  if (e?.name === "CastError") return fail("Identificator invalid", 400);
  if (e?.name === "ValidationError") {
    const first = Object.values(e.errors || {})[0];
    return fail(first?.message || "Date invalide", 400);
  }
  if (e?.code === 11000) return fail("Există deja o înregistrare cu aceste date (duplicat)", 409);
  if (e?.name === "MongooseServerSelectionError")
    return fail("Baza de date nu răspunde. Încercați din nou în câteva secunde.", 503);
  console.error("[api]", e);
  return fail(e?.message ? `Eroare server: ${e.message}` : "Eroare internă de server", 500);
}

/**
 * Wrapper pentru Route Handlers interne (autentificare prin cookie).
 *   export const GET = route(async ({ req, user, params, query }) => ..., { auth: "admin" })
 * auth: "user" (implicit) | "admin" | false (public)
 */
export function route(fn, { auth = "user" } = {}) {
  return async (req, ctx) => {
    try {
      let user = null;
      if (auth) {
        user = await getSessionUser();
        if (!user) return fail("Neautentificat", 401);
        if (auth === "admin" && user.role !== "admin")
          return fail("Acces interzis. Doar administratorul.", 403);
      } else {
        await connectDB();
      }
      const params = ctx?.params ? await ctx.params : {};
      const query = new URL(req.url).searchParams;
      const res = await fn({ req, user, params, query });
      return res instanceof Response ? res : ok(res);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

// Citeste corpul JSON fara sa arunce la corp gol / invalid
export async function readJson(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

export const isAdmin = (user) => user?.role === "admin";

// Paginare standard (?page=1&limit=50)
export function pagination(query, { defLimit = 50, maxLimit = 500 } = {}) {
  const page = Math.max(1, parseInt(query.get("page") || "1", 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.get("limit") || String(defLimit), 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

export function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  return d ? d.slice(-8) : undefined;
}

// Interval de date din query (?from=YYYY-MM-DD&to=YYYY-MM-DD)
export function dateRange(query, field = "createdAt") {
  const from = query.get("from");
  const to = query.get("to");
  if (!from && !to) return {};
  const r = {};
  if (from) r.$gte = startOfDay(from);
  if (to) r.$lte = endOfDay(to);
  return { [field]: r };
}
