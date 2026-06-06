import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import User from "@/models/User";
import { ok, fail, requireUser, requireAdmin } from "@/lib/api";
import { applyOrderStock } from "@/lib/stock";
import { buildOrderItems } from "@/lib/orderItems";
import { dispatchToMake } from "@/lib/make";
import {
  notifyDecision,
  notifyAdminsForEdit,
  notifyEditDecision,
  clearApprovalNotifications,
} from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { STAGE_KEYS, stageConsumesStock } from "@/lib/orderStages";

async function loadPopulated(id) {
  return Order.findById(id)
    .populate("responsible", "name email")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email")
    .populate("items.warehouse", "name")
    .populate("pendingEdit.items.warehouse", "name")
    .populate("pendingEdit.responsible", "name");
}

// Inlocuieste stocul aplicat: returneaza liniile vechi, scade liniile noi.
// In caz de stoc insuficient, revine la starea initiala si arunca eroare.
async function swapStock(oldItems, newItems) {
  await applyOrderStock(oldItems, +1);
  try {
    await applyOrderStock(newItems, -1);
  } catch (e) {
    await applyOrderStock(oldItems, -1); // rollback
    throw e;
  }
}

export async function GET(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const order = await loadPopulated(id);
  if (!order) return fail("Comanda inexistenta", 404);

  if (
    user.role !== "admin" &&
    String(order.createdBy._id) !== String(user.id) &&
    String(order.responsible._id) !== String(user.id)
  ) {
    return fail("Acces interzis", 403);
  }
  return ok(order);
}

export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const { action, stage, edit } = await req.json();

  const order = await Order.findById(id);
  if (!order) return fail("Comanda inexistenta", 404);

  const isAdmin = user.role === "admin";
  const isResponsible = String(order.responsible) === String(user.id);
  const isCreator = String(order.createdBy) === String(user.id);

  /* --- Editare comanda --- */
  if (edit) {
    if (!isAdmin && !isResponsible && !isCreator) {
      return fail("Acces interzis", 403);
    }
    if (["rejected", "completed"].includes(order.status)) {
      return fail("Comanda finalizata/respinsa nu mai poate fi editata");
    }

    let built, total;
    try {
      ({ items: built, total } = await buildOrderItems(edit.items));
    } catch (e) {
      return fail(e.message);
    }

    // Responsabil nou doar daca e admin
    let newResponsible = order.responsible;
    if (isAdmin && edit.responsible) {
      const r = await User.findById(edit.responsible);
      if (!r) return fail("Responsabil inexistent");
      newResponsible = r._id;
    }

    if (isAdmin) {
      // Adminul aplica modificarea direct
      if (order.stockApplied) {
        try {
          await swapStock(order.items, built);
        } catch (e) {
          return fail(e.message);
        }
      }
      order.items = built;
      order.total = total;
      order.customerName = edit.customerName;
      order.note = edit.note;
      order.responsible = newResponsible;
      order.pendingEdit = undefined;
      await order.save();
      const populated = await loadPopulated(id);
      await logAudit({
        action: "edited",
        order: populated,
        user,
        details: `${built.length} produse · total ${total}`,
      });
      await dispatchToMake("order.updated", populated.toJSON());
      return ok(populated);
    }

    // Managerul cere modificarea -> asteapta aprobarea adminului
    order.pendingEdit = {
      items: built,
      total,
      customerName: edit.customerName,
      note: edit.note,
      requestedBy: user.id,
      requestedByName: user.name,
      requestedAt: new Date(),
    };
    await order.save();
    const populated = await loadPopulated(id);
    await notifyAdminsForEdit(populated, user.name);
    await logAudit({
      action: "edit_requested",
      order: populated,
      user,
      details: `total propus ${total}`,
    });
    return ok(populated);
  }

  /* --- Aprobare modificare (doar admin) --- */
  if (action === "approve_edit") {
    if (!isAdmin) return fail("Doar administratorul poate aproba", 403);
    if (!order.pendingEdit) return fail("Nu exista modificari in asteptare");
    const pe = order.pendingEdit;
    if (order.stockApplied) {
      try {
        await swapStock(order.items, pe.items);
      } catch (e) {
        return fail(e.message);
      }
    }
    const requestedBy = pe.requestedBy;
    order.items = pe.items;
    order.total = pe.total;
    order.customerName = pe.customerName;
    order.note = pe.note;
    order.pendingEdit = undefined;
    await order.save();
    const populated = await loadPopulated(id);
    await notifyEditDecision(populated, "approve", requestedBy);
    await logAudit({
      action: "edit_approved",
      order: populated,
      user,
      details: `total ${order.total}`,
    });
    await dispatchToMake("order.updated", populated.toJSON());
    return ok(populated);
  }

  /* --- Respingere modificare (doar admin) --- */
  if (action === "reject_edit") {
    if (!isAdmin) return fail("Doar administratorul poate respinge", 403);
    if (!order.pendingEdit) return fail("Nu exista modificari in asteptare");
    const requestedBy = order.pendingEdit.requestedBy;
    order.pendingEdit = undefined;
    await order.save();
    const populated = await loadPopulated(id);
    await notifyEditDecision(populated, "reject", requestedBy);
    await logAudit({ action: "edit_rejected", order: populated, user });
    return ok(populated);
  }

  /* --- Aprobare comanda (doar admin) --- */
  if (action === "approve") {
    if (!isAdmin) return fail("Doar administratorul poate aproba", 403);
    if (order.status !== "pending_approval" && order.status !== "new") {
      return fail("Comanda nu mai asteapta aprobare");
    }
    if (!order.stockApplied) {
      try {
        await applyOrderStock(order.items, -1);
      } catch (e) {
        return fail(e.message);
      }
      order.stockApplied = true;
    }
    order.status = "processing";
    order.approvedBy = user.id;
    await order.save();
    const populated = await loadPopulated(id);
    await clearApprovalNotifications(order._id);
    await notifyDecision(populated, "approve");
    await logAudit({ action: "approved", order: populated, user });
    await dispatchToMake("order.approved", populated.toJSON());
    return ok(populated);
  }

  /* --- Respingere comanda (doar admin) --- */
  if (action === "reject") {
    if (!isAdmin) return fail("Doar administratorul poate respinge", 403);
    if (order.stockApplied) {
      await applyOrderStock(order.items, +1);
      order.stockApplied = false;
    }
    order.status = "rejected";
    order.approvedBy = user.id;
    await order.save();
    const populated = await loadPopulated(id);
    await clearApprovalNotifications(order._id);
    await notifyDecision(populated, "reject");
    await logAudit({ action: "rejected", order: populated, user });
    await dispatchToMake("order.rejected", populated.toJSON());
    return ok(populated);
  }

  /* --- Schimbare stadiu in pipeline --- */
  if (stage) {
    if (!STAGE_KEYS.includes(stage)) return fail("Stadiu invalid");
    if (!isAdmin && !isResponsible) return fail("Acces interzis", 403);
    if (!isAdmin && (order.status === "pending_approval" || order.status === "new")) {
      return fail("Comanda trebuie aprobata de administrator intai", 403);
    }
    if (!isAdmin && (stage === "pending_approval" || stage === "rejected")) {
      return fail("Aceasta actiune este permisa doar adminului", 403);
    }

    if (stageConsumesStock(stage) && !order.stockApplied) {
      try {
        await applyOrderStock(order.items, -1);
      } catch (e) {
        return fail(e.message);
      }
      order.stockApplied = true;
      if (!order.approvedBy) order.approvedBy = user.id;
    }

    const prev = order.status;
    order.status = stage;
    await order.save();
    const populated = await loadPopulated(id);
    await logAudit({
      action: "stage_changed",
      order: populated,
      user,
      details: `${prev} -> ${stage}`,
    });
    await dispatchToMake("order.stage_changed", populated.toJSON());
    return ok(populated);
  }

  return fail("Actiune invalida");
}

export async function DELETE(req, { params }) {
  const { user, response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const order = await Order.findById(id);
  if (!order) return fail("Comanda inexistenta", 404);
  if (order.stockApplied) {
    await applyOrderStock(order.items, +1);
  }
  await logAudit({
    action: "deleted",
    order,
    user,
    details: `Comanda ${order.number} stearsa`,
  });
  await order.deleteOne();
  return ok({ deleted: true });
}
