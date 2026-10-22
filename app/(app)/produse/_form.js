"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/client";
import { invalidate, useApi } from "@/lib/useApi";
import { UNITS, UNIT_NAMES } from "@/lib/constants";
import { money, pct } from "@/lib/format";
import { Button, Field, FormSection, Input, NumberInput, Select, Textarea, Switch, IconButton, Badge } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { ProductPicker } from "@/app/_components/pickers";
import { GalleryEditor } from "./_gallery";
import { ImageIcon, Trash, Tag, Coins, Warehouse, Cube, PlugsConnected } from "@/app/_components/icons";

const EMPTY = {
  name: "",
  sku: "",
  barcode: "",
  category: "",
  brand: "",
  packaging: "",
  unit: "bucata",
  price: "",
  wholesalePrice: "",
  costPrice: "",
  vatRate: "",
  minStock: "",
  description: "",
  photos: [],
  active: true,
  isComposite: false,
  components: [],
  externalId: "",
};

function initialForm(product) {
  if (!product) return EMPTY;
  return {
    ...EMPTY,
    ...Object.fromEntries(Object.entries(product).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ""])),
    category: product.category?._id || product.category || "",
    price: product.price != null ? String(product.price) : "",
    wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : "",
    costPrice: product.costPrice != null ? String(product.costPrice) : "",
    vatRate: product.vatRate != null ? String(product.vatRate) : "",
    minStock: product.minStock != null ? String(product.minStock) : "",
    active: product.active !== false,
    photos: product.photos?.length ? product.photos : product.photo ? [product.photo] : [],
    components: (product.components || []).map((c) => ({ product: c.product?._id || c.product, name: c.productName || c.product?.name, quantity: String(c.quantity) })),
  };
}

/** Pagina „Produs nou” / „Editare produs” (product = produsul editat) */
export function ProductForm({ product }) {
  const toast = useToast();
  const router = useRouter();
  const backHref = product ? `/produse/${product._id}` : "/produse";
  const onClose = () => router.push(backHref);
  const { data: categories } = useApi("/api/categories");
  const { data: warehouses } = useApi("/api/warehouses");
  const { data: all } = useApi("/api/products?light=1");
  const { data: settings } = useApi("/api/settings");
  const [f, setF] = useState(() => initialForm(product));
  // stoc initial: null = inca neatins -> o linie pe depozitul implicit
  const [initialState, setInitial] = useState(null);
  const defWh = warehouses?.length ? (warehouses.find((w) => w.isDefault) || warehouses[0])._id : "";
  const initial = initialState ?? (defWh ? [{ warehouse: defWh, quantity: "" }] : []);
  const [saving, setSaving] = useState(false);

  const set = (p) => setF((x) => ({ ...x, ...p }));
  const missing = [!f.name.trim() && "Denumire", String(f.price).trim() === "" && "Preț cu amănuntul"].filter(Boolean);
  const price = Number(f.price) || 0;
  const cost = Number(f.costPrice) || 0;
  const wholesale = Number(f.wholesalePrice) || 0;
  const vat = settings?.vatPayer === false ? 0 : f.vatRate !== "" ? Number(f.vatRate) : settings?.vatRate ?? 20;
  // marja calculata pe pret fara TVA (pretul de vanzare include TVA)
  const net = (p) => (settings?.pricesIncludeVat !== false ? p / (1 + vat / 100) : p);
  const margin = (p) => (p > 0 && cost > 0 ? ((net(p) - cost) / net(p)) * 100 : null);

  const pickable = useMemo(() => (all || []).filter((p) => String(p._id) !== String(product?._id)), [all, product]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        ...f,
        photo: undefined,
        category: f.category || null,
        components: f.isComposite ? f.components.filter((c) => c.product).map((c) => ({ product: c.product, quantity: Number(c.quantity) || 1 })) : [],
      };
      if (!product) body.initialStock = initial.filter((r) => r.warehouse && Number(r.quantity) > 0).map((r) => ({ warehouse: r.warehouse, quantity: Number(r.quantity) }));
      const res = product ? await apiPatch(`/api/products/${product._id}`, body) : await apiPost("/api/products", body);
      toast(product ? "Produsul a fost actualizat" : `Produsul „${res.name}” a fost adăugat`);
      invalidate("/api/products", "/api/stock", "/api/categories", "/api/search", "/api/dashboard");
      router.push(`/produse/${res._id}`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormPage
      back={{ href: backHref, label: product ? product.name : "Produse" }}
      title={product ? "Editare produs" : "Produs nou"}
      description={product ? "Modificați datele și salvați. Stocul se schimbă doar prin recepții, vânzări și inventariere." : "Completați denumirea și prețul — restul e opțional. Prețurile se introduc cu TVA inclus, cum apar pe site și în magazin."}
      missing={missing}
      onSubmit={() => !missing.length && !saving && save()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" size="lg" loading={saving} disabled={missing.length > 0} onClick={save}>
            {product ? "Salvează" : "Adaugă produsul"}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={ImageIcon} title="Fotografii" description="Prima fotografie este cea principală: apare în listă, în comenzi, pe site și în botul Telegram. Ordinea se poate schimba oricând.">
          <GalleryEditor photos={f.photos} onChange={(photos) => set({ photos })} />
        </FormSection>

        <FormSection icon={Tag} title="Informații de bază" description="Denumirea și codurile după care produsul se caută la vânzare, se scanează și se leagă de site / 1C.">
          <Field label="Denumire" required>
            <Input focusFirst={!product} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex: Koch-Chemie Green Star 11 kg" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cod articol (SKU)">
              <Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} placeholder="KC-GS-11" />
            </Field>
            <Field label="Cod de bare (EAN)">
              <Input value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} inputMode="numeric" />
            </Field>
            <Field label="Unitate de măsură">
              <Select value={f.unit} onChange={(e) => set({ unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_NAMES[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Categorie">
              <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">Fără categorie</option>
                {(categories || []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Marcă / producător">
              <Input value={f.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Koch-Chemie, FOX LINE, RUPES…" list="brands" />
            </Field>
            <Field label="Ambalaj">
              <Input value={f.packaging} onChange={(e) => set({ packaging: e.target.value })} placeholder="Canistră 20 L" />
            </Field>
          </div>
          <Field label="Descriere">
            <Textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Utilizare, diluție recomandată, compatibilitate cu echipamentele…" />
          </Field>
        </FormSection>

        <FormSection icon={Coins} title="Prețuri și stoc minim" description="Prețurile de vânzare includ TVA. Marja se calculează automat față de prețul de achiziție.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Preț cu amănuntul" required hint={margin(price) != null ? `Marjă ${pct(margin(price))}` : "cu TVA"}>
              <NumberInput value={f.price} onChange={(v) => set({ price: v })} placeholder="0,00" suffix="MDL" />
            </Field>
            <Field label="Preț angro" hint={margin(wholesale) != null ? `Marjă ${pct(margin(wholesale))}` : "pentru clienții B2B"}>
              <NumberInput value={f.wholesalePrice} onChange={(v) => set({ wholesalePrice: v })} placeholder="—" suffix="MDL" />
            </Field>
            <Field label="Preț de achiziție" hint="fără TVA; se actualizează la recepție">
              <NumberInput value={f.costPrice} onChange={(v) => set({ costPrice: v })} placeholder="—" suffix="MDL" />
            </Field>
            <Field label="Cotă TVA" hint={`gol = ${settings?.vatRate ?? 20}% (implicit)`}>
              <NumberInput value={f.vatRate} onChange={(v) => set({ vatRate: v })} placeholder={String(settings?.vatRate ?? 20)} suffix="%" />
            </Field>
            <Field label="Stoc minim" hint={`gol = ${settings?.lowStockThreshold ?? 5} (prag global)`}>
              <NumberInput value={f.minStock} onChange={(v) => set({ minStock: v })} placeholder={String(settings?.lowStockThreshold ?? 5)} />
            </Field>
          </div>
          {price > 0 && cost > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-ok-soft px-2.5 py-1.5 text-[12.5px] text-ok">
                Profit pe unitate (amănunt, fără TVA): <span className="tnum font-semibold">{money(net(price) - cost)}</span>
              </span>
              {margin(price) != null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-fg-2">
                  Marjă amănunt <span className="tnum font-semibold text-fg">{pct(margin(price))}</span>
                </span>
              )}
            </div>
          )}
        </FormSection>

        {!product && (
          <FormSection
            icon={Warehouse}
            title="Stoc inițial"
            description="Cantitatea existentă acum în depozit. Ulterior stocul se modifică doar prin documente, cu istoric."
            aside={
              warehouses?.length > 1 && (
                <button type="button" className="text-[12.5px] font-medium text-accent hover:underline" onClick={() => setInitial([...initial, { warehouse: "", quantity: "" }])}>
                  + alt depozit
                </button>
              )
            }
          >
            {initial.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_140px_36px] gap-2">
                <Select value={r.warehouse} onChange={(e) => setInitial(initial.map((y, j) => (j === i ? { ...y, warehouse: e.target.value } : y)))}>
                  <option value="">Alegeți depozitul</option>
                  {(warehouses || []).map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
                <NumberInput value={r.quantity} onChange={(v) => setInitial(initial.map((y, j) => (j === i ? { ...y, quantity: v } : y)))} placeholder="0" />
                <IconButton icon={Trash} label="Elimină" size="md" variant="danger-ghost" onClick={() => setInitial(initial.filter((_, j) => j !== i))} />
              </div>
            ))}
          </FormSection>
        )}

        <FormSection icon={Cube} title="Set / kit" description="Pentru seturi formate din mai multe produse (ex: kit de îngrijire interior).">
          <Switch
            checked={f.isComposite}
            onChange={(v) => set({ isComposite: v })}
            label="Produsul este un set format din alte produse"
            description="ex: „Set îngrijire interior” = soluție + lavetă + perie. Setul are stoc propriu."
          />
          {f.isComposite && (
            <div className="space-y-2 rounded-xl border border-line p-3">
              {f.components.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.name}</span>
                  <NumberInput
                    value={c.quantity}
                    onChange={(v) => set({ components: f.components.map((x, j) => (j === i ? { ...x, quantity: v } : x)) })}
                    className="w-20 text-right"
                    aria-label="Cantitate în set"
                  />
                  <IconButton icon={Trash} label="Elimină" size="sm" variant="danger-ghost" onClick={() => set({ components: f.components.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <ProductPicker
                products={pickable}
                placeholder="Adaugă un produs în set…"
                onSelect={(p) => {
                  if (f.components.some((c) => String(c.product) === String(p._id))) return;
                  set({ components: [...f.components, { product: p._id, name: p.name, quantity: "1" }] });
                }}
              />
            </div>
          )}
        </FormSection>

        <FormSection icon={PlugsConnected} title="Stare și integrări" description="Activare / dezactivare și legătura cu 1C și site-ul.">
          <Switch checked={f.active} onChange={(v) => set({ active: v })} label="Produs activ" description="Produsele inactive nu apar la comenzi noi, dar rămân în istoric." />
          <Field label="Cod în 1C (externalId)" hint="Se completează automat la sincronizarea cu 1C">
            <Input value={f.externalId} onChange={(e) => set({ externalId: e.target.value })} placeholder="—" />
          </Field>
          {product?.wooId && (
            <p className="text-[12.5px] text-fg-3">
              Legat de produsul de pe site: <Badge tone="accent">#{product.wooId}</Badge>
            </p>
          )}
        </FormSection>
      </div>
      <datalist id="brands">
        {[...new Set((all || []).map((p) => p.brand).filter(Boolean))].map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </FormPage>
  );
}
