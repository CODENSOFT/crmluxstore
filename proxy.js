import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// Rute publice care nu necesita autentificare
const PUBLIC_PATHS = ["/login"];

// Cereri Make (cu header x-api-key) catre paginile UI -> redirectionate la API JSON.
// Permite folosirea in Make a URL-urilor "frumoase": /comenzi, /produse, etc.
const MAKE_ALIASES = {
  "/comenzi": "/api/make/orders",
  "/produse": "/api/make/products",
  "/depozite": "/api/make/warehouses",
  "/receptie": "/api/make/arrivals",
};

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

  // Cerere Make (are header x-api-key) catre o pagina UI -> servim API-ul JSON.
  // Astfel poti pune in Make: https://.../comenzi (cu header x-api-key).
  if (req.headers.get("x-api-key") && MAKE_ALIASES[pathname]) {
    const target = req.nextUrl.clone();
    target.pathname = MAKE_ALIASES[pathname];
    return NextResponse.rewrite(target);
  }

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
