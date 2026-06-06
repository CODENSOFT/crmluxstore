import AuditLog from "@/models/AuditLog";

// Etichete prietenoase pentru actiuni (afisare in istoric)
export const AUDIT_LABELS = {
  created: "A creat comanda",
  edited: "A editat comanda",
  edit_requested: "A cerut modificarea comenzii",
  edit_approved: "A aprobat modificarea",
  edit_rejected: "A respins modificarea",
  approved: "A aprobat comanda",
  rejected: "A respins comanda",
  stage_changed: "A schimbat stadiul comenzii",
  deleted: "A sters comanda",
  product_created: "A adaugat produs",
  product_edited: "A modificat produs",
  product_deleted: "A sters produs",
  arrival: "A inregistrat receptie de marfa",
  transfer: "A facut transfer intre depozite",
  writeoff: "A anulat produs (spisanie)",
  warehouse_created: "A creat depozit",
  warehouse_deleted: "A sters depozit",
  user_created: "A creat utilizator",
  supplier_created: "A adaugat furnizor",
};

export const AUDIT_CATEGORY = {
  order: "Comenzi",
  product: "Produse",
  stock: "Stoc",
  warehouse: "Depozite",
  supplier: "Furnizori",
  user: "Utilizatori",
};

// Scrie o intrare in istoric. Nu blocheaza fluxul daca esueaza.
export async function logAudit({
  action,
  category,
  entity,
  entityName,
  order,
  user,
  details,
}) {
  try {
    await AuditLog.create({
      action,
      category: category || (order ? "order" : undefined),
      entityId: entity?._id || entity || order?._id,
      entityName: entityName || order?.number,
      order: order?._id || order,
      orderNumber: order?.number,
      user: user?.id || user?._id || user,
      userName: user?.name,
      userRole: user?.role,
      details,
    });
  } catch {
    /* istoricul este optional — ignoram erorile */
  }
}
