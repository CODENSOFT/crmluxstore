import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword, setSession } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export async function POST(req) {
  await connectDB();
  const { email, password } = await req.json();

  if (!email || !password) {
    return fail("Introduceti email si parola");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.active) {
    return fail("Email sau parola incorecte", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return fail("Email sau parola incorecte", 401);
  }

  await setSession({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  });

  return ok(user.toSafeJSON());
}
