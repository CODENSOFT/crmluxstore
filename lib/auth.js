import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { authBypassEnabled } from "./authBypass";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "crm_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 zile

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function setSession(payload) {
  const token = await signToken(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

// Limba interfetei, tinuta si intr-un cookie (pentru pagina de autentificare)
export const LANG_COOKIE = "lux-lang";
export async function setLangCookie(lang) {
  const store = await cookies();
  store.set(LANG_COOKIE, lang === "ru" ? "ru" : "ro", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Utilizatorul din cookie (doar verificarea semnaturii JWT)
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Utilizatorul din cookie, verificat si in baza de date (activ, rol actual).
// Un cont dezactivat sau cu rol schimbat are efect imediat, fara a astepta expirarea sesiunii.
// Cu AUTH_BYPASS=1 si fara sesiune valida: primul administrator activ (intrare fara parola).
// Contul verificat se tine minte 15 s pe instanta de server: o interogare mai putin la fiecare cerere
// (pe site fiecare drum pana la baza costa). Orice modificare a unui utilizator il sterge imediat
// (forgetSessionUser); pe alte instante ale serverului modificarea se aplica in cel mult 15 s.
const SESSION_TTL = 15_000;
const g = globalThis;
const sessionCache = (g.__luxSessionCache ||= new Map());
export function forgetSessionUser(id) {
  if (id) sessionCache.delete(String(id));
  else sessionCache.clear();
}

export async function getSessionUser() {
  const payload = await getCurrentUser();
  const { connectDB, db, isUuid } = await import("./db");
  if (payload?.id && isUuid(payload.id)) {
    const hit = sessionCache.get(payload.id);
    if (hit && Date.now() - hit.at < SESSION_TTL) {
      await connectDB();
      return hit.user;
    }
    await connectDB();
    const [u] = await db()`select id, name, email, role, active, permissions, lang from users where id = ${payload.id}`;
    if (u?.active) {
      const user = { id: u._id, name: u.name, email: u.email, role: u.role, permissions: u.permissions || [], lang: u.lang || "ro" };
      if (sessionCache.size > 500) sessionCache.clear();
      sessionCache.set(payload.id, { user, at: Date.now() });
      return user;
    }
    sessionCache.delete(payload.id);
  }
  if (!authBypassEnabled()) return null;
  await connectDB();
  const [admin] = await db()`select id, name, email, role, lang from users where role in ('owner', 'admin') and active order by role = 'owner' desc, created_at limit 1`;
  return admin ? { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: [], lang: admin.lang || "ro", authBypass: true } : null;
}

export const SESSION_COOKIE = COOKIE_NAME;
