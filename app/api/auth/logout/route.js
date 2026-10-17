import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST() {
  await clearSession();
  return ok({ loggedOut: true });
}

// Folosit cand sesiunea nu mai e valida (cont dezactivat): sterge cookie-ul si trimite la login
export async function GET(req) {
  await clearSession();
  return NextResponse.redirect(new URL("/login", req.url));
}
