import Category from "@/models/Category";
import Product from "@/models/Product";
import { route, readJson, notFound } from "@/lib/api";

export const PATCH = route(
  async ({ req, params }) => {
    const body = await readJson(req);
    const c = await Category.findById(params.id);
    if (!c) throw notFound("Categoria nu există");
    for (const f of ["name", "color", "sort", "active", "externalId"]) if (body[f] !== undefined) c[f] = body[f];
    if (body.parent !== undefined) c.parent = body.parent || undefined;
    await c.save();
    return c;
  },
  { auth: "admin" }
);

// Produsele din categorie raman fara categorie
export const DELETE = route(
  async ({ params }) => {
    await Product.updateMany({ category: params.id }, { $unset: { category: 1 } });
    await Category.updateMany({ parent: params.id }, { $unset: { parent: 1 } });
    await Category.findByIdAndDelete(params.id);
    return { deleted: true };
  },
  { auth: "admin" }
);
