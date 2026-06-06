import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { ok, fail, requireAdmin, requireUser } from "@/lib/api";

// Lista utilizatorilor — adminul vede toti; managerul vede lista (pentru responsabili) dar fara date sensibile
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const users = await User.find().sort({ createdAt: -1 });
  return ok(users.map((u) => u.toSafeJSON()));
}

// Creare manager (doar admin)
export async function POST(req) {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();

  const body = await req.json();
  const { name, email, password, role, phone } = body;

  if (!name || !email || !password) {
    return fail("Nume, email si parola sunt obligatorii");
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) return fail("Exista deja un utilizator cu acest email");

  const created = await User.create({
    name,
    email: email.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    role: role === "admin" ? "admin" : "manager",
    phone,
  });

  return ok(created.toSafeJSON(), { status: 201 });
}
