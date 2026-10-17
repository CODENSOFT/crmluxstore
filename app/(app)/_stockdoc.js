"use client";

import { useMemo } from "react";
import { money, num } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { NumberInput, IconButton, EmptyState, cx } from "@/app/_components/ui";
import { ProductPicker, stockIn } from "@/app/_components/pickers";
import { Trash, Package } from "@/app/_components/icons";

let seq = 0;
export const lineKey = () => `d${++seq}`;

/**
 * Editor de linii pentru documentele de stoc.
 * lines: [{ key, product (obiect), quantity, unitCost? }]
 * withCost -> coloana pret de achizitie; checkStock -> avertizare daca depaseste stocul din `warehouse`
 */
export function DocLinesEditor({ lines, setLines, products, warehouse, withCost, checkStock, autoFocus }) {
  const byId = useMemo(() => new Map((products || []).map((p) => [String(p._id), p])), [products]);
  const add = (p) =>
    setLines((ls) => {
      const ex = ls.find((l) => String(l.product._id) === String(p._id));
      if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      return [...ls, { key: lineKey(), product: p, quantity: "1", unitCost: withCost && p.costPrice ? String(p.costPrice) : "" }];
    });
  const upd = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  return (
    <div className="@container">
      <div className="px-5 pb-4">
        <ProductPicker products={products} warehouse={warehouse} onSelect={add} autoFocus={autoFocus} />
      </div>
      {lines.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState compact icon={Package} title="Niciun produs" description="Căutați produsul sau scanați codul de bare." />
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {lines.map((l) => {
            const p = byId.get(String(l.product._id)) || l.product;
            const avail = stockIn(p, warehouse);
            const qty = Number(l.quantity) || 0;
            const over = checkStock && warehouse && qty > avail + 1e-9;
            return (
              <li key={l.key} className={cx("grid gap-x-3 gap-y-2 px-5 py-3 @xl:items-center", withCost ? "grid-cols-2 @xl:grid-cols-[minmax(0,1fr)_110px_120px_110px_32px]" : "grid-cols-[minmax(0,1fr)_110px_32px]")}>
                <div className={cx("min-w-0", withCost && "col-span-2 @xl:col-span-1")}>
                  <div className="truncate text-[13.5px] font-medium text-fg">{p.name}</div>
                  <div className="text-[12px] text-fg-3">
                    {p.sku ? `${p.sku} · ` : ""}
                    {warehouse ? (
                      <span className={cx("tnum", over ? "font-medium text-bad" : "")}>
                        {over ? `stoc insuficient (${num(avail)})` : `în depozit ${num(avail)} ${UNIT_LABELS[p.unit] || ""}`}
                      </span>
                    ) : (
                      UNIT_LABELS[p.unit]
                    )}
                  </div>
                </div>
                <label className="block">
                  {withCost && <span className="mb-1 block text-[11.5px] text-fg-3 @xl:hidden">Cantitate</span>}
                  <NumberInput value={l.quantity} onChange={(v) => upd(l.key, { quantity: v })} className="text-right" aria-label="Cantitate" invalid={!(qty > 0) || over} suffix={UNIT_LABELS[p.unit]} />
                </label>
                {withCost && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] text-fg-3 @xl:hidden">Preț achiziție</span>
                      <NumberInput value={l.unitCost} onChange={(v) => upd(l.key, { unitCost: v })} className="text-right" placeholder="0,00" aria-label="Preț de achiziție" />
                    </label>
                    <div className="tnum self-end text-right text-[13.5px] font-medium text-fg @xl:self-auto">{money(qty * (Number(l.unitCost) || 0))}</div>
                  </>
                )}
                <div className="flex justify-end self-end @xl:self-auto">
                  <IconButton icon={Trash} label="Elimină" size="sm" variant="danger-ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {withCost && lines.length > 0 && (
        <div className="flex items-center justify-between border-t border-line bg-surface-2/50 px-5 py-3 text-[13.5px]">
          <span className="text-fg-3">
            {lines.length} poziții · {num(lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0))} unități
          </span>
          <span>
            Total recepție <span className="tnum ml-2 text-[16px] font-semibold text-fg">{money(total)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function linesPayload(lines, withCost) {
  return lines.map((l) => ({
    product: l.product._id,
    quantity: Number(l.quantity),
    ...(withCost ? { unitCost: l.unitCost === "" ? undefined : Number(l.unitCost) } : {}),
  }));
}

export function linesValid(lines, { warehouse, checkStock, products } = {}) {
  if (!lines.length) return false;
  const byId = new Map((products || []).map((p) => [String(p._id), p]));
  return lines.every((l) => {
    const q = Number(l.quantity);
    if (!(q > 0)) return false;
    if (checkStock && warehouse) return q <= stockIn(byId.get(String(l.product._id)) || l.product, warehouse) + 1e-9;
    return true;
  });
}
