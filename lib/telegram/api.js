// Client minimal pentru Telegram Bot API (fara biblioteci externe).
// TELEGRAM_API_URL permite un server de test local; implicit api.telegram.org.
const BASE = () => (process.env.TELEGRAM_API_URL || "https://api.telegram.org").replace(/\/+$/, "");

export class TelegramError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function parse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    throw new TelegramError(`Telegram a răspuns cu HTTP ${res.status}`, res.status);
  }
  if (!body.ok) throw new TelegramError(body.description || "Eroare Telegram", body.error_code);
  return body.result;
}

/** Apel JSON: tg(token, "sendMessage", { chat_id, text }) */
export async function tg(token, method, payload = {}) {
  if (!token) throw new TelegramError("Botul Telegram nu este configurat (lipsește tokenul)");
  const res = await fetch(`${BASE()}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  return parse(res);
}

/** Trimite o fotografie din memorie (data URL din CRM) ca fisier */
export async function tgUploadPhoto(token, payload, { buffer, mime }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const ext = (mime || "image/jpeg").split("/")[1] || "jpg";
  fd.append("photo", new Blob([buffer], { type: mime || "image/jpeg" }), `produs.${ext}`);
  const res = await fetch(`${BASE()}/bot${token}/sendPhoto`, { method: "POST", body: fd, signal: AbortSignal.timeout(30000) });
  return parse(res);
}

// Escape pentru parse_mode HTML
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
