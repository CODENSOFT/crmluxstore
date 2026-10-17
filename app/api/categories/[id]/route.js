import { db, isUuid } from "@/lib/db";
import { route, readJson, notFound } from "@/lib/api";

export const PATCH = route(
  async ({ req, params }) => {
    const body = await readJson(req);
    if (!isUuid(params.id)) throw notFound("Categoria nu există");
    const sql = db();
    const patch = {};
    for (const f of ["name", "color", "sort", "active", "externalId"]) if (body[f] !== undefined) patch[f] = body[f];
    if (body.parent !== undefined) patch.parentId = body.parent || null;
    if (Object.keys(patch).length) await sql`update categories set ${sql(patch, ...Object.keys(patch))} where id = ${params.id}`;
    const [c] = await sql`select * from categories where id = ${params.id}`;
    if (!c) throw notFound("Categoria nu există");
    return c;
  },
  { auth: "admin" }
);

// Produsele din categorie raman fara categorie (ON DELETE SET NULL)
export const DELETE = route(
  async ({ params }) => {
    if (!isUuid(params.id)) throw notFound("Categoria nu există");
    await db()`delete from categories where id = ${params.id}`;
    return { deleted: true };
  },
  { auth: "admin" }
);
