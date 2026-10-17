import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { authBypassEnabled } from "./lib/authBypass";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const PUBLIC_PATHS = ["/login"];

async function isAuthed(req) {
  const token = req.cookies.get("crm_session")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

// Protectia paginilor: fara sesiune -> /login. API-ul isi face singur verificarea.
export async function proxy(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }
  // AUTH_BYPASS=1: intrare fara parola (vezi lib/authBypass.js)
  const authed = authBypassEnabled() || (await isAuthed(req));
  if (PUBLIC_PATHS.includes(pathname)) {
    return authed ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (!authed) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
