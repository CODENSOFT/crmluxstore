import mongoose from "mongoose";
import Order from "@/models/Order";
import Task from "@/models/Task";
import Notification from "@/models/Notification";
import { route } from "@/lib/api";
import { visibilityFilter } from "@/lib/orderService";

// Contoare pentru meniu (insigne) + clopotel — un singur apel, la 30s
export const GET = route(async ({ user }) => {
  const uid = new mongoose.Types.ObjectId(String(user.id));
  const vis = visibilityFilter(user);
  const [newOrders, pending, editRequests, tasks, unread] = await Promise.all([
    Order.countDocuments({ ...vis, status: "new" }),
    Order.countDocuments({ ...vis, status: "pending_approval" }),
    user.role === "admin" ? Order.countDocuments({ pendingEdit: { $exists: true, $ne: null } }) : 0,
    Task.countDocuments({ assignedTo: uid, status: { $ne: "done" } }),
    Notification.countDocuments({ recipient: uid, read: false }),
  ]);
  return { newOrders, pending, editRequests, tasks, unread, attention: newOrders + (user.role === "admin" ? pending + editRequests : 0) };
});
