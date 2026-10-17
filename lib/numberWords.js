// Suma in litere (romana), pentru documente: 1250.50 -> "o mie două sute cincizeci de lei și cincizeci de bani"
const U_M = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const U_F = ["zero", "una", "două", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const TEENS = ["zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece"];
const TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci", "șaizeci", "șaptezeci", "optzeci", "nouăzeci"];

function below100(n, f) {
  if (n < 10) return (f ? U_F : U_M)[n];
  if (n < 20) return f && n === 12 ? "douăsprezece" : TEENS[n - 10];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return TENS[t] + (u ? ` și ${(f ? U_F : U_M)[u]}` : "");
}

function below1000(n, f) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s = h === 1 ? "o sută" : `${h === 2 ? "două" : U_M[h]} sute`;
  if (r) s += (s ? " " : "") + below100(r, f);
  return s;
}

// "de" apare dupa numerele care se termina in 00 sau in 20–99 (ex: "douăzeci de lei", "o sută de lei")
export const needsDe = (n) => (n % 100 === 0 ? n >= 100 : n % 100 >= 20);

function group(n, one, many) {
  if (n === 1) return one;
  return `${below1000(n, true)}${needsDe(n) ? " de" : ""} ${many}`;
}

export function numberToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const parts = [];
  const mil = Math.floor(n / 1e6);
  const th = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (mil) parts.push(group(mil, "un milion", "milioane"));
  if (th) parts.push(group(th, "o mie", "mii"));
  if (rest) parts.push(below1000(rest, false));
  return parts.join(" ");
}

export function amountInWords(amount, currency = "MDL") {
  const v = Math.round(Math.abs(Number(amount) || 0) * 100);
  const lei = Math.floor(v / 100);
  const bani = v % 100;
  if (currency !== "MDL") return `${numberToWords(lei)} ${currency}${bani ? ` ${bani}/100` : ""}`;
  const leiW = lei === 1 ? "un leu" : `${numberToWords(lei)}${needsDe(lei) ? " de" : ""} lei`;
  if (!bani) return leiW;
  const baniW = bani === 1 ? "un ban" : `${numberToWords(bani)}${needsDe(bani) ? " de" : ""} bani`;
  return `${leiW} și ${baniW}`;
}
