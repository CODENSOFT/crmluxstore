import Order from "@/models/Order";
import { route, readJson } from "@/lib/api";
import { assertCanView, addPayment, removePayment } from "@/lib/orderService";

export const POST = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  const order = await Order.findById(params.id);
  assertCanView(order, user);
  return addPayment(order, body, user);
});

export const DELETE = route(async ({ params, query, user }) => {
  const order = await Order.findById(params.id);
  assertCanView(order, user);
  return removePayment(order, query.get("paymentId"), user);
});
