"use client";

import { money, pct } from "@/lib/format";
import { activeDiscount, discountedPrice } from "@/lib/discount";
import { cx } from "./ui";

/**
 * Pretul produsului cu reducerea valabila azi (lib/discount.js): pretul nou, langa / sub el pretul vechi taiat si „−15%”.
 * price = pretul de baza afisat (implicit amanuntul; ex. angro pentru clientii angro). Fara reducere — doar pretul.
 * short = fara pretul vechi (doar „−15%”), pentru randuri inguste.
 */
export function DiscountPrice({ product, price = product?.price, stacked = false, short = false, align = "end", className }) {
  const d = activeDiscount(product);
  if (!d) return <span className={cx("tnum", className)}>{money(price)}</span>;
  const was = (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[11.5px] font-normal">
      {!short && <span className="tnum text-fg-3 line-through">{money(price)}</span>}
      <span className="font-semibold text-bad">−{pct(d, 2)}</span>
    </span>
  );
  return (
    <span
      className={cx(stacked ? "inline-flex flex-col leading-tight" : "inline-flex items-baseline gap-1.5 whitespace-nowrap", stacked && (align === "start" ? "items-start" : "items-end"), className)}
      title={`Reducere ${pct(d, 2)} față de ${money(price)}`}
    >
      <span className="tnum">{money(discountedPrice(price, d))}</span>
      {was}
    </span>
  );
}
