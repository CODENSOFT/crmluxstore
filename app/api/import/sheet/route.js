import { route, badRequest } from "@/lib/api";
import { parseCSV } from "@/lib/csvParse";

export const maxDuration = 60;

const cell = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(Math.round(v * 10000) / 10000);
  if (typeof v === "boolean") return v ? "da" : "nu";
  return String(v).trim();
};

// Citeste un fisier Excel (.xlsx) sau CSV si intoarce randurile ca text (prima foaie de lucru).
// Interfata recunoaste apoi coloanele (Denumire, SKU, Pret...) si arata previzualizarea.
export const POST = route(async ({ req }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Alegeți un fișier Excel (.xlsx) sau CSV");
  if (file.size > 4 * 1024 * 1024) throw badRequest("Fișierul este prea mare (maxim 4 MB). Împărțiți-l în mai multe fișiere.");
  const name = file.name || "";
  const buf = Buffer.from(await file.arrayBuffer());
  let rows;
  if (/\.xls$/i.test(name)) throw badRequest("Formatul vechi .xls nu este suportat. În Excel: Fișier → Salvare ca → „Registru de lucru Excel (.xlsx)”.");
  if (/\.xlsx$/i.test(name) || buf.subarray(0, 2).toString() === "PK") {
    const { readSheet } = await import("read-excel-file/node");
    try {
      rows = (await readSheet(buf)).map((r) => r.map(cell));
    } catch (e) {
      throw badRequest(`Fișierul Excel nu a putut fi citit: ${e.message}`);
    }
  } else {
    rows = parseCSV(buf.toString("utf8"));
  }
  rows = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!rows.length) throw badRequest("Fișierul este gol");
  return { rows, name };
});
