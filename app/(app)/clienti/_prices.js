"use client";

// Produsele cumparate des de client + pretul individual pentru fiecare.
// Comenzile acestui client folosesc automat aceste preturi.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPut } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, num, pct } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { Card, CardHeader, Button, ButtonLink, NumberInput, IconButton, Badge, EmptyState, Skeleton, FormSection, cx } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { ProductPicker } from "@/app/_components/pickers";
import { Star, Trash, PencilSimple, Plus, Coins, Info, ArrowUp, ArrowDown } from "@/app/_components/icons";

const standardPrice = (row, priceType) =>
  priceType === "wholesale" && row.wholesalePrice > 0 ? row.wholesalePrice : row.retailPrice ?? row.price ?? 0;

export function CustomerPrices({ customer }) {
  const user = useUser();
  const { data, loading } = useApi(`/api/customers/${customer._id}/prices`);
  const manage = can(user, "customers.manage");
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Produse și prețuri individuale"
        icon={Star}
        description="Comenzile acestui client folosesc automat prețurile de aici."
        action={manage && (
          <ButtonLink href={`/clienti/${customer._id}/preturi`} size="sm" icon={data?.length ? PencilSimple : Plus}>
            {data?.length ? "Modifică" : "Adaugă produse"}
          </ButtonLink>
        )}
      />
      {loading && !data ? (
        <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
      ) : data?.length ? (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {data.map((r) => {
              const std = standardPrice(r, customer.priceType);
              const diff = std > 0 ? ((r.price - std) / std) * 100 : 0;
              return (
                <li key={r.product} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/produse/${r.product}`} className="block truncate text-[13.5px] font-medium text-fg hover:text-accent">{r.name}</Link>
                    <div className="truncate text-[12px] text-fg-3">
                      {[r.sku, `stoc ${num(r.totalStock)} ${UNIT_LABELS[r.unit] || r.unit}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-[13.5px] font-semibold text-fg">{money(r.price)}</div>
                    <div className="tnum text-[11.5px] text-fg-4">
                      standard {money(std)}
                      {Math.abs(diff) >= 0.5 && <span className={cx("ml-1 font-medium", diff < 0 ? "text-ok" : "text-warn")}>{diff > 0 ? "+" : ""}{pct(diff)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end border-t border-line bg-surface-2/40 px-5 py-2.5">
            <ButtonLink href={`/comenzi/nou?customer=${customer._id}`} size="sm" variant="primary" icon={Plus}>
              Comandă cu aceste produse
            </ButtonLink>
          </div>
        </>
      ) : (
        <EmptyState
          compact
          icon={Star}
          title="Niciun produs preferat"
          description={manage ? "Adăugați produsele pe care clientul le cumpără des și stabiliți prețul lui pentru fiecare." : "Administratorul poate stabili prețuri individuale pentru acest client."}
        />
      )}
    </Card>
  );
}

/** Pagina „Prețuri individuale” a clientului */
export function PricesEditor({ customer, rows }) {
  const toast = useToast();
  const router = useRouter();
  const onClose = () => router.push(`/clienti/${customer._id}`);
  const { data: products } = useApi("/api/products?light=1");
  const [items, setItems] = useState(() =>
    rows.map((r) => ({ product: r.product, name: r.name, sku: r.sku, unit: r.unit, retailPrice: r.retailPrice, wholesalePrice: r.wholesalePrice, costPrice: r.costPrice, price: String(r.price) }))
  );
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => setItems((xs) => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const add = (p) => {
    if (items.some((x) => String(x.product) === String(p._id))) return;
    const std = customer.priceType === "wholesale" && p.wholesalePrice > 0 ? p.wholesalePrice : p.price || 0;
    setItems((xs) => [...xs, { product: p._id, name: p.name, sku: p.sku, unit: p.unit, retailPrice: p.price, wholesalePrice: p.wholesalePrice, costPrice: p.costPrice, price: String(std) }]);
  };
  const invalid = items.some((x) => x.price === "" || !(Number(x.price) >= 0));
  const save = async () => {
    setBusy(true);
    try {
      await apiPut(`/api/customers/${customer._id}/prices`, { items: items.map((x) => ({ product: x.product, price: Number(x.price) })) });
      toast("Prețurile clientului au fost salvate");
      invalidate(`/api/customers/${customer._id}`);
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormPage
      back={{ href: `/clienti/${customer._id}`, label: customer.name }}
      title={`Prețuri individuale — ${customer.name}`}
      description={customer.priceType === "wholesale" ? "Prețul standard al clientului: angro" : "Prețul standard al clientului: cu amănuntul"}
      missing={invalid ? ["prețul la toate produsele"] : []}
      onSubmit={() => !invalid && !busy && save()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={invalid} onClick={save}>Salvează prețurile</Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={Plus} title="1. Alegeți produsele" description="Căutați după nume, cod sau scanați codul de bare. Produsele apar în ordinea de aici și la comenzi.">
          {!products ? <Skeleton className="h-9" /> : <ProductPicker products={products} priceType={customer.priceType} onSelect={add} placeholder="Adaugă un produs pe care clientul îl cumpără des…" autoFocus />}
        </FormSection>

        <FormSection icon={Coins} title="2. Stabiliți prețul" description="Scrieți prețul final pentru acest client (cu TVA). Reducerea generală a clientului nu se mai aplică peste el.">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-3">Încă nu ați adăugat produse.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="stack-sm w-full min-w-[620px] text-[13px]">
                <thead className="bg-surface-2/60 text-left text-[12px] text-fg-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Produs</th>
                    <th className="px-3 py-2 text-right font-medium">Preț standard</th>
                    <th className="w-[170px] px-3 py-2 text-right font-medium">Preț client</th>
                    <th className="px-3 py-2 text-right font-medium">Diferență</th>
                    <th className="w-[104px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((x, i) => {
                    const std = standardPrice(x, customer.priceType);
                    const price = Number(x.price);
                    const diff = std > 0 && x.price !== "" ? ((price - std) / std) * 100 : null;
                    const belowCost = x.costPrice > 0 && x.price !== "" && price < x.costPrice;
                    return (
                      <tr key={x.product}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-fg">{x.name}</div>
                          <div className="text-[12px] text-fg-3">{x.sku || "fără cod"}</div>
                        </td>
                        <td data-label="Preț standard" className="tnum px-3 py-2 text-right text-fg-3">{money(std)}</td>
                        <td data-label="Preț client" className="px-3 py-2">
                          <NumberInput value={x.price} onChange={(v) => set(i, { price: v })} suffix="MDL" className="text-right" aria-label={`Preț pentru ${x.name}`} />
                          {belowCost && <div className="mt-1 text-right text-[11.5px] font-medium text-bad">sub prețul de achiziție</div>}
                        </td>
                        <td data-label="Diferență" className={cx("tnum px-3 py-2 text-right font-medium", diff == null ? "text-fg-4" : diff < 0 ? "text-ok" : diff > 0 ? "text-warn" : "text-fg-3")}>
                          {diff == null ? "—" : `${diff > 0 ? "+" : ""}${pct(diff)}`}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-0.5">
                            <IconButton icon={ArrowUp} label="Mută mai sus" size="sm" onClick={() => move(i, -1)} disabled={i === 0} />
                            <IconButton icon={ArrowDown} label="Mută mai jos" size="sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} />
                            <IconButton icon={Trash} label="Elimină" size="sm" variant="danger-ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="flex items-start gap-2 text-[12.5px] text-fg-3">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>
              Exemplu: dacă Green Star costă standard <Badge>1.250 MDL</Badge> și scrieți <Badge tone="ok">1.150 MDL</Badge>, toate comenzile noi ale clientului vor avea 1.150 MDL.
            </span>
          </p>
        </FormSection>
      </div>
    </FormPage>
  );
}
