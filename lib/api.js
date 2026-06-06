import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";

// Helper-e pentru raspunsuri JSON consistente
export function ok(data, init) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Garda: necesita utilizator autentificat. Returneaza {user} sau {response}
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { response: fail("Neautentificat", 401) };
  }
  return { user };
}

// Garda: necesita rol de admin
export async function requireAdmin() {
  const { user, response } = await requireUser();
  if (response) return { response };
  if (user.role !== "admin") {
    return { response: fail("Acces interzis. Doar administratorul.", 403) };
  }
  return { user };
}

// Garda pentru API extern Make.com (header x-api-key)
export function requireApiKey(req) {
  const key = req.headers.get("x-api-key");
  if (!key || key !== process.env.MAKE_API_KEY) {
    return fail("Cheie API invalida", 401);
  }
  return null;
}
