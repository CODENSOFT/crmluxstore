"use client";

// Wrapper fetch pentru API-ul intern. Arunca eroare cu mesajul din server.
export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  } catch {
    throw new Error("Nu există conexiune la server. Verificați internetul.");
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* raspuns fara corp */
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok || (json && json.ok === false)) {
    const err = new Error(json?.error || `Eroare ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json?.data;
}

export const apiGet = api;
export const apiPost = (p, body) => api(p, { method: "POST", body: JSON.stringify(body ?? {}) });
export const apiPatch = (p, body) => api(p, { method: "PATCH", body: JSON.stringify(body ?? {}) });
export const apiPut = (p, body) => api(p, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const apiDelete = (p) => api(p, { method: "DELETE" });

export { money, formatDate, formatDateTime } from "./format";
export { UNIT_LABELS } from "./constants";
