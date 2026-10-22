import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import { can, permissionLabel, isAdminUser } from "./permissions";
import { connectDB } from "./db";
import { startOfDay, endOfDay } from "./time";

// Raspunsuri JSON consistente: { ok, data, meta? } / { ok:false, error }
export function ok(data, init, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, init);
}

export function fail(message, status = 400, extra) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
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
  // Erori Postgres (coduri SQLSTATE)
  if (e?.code === "23505") return fail("Există deja o înregistrare cu aceste date (duplicat)", 409);
  if (e?.code === "22P02") return fail("Identificator sau valoare invalidă", 400);
  if (e?.code === "23503") return fail("Referință invalidă: înregistrarea legată nu există", 400);
  if (e?.code === "23502" || e?.code === "23514") return fail("Date incomplete sau invalide", 400);
  if (e?.code === "22003") return fail("Valoare numerică prea mare", 400);
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "57P01"].includes(e?.code))
    return fail("Baza de date nu răspunde. Încercați din nou în câteva secunde.", 503);
  console.error("[api]", e);
  return fail(e?.message ? `Eroare server: ${e.message}` : "Eroare internă de server", 500);
}

/**
 * Wrapper pentru Route Handlers interne (autentificare prin cookie).
 *   export const GET = route(async ({ req, user, params, query }) => ..., { auth: "admin" })
 * auth: "user" (implicit) | "admin" (administrator) | "owner" (administratorul principal) | false (public)
 * perm: dreptul (sau lista de drepturi) necesar(e) — vezi lib/permissions.js; adminul le are pe toate
 */
export function route(fn, { auth = "user", perm } = {}) {
  return async (req, ctx) => {
    const t0 = performance.now();
    const q0 = globalThis.__luxQueries || 0;
    try {
      let user = null;
      if (auth) {
        user = await getSessionUser();
        if (!user) return fail("Neautentificat", 401);
        if (auth === "admin" && !isAdminUser(user))
          return fail("Acces interzis. Doar administratorul.", 403);
        if (auth === "owner" && user.role !== "owner")
          return fail("Acces interzis. Doar administratorul principal.", 403);
        if (perm && !can(user, perm)) {
          const missing = (Array.isArray(perm) ? perm : [perm]).filter((p) => !can(user, p)).map(permissionLabel);
          return fail(`Nu aveți dreptul necesar: ${missing.join(", ")}. Cereți-l administratorului.`, 403);
        }
      } else {
        await connectDB();
      }
      const params = ctx?.params ? await ctx.params : {};
      const query = new URL(req.url).searchParams;
      const res = await fn({ req, user, params, query });
      const out = res instanceof Response ? res : ok(res);
      // durata pe server (vizibila in DevTools → Network → Timing), pentru diagnosticarea vitezei
      out.headers.set("Server-Timing", `app;dur=${(performance.now() - t0).toFixed(1)}${process.env.PG_DEBUG ? `, db;desc="interogari ${(globalThis.__luxQueries || 0) - q0}"` : ""}`);
      return out;
    } catch (e) {
      return errorResponse(e);
    }
  };
}

// Citeste corpul JSON. Corp gol -> {} (cereri fara date); JSON stricat -> eroare 400 clara,
// in loc sa fie tratat in tacere ca o cerere fara date.
export async function readJson(req) {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) || {};
  } catch {
    throw badRequest("Corpul cererii nu este JSON valid");
  }
}

export const isAdmin = (user) => isAdminUser(user);

/** Arunca 403 daca utilizatorul nu are dreptul (verificari in interiorul handler-ului) */
export function requirePerm(user, perm) {
  if (can(user, perm)) return;
  const missing = (Array.isArray(perm) ? perm : [perm]).filter((p) => !can(user, p)).map(permissionLabel);
  throw new HttpError(403, `Nu aveți dreptul necesar: ${missing.join(", ")}. Cereți-l administratorului.`);
}

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
