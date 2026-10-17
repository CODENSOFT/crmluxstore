import Category from "@/models/Category";
import Product from "@/models/Product";
import { route, readJson, badRequest } from "@/lib/api";

export const GET = route(async () => {
  const [cats, counts] = await Promise.all([
    Category.find().sort({ sort: 1, name: 1 }).lean(),
    Product.aggregate([{ $match: { active: { $ne: false } } }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return cats.map((c) => ({ ...c, productCount: byId.get(String(c._id)) || 0 }));
});

export const POST = route(
  async ({ req }) => {
    const { name, parent, color } = await readJson(req);
    if (!name?.trim()) throw badRequest("Denumirea categoriei este obligatorie");
    const last = await Category.findOne().sort({ sort: -1 }).lean();
    return Category.create({ name: name.trim(), parent: parent || undefined, color, sort: (last?.sort || 0) + 1 });
  },
  { auth: "admin" }
);
