import { db } from "./db";

export async function logIntegration(entry) {
  try {
    await db()`insert into integration_logs ${db()({
      source: entry.source || null,
      direction: entry.direction || null,
      action: entry.action || null,
      status: entry.status || "ok",
      message: entry.message ? String(entry.message).slice(0, 2000) : null,
      count: entry.count ?? null,
      ref: entry.ref || null,
      durationMs: entry.durationMs ?? null,
    })}`;
  } catch {
    /* jurnalul este optional */
  }
}
