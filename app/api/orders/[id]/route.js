import Order from "@/models/Order";
import { route, readJson } from "@/lib/api";
import { loadOrder, assertCanView, runOrderAction, deleteOrder } from "@/lib/orderService";

export const GET = route(async ({ params, user }) => {
  const order = await loadOrder(params.id).lean();
  assertCanView(order, user);
  return order;
});

// { action: approve|reject|cancel|stage|approve_edit|reject_edit|invoice|delivery, stage?, reason?, edit? }
export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  const order = await Order.findById(params.id);
  assertCanView(order, user);
  return runOrderAction(order, body, user);
});

export const DELETE = route(async ({ params, user }) => {
  const order = await Order.findById(params.id);
  assertCanView(order, user);
  return deleteOrder(order, user);
});
