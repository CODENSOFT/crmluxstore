import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

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
export async function getSessionUser() {
  const payload = await getCurrentUser();
  if (!payload?.id) return null;
  const { connectDB } = await import("./mongodb");
  await connectDB();
  const { default: User } = await import("@/models/User");
  const u = await User.findById(payload.id).select("name email role active").lean();
  if (!u || !u.active) return null;
  return { id: String(u._id), name: u.name, email: u.email, role: u.role };
}

export const SESSION_COOKIE = COOKIE_NAME;
