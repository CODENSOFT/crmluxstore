"use client";

const RETRY_STATUS = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wrapper fetch pentru API-ul intern. Arunca eroare cu mesajul din server.
// Citirile (GET) se reincearca automat de 2 ori la o retea instabila sau un server care tocmai porneste —
// utilizatorul nu mai vede „nu se pot citi datele” pentru o problema de o secunda. Salvarile nu se repeta.
export async function api(path, options = {}) {
  const canRetry = !options.method || options.method === "GET";
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
      if (!(canRetry && RETRY_STATUS.has(res.status) && attempt < 2)) break;
    } catch {
      if (!(canRetry && attempt < 2)) throw new Error("Nu există conexiune la server. Verificați internetul.");
    }
    await sleep(attempt === 0 ? 400 : 1200);
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
