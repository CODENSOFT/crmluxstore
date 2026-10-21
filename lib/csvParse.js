// Parser CSV tolerant (Excel RO foloseste ";" ca separator), cu ghilimele si BOM
export function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Coloane recunoscute (romana / engleza / rusa)
export const PRODUCT_COLUMNS = {
  name: ["denumire", "nume", "produs", "name", "title", "наименование", "товар"],
  sku: ["sku", "cod", "codprodus", "articol", "code", "артикул", "код"],
  barcode: ["codbare", "codulbare", "barcode", "ean", "штрихкод"],
  category: ["categorie", "category", "categoria", "категория"],
  brand: ["marca", "brand", "producator", "бренд"],
  packaging: ["ambalaj", "packaging", "volum", "упаковка"],
  unit: ["unitate", "um", "unit", "unitatedemasura", "едизм", "ед"],
  price: ["pret", "pretamanunt", "pretvanzare", "price", "retail", "цена"],
  wholesalePrice: ["pretangro", "angro", "wholesale", "wholesaleprice", "оптоваяцена", "опт"],
  costPrice: ["pretachizitie", "cost", "costprice", "pretintrare", "закупочнаяцена", "себестоимость"],
  minStock: ["stocminim", "minstock", "minim", "минимальныйостаток"],
  description: ["descriere", "description", "описание"],
  warehouse: ["depozit", "warehouse", "склад"],
  quantity: ["cantitate", "stoc", "quantity", "qty", "stock", "количество", "остаток"],
};

function headerMapping(headers) {
  const mapping = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(PRODUCT_COLUMNS)) {
      if (mapping[key] === undefined && aliases.includes(n)) mapping[key] = i;
    }
  });
  return mapping;
}

export function mapProductRows(rows) {
  if (rows.length < 2) return { mapped: [], headers: rows[0] || [], mapping: {} };
  // Antetul nu e mereu pe primul rand (fisierele din contabilitate au titlu, data etc. deasupra):
  // alegem, din primele 20 de randuri, randul care recunoaste cele mai multe coloane.
  let start = 0;
  let best = -1;
  rows.slice(0, 20).forEach((r, i) => {
    const n = Object.keys(headerMapping(r)).length;
    if (n > best) {
      best = n;
      start = i;
    }
  });
  rows = rows.slice(start);
  const headers = rows[0];
  const mapping = headerMapping(headers);
  const num = (v) => (v === undefined || v === "" ? undefined : String(v).replace(/\s/g, "").replace(",", "."));
  const mapped = rows.slice(1).map((r) => {
    const o = {};
    for (const [key, i] of Object.entries(mapping)) {
      let v = String(r[i] ?? "").trim();
      if (["price", "wholesalePrice", "costPrice", "minStock", "quantity"].includes(key)) v = num(v);
      if (v !== "" && v !== undefined) o[key] = v;
    }
    return o;
  });
  return { mapped: mapped.filter((o) => Object.keys(o).length), headers, mapping };
}
