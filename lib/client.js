"use client";

// Wrapper fetch pentru API-ul intern. Arunca eroare cu mesajul din server.
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* raspuns fara corp */
  }
  if (!res.ok || (json && json.ok === false)) {
    throw new Error(json?.error || `Eroare ${res.status}`);
  }
  return json?.data;
}

export const apiGet = (p) => api(p);
export const apiPost = (p, body) =>
  api(p, { method: "POST", body: JSON.stringify(body) });
export const apiPatch = (p, body) =>
  api(p, { method: "PATCH", body: JSON.stringify(body) });
export const apiPut = (p, body) =>
  api(p, { method: "PUT", body: JSON.stringify(body) });
export const apiDelete = (p) => api(p, { method: "DELETE" });

// Formateaza moneda
export function money(n, currency = "MDL") {
  const v = Number(n || 0);
  return `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const UNIT_LABELS = {
  bucata: "buc.",
  kg: "kg",
  litri: "litri",
  metru: "metru",
};
