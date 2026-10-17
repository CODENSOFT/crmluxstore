import { db } from "./db";

const PREFIX = {
  order: "CMD",
  customer: "CL",
  arrival: "REC",
  transfer: "TRF",
  writeoff: "ANL",
  inventory: "INV",
};
const PAD = { customer: 5 };

/** Urmatorul numar de document (atomic; in tranzactie, se anuleaza odata cu ea — fara goluri) */
export async function nextNumber(key, q = db()) {
  const [r] = await q`
    insert into counters (key, seq) values (${key}, 1)
    on conflict (key) do update set seq = counters.seq + 1
    returning seq`;
  return `${PREFIX[key]}-${String(r.seq).padStart(PAD[key] || 6, "0")}`;
}
