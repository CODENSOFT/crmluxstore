import { db } from "@/lib/db";
import { verifyPassword, setSession } from "@/lib/auth";
import { route, readJson, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Limitare simpla a incercarilor (per instanta): 10 incercari / 15 minute / IP+email
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;

function tooMany(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < WINDOW);
  attempts.set(key, a);
  return a.length >= 10;
}

export const POST = route(
  async ({ req }) => {
    const { email, password } = await readJson(req);
    if (!email || !password) return fail("Introduceți emailul și parola");
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
    const key = `${ip}|${String(email).toLowerCase()}`;
    if (tooMany(key)) return fail("Prea multe încercări. Reîncercați peste câteva minute.", 429);

    const [user] = await db()`select * from users where lower(email) = ${String(email).toLowerCase().trim()}`;
    const valid = user && user.active && (await verifyPassword(password, user.passwordHash));
    if (!valid) {
      attempts.get(key).push(Date.now());
      return fail("Email sau parolă incorecte", 401);
    }
    attempts.delete(key);
    await db()`update users set last_login_at = now() where id = ${user._id}`;
    await setSession({ id: user._id, name: user.name, email: user.email, role: user.role });
    await logAudit({ action: "login", category: "user", entity: user, entityName: user.name, user: { id: user._id, name: user.name, role: user.role } });
    return safeUser(user);
  },
  { auth: false }
);

function safeUser(u) {
  return { _id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, position: u.position, active: u.active };
}
