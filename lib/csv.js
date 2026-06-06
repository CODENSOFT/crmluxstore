import { NextResponse } from "next/server";

// Construieste un sir CSV dintr-un array de obiecte (cheile primului rand = antet)
export function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(","));
  }
  return lines.join("\r\n");
}

// Raspuns HTTP de descarcare CSV (cu BOM pentru diacritice corecte in Excel)
export function csvResponse(rows, filename) {
  const csv = "﻿" + toCSV(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
