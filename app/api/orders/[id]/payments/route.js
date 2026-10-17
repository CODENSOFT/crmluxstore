import { route, readJson } from "@/lib/api";
import { assertCanView, loadOrderRow, addPayment, removePayment } from "@/lib/orderService";

export const POST = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  assertCanView(await loadOrderRow(params.id), user);
  return addPayment(params.id, body, user);
});

export const DELETE = route(async ({ params, query, user }) => {
  assertCanView(await loadOrderRow(params.id), user);
  return removePayment(params.id, query.get("paymentId"), user);
});
