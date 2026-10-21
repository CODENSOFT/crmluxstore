import { db, idOf, isUuid } from "./db";
export const AUDIT_LABELS = {
  created: "A creat comanda",
  edited: "A editat comanda",
  edit_requested: "A cerut modificarea comenzii",
  edit_approved: "A aprobat modificarea",
  edit_rejected: "A respins modificarea",
  approved: "A aprobat comanda",
  rejected: "A respins comanda",
  cancelled: "A anulat comanda",
  stage_changed: "A schimbat stadiul comenzii",
  payment_added: "A înregistrat o plată",
  payment_removed: "A șters o plată",
  deleted: "A șters comanda",
  imported: "Comandă importată",
  product_created: "A adăugat produs",
  product_edited: "A modificat produs",
  product_deleted: "A șters produs",
  products_imported: "A importat produse",
  stock_adjusted: "A corectat stocul",
  arrival: "A înregistrat recepție",
  transfer: "A făcut transfer",
  writeoff: "A casat stoc",
  inventory_completed: "A finalizat inventarierea",
  warehouse_created: "A creat depozit",
  warehouse_edited: "A modificat depozit",
  warehouse_deleted: "A șters depozit",
  customer_created: "A adăugat client",
  customer_edited: "A modificat client",
  customer_deleted: "A șters client",
  supplier_created: "A adăugat furnizor",
  supplier_edited: "A modificat furnizor",
  supplier_deleted: "A șters furnizor",
  user_created: "A creat utilizator",
  user_edited: "A modificat utilizator",
  user_deleted: "A șters utilizator",
  settings_saved: "A salvat setările",
  apikey_created: "A creat cheie API",
  apikey_revoked: "A revocat cheie API",
  webhook_saved: "A configurat webhook",
  integration_sync: "Sincronizare integrare",
  login: "Autentificare",
};

export const AUDIT_CATEGORY = {
  order: "Comenzi",
  product: "Produse",
  stock: "Stoc",
  warehouse: "Depozite",
  customer: "Clienți",
  supplier: "Furnizori",
  user: "Utilizatori",
  integration: "Integrări",
  settings: "Setări",
};

// Cronologia comenzilor: se pastreaza doar actiunile legate de o comanda (creata, aprobata, platita...).
// Actiunile generale ale utilizatorilor nu se mai inregistreaza (fara „istoric de activitate”).
// Nu blocheaza fluxul daca esueaza.
export async function logAudit({ action, category, entity, entityName, order, user, details }) {
  if (!order) return;
  try {
    const entityId = idOf(entity) || idOf(order);
    const orderId = idOf(order);
    const userId = user?.id || idOf(user);
    await db()`
      insert into audit_logs ${db()({
        action,
        category: category || (order ? "order" : null),
        entityId: isUuid(entityId) ? entityId : null,
        entityName: entityName || order?.number || null,
        orderId: isUuid(orderId) ? orderId : null,
        orderNumber: order?.number || null,
        userId: isUuid(userId) ? userId : null,
        userName: user?.name || null,
        userRole: user?.role || null,
        details: details || null,
      })}`;
  } catch {
    /* istoricul este optional */
  }
}
