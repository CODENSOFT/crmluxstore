import User from "@/models/User";
import Order from "@/models/Order";
import { hashPassword } from "@/lib/auth";
import { route, readJson, badRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";

// Lista utilizatorilor (managerii o folosesc pentru alegerea responsabililor)
export const GET = route(async ({ user, query }) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  const list = users.map((u) => u.toSafeJSON());
  if (user.role !== "admin" || query.get("stats") !== "1") return list;

  // Statistici pe luna curenta pentru fiecare utilizator (doar admin)
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const agg = await Order.aggregate([
    { $match: { createdAt: { $gte: start }, status: { $in: SALE_STAGE_KEYS } } },
    { $group: { _id: "$responsible", orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
  ]);
  const byId = new Map(agg.map((a) => [String(a._id), a]));
  return list.map((u) => ({
    ...u,
    month: { orders: byId.get(String(u._id))?.orders || 0, revenue: byId.get(String(u._id))?.revenue || 0 },
  }));
});

export const POST = route(
  async ({ req, user }) => {
    const { name, email, password, role, phone, position } = await readJson(req);
    if (!name || !email || !password) throw badRequest("Numele, emailul și parola sunt obligatorii");
    if (String(password).length < 6) throw badRequest("Parola trebuie să aibă minim 6 caractere");
    const mail = String(email).toLowerCase().trim();
    if (await User.exists({ email: mail })) throw badRequest("Există deja un utilizator cu acest email");
    const created = await User.create({
      name: String(name).trim(),
      email: mail,
      passwordHash: await hashPassword(password),
      role: role === "admin" ? "admin" : "manager",
      phone,
      position,
    });
    await logAudit({ action: "user_created", category: "user", entity: created, entityName: created.name, user });
    return created.toSafeJSON();
  },
  { auth: "admin" }
);
