// Formatare (client + server), in romana
const TZ = "Europe/Chisinau";

export function money(n, currency = "MDL", { decimals = 2 } = {}) {
  const v = Number(n || 0);
  return `${v.toLocaleString("ro-RO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

// Suma compacta pentru carduri / axe: 12,9 mii · 1,2 mil.
export function moneyShort(n, currency = "MDL") {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} mil. ${currency}`;
  if (a >= 10_000) return `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} mii ${currency}`;
  return money(v, currency, { decimals: a % 1 ? 2 : 0 });
}

export function compact(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}M`;
  if (a >= 1000) return `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}K`;
  return v.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

export function num(n, max = 3) {
  return Number(n || 0).toLocaleString("ro-RO", { maximumFractionDigits: max });
}

export function pct(n, digits = 1) {
  return `${Number(n || 0).toLocaleString("ro-RO", { maximumFractionDigits: digits })}%`;
}

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ro-RO", { timeZone: TZ, day: "numeric", month: "short" });
}

export function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ro-RO", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

// "acum 5 min", "ieri", "acum 3 zile"
export function relativeTime(d) {
  if (!d) return "—";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 0) {
    const f = -diff;
    if (f < 3600) return `în ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `în ${Math.round(f / 3600)} h`;
    const days = Math.round(f / 86400);
    return days === 1 ? "mâine" : `în ${days} zile`;
  }
  if (diff < 60) return "chiar acum";
  if (diff < 3600) return `acum ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `acum ${Math.round(diff / 3600)} h`;
  const days = Math.round(diff / 86400);
  if (days === 1) return "ieri";
  if (days < 30) return `acum ${days} zile`;
  return formatDate(d);
}

// YYYY-MM-DD in fusul magazinului (pentru input type=date)
export function ymd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function plural(n, one, few, many) {
  const v = Math.abs(n);
  if (v === 1) return `${n} ${one}`;
  if (v === 0 || (v % 100 >= 1 && v % 100 <= 19)) return `${n} ${few}`;
  return `${n} ${many}`;
}
