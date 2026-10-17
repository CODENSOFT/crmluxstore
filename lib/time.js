// Calcule de date in fusul orar al magazinului (Chisinau), indiferent de fusul serverului (UTC pe Vercel)
export const TZ = "Europe/Chisinau";

export function tzOffsetMinutes(d = new Date()) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local - utc) / 60000);
}

// "YYYY-MM-DD" in fusul magazinului
export function ymd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Inceputul zilei locale pentru "YYYY-MM-DD" (sau Date)
export function startOfDay(input = new Date()) {
  const day = typeof input === "string" ? input : ymd(input);
  const guess = new Date(`${day}T00:00:00Z`);
  const off = tzOffsetMinutes(guess);
  const candidate = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(candidate);
  return off2 === off ? candidate : new Date(guess.getTime() - off2 * 60000);
}

export function endOfDay(input = new Date()) {
  return new Date(startOfDay(input).getTime() + 86400000 - 1);
}

export function startOfMonth(d = new Date()) {
  return startOfDay(ymd(d).slice(0, 8) + "01");
}

export function addDays(d, n) {
  return startOfDay(ymd(new Date(d.getTime() + n * 86400000 + 12 * 3600000)));
}

export function addMonths(d, n) {
  const [y, m] = ymd(d).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return startOfDay(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`);
}
