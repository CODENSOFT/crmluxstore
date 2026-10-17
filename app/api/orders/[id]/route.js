import { route, readJson } from "@/lib/api";
import { loadOrder, loadOrderRow, assertCanView, runOrderAction, deleteOrder } from "@/lib/orderService";

export const GET = route(async ({ params, user }) => {
  const order = await loadOrder(params.id);
  assertCanView(order, user);
  return order;
});

// { action: approve|reject|cancel|stage|approve_edit|reject_edit|invoice|delivery, stage?, reason?, edit? }
export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  assertCanView(await loadOrderRow(params.id), user);
  return runOrderAction(params.id, body, user);
});

export const DELETE = route(async ({ params, user }) => {
  assertCanView(await loadOrderRow(params.id), user);
  return deleteOrder(params.id, user);
});
