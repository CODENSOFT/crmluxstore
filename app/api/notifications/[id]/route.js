import { db, isUuid } from "@/lib/db";
import { route, readJson, notFound } from "@/lib/api";

export const PATCH = route(async ({ req, params, user }) => {
  const { read = true } = await readJson(req);
  const [n] = isUuid(params.id)
    ? await db()`update notifications set read = ${!!read} where id = ${params.id} and recipient_id = ${user.id} returning *`
    : [];
  if (!n) throw notFound("Notificarea nu există");
  return n;
});

export const DELETE = route(async ({ params, user }) => {
  if (isUuid(params.id)) await db()`delete from notifications where id = ${params.id} and recipient_id = ${user.id}`;
  return { deleted: true };
});
