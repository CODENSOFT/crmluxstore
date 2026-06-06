import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Rute publice care nu necesita autentificare
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

export async function proxy(req) {
  const { pathname } = req.nextUrl;

  // Lasa fisierele statice, API-ul si rutele Make sa treaca
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const authed = await isAuthed(req);

  if (PUBLIC_PATHS.includes(pathname)) {
    if (authed) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!authed) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
