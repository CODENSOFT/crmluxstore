// Reducerea pe produs (promotie): procent 0–100, cu perioada optionala „de la” / „pana la” — zile intregi,
// in fusul magazinului. Aceeasi regula in CRM, comenzi, API, site si botul Telegram:
//   - nu se cumuleaza cu reducerea clientului: se aplica cea mai mare dintre ele;
//   - nu se aplica peste pretul individual al clientului (e deja pretul final negociat)
//     si nici peste un pret dat explicit pe linie (ex. comenzile de pe site vin cu pretul lor).
import { ymd } from "./format";

/** Procentul de reducere valabil in ziua data (implicit azi); 0 daca nu exista sau e in afara perioadei. */
export function activeDiscount(p, day = ymd()) {
  const pct = Math.min(100, Number(p?.discount) || 0);
  if (!(pct > 0)) return 0;
  if (p.discountFrom && day < String(p.discountFrom).slice(0, 10)) return 0;
  if (p.discountTo && day > String(p.discountTo).slice(0, 10)) return 0;
  return pct;
}

/** Pretul dupa reducere, rotunjit la bani. */
export const discountedPrice = (price, pct) => Math.round((Number(price) || 0) * (100 - (Number(pct) || 0))) / 100;
