import { getCurrentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("Neautentificat", 401);
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}
