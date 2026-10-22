"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiPost, apiPatch } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, num } from "@/lib/format";
import { CHANNELS, PAYMENT_METHODS, UNIT_LABELS, CUSTOMER_SEGMENTS, segmentLabel } from "@/lib/constants";
import {
  Card, CardHeader, Button, Field, Input, NumberInput, Select, Textarea, Segmented, Badge, Alert, EmptyState, Skeleton, cx, IconButton, PageHeader,
} from "@/app/_components/ui";
import { Modal, useToast } from "@/app/_components/overlay";
import { CustomerPicker, ProductPicker, SelectedChip, stockIn } from "@/app/_components/pickers";
import { Buildings, User, Trash, Package, Warning, Barcode, UserCircle, Truck, Wallet, Note, Plus, Star, Check } from "@/app/_components/icons";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function defaultPrice(product, priceType) {
  if (!product) return 0;
  return priceType === "wholesale" && product.wholesalePrice > 0 ? product.wholesalePrice : product.price || 0;
}

/* ---------- Client nou (rapid) ---------- */
function QuickCustomer(props) {
  return props.open ? <QuickCustomerBody {...props} /> : null;
}

function QuickCustomerBody({ open, initialName, onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ type: "individual", name: initialName || "", phone: "", idno: "", segment: "retail", priceType: "retail", discount: "", city: "", address: "" }));
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async (force = false) => {
    setSaving(true);
    try {
      const c = await apiPost("/api/customers", { ...f, discount: Number(f.discount) || 0, force });
      toast(`Clientul „${c.name}” a fost adăugat`);
      invalidate("/api/customers");
      onCreated(c);
    } catch (e) {
      if (e.status === 409 && e.body?.duplicate) setDup(e.body.duplicate);
      else toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Client nou"
      description="Datele de bază — le puteți completa ulterior din fișa clientului."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" loading={saving} disabled={!f.name.trim()} onClick={() => save(false)}>
            Adaugă clientul
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={f.type}
          onChange={(v) => set({ type: v, segment: v === "company" ? "carwash" : "retail", priceType: v === "company" ? "wholesale" : "retail" })}
          options={[
            { value: "individual", label: "Persoană fizică", icon: User },
            { value: "company", label: "Companie", icon: Buildings },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f.type === "company" ? "Denumire companie" : "Nume și prenume"} required className="sm:col-span-2">
            <Input focusFirst="always" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.type === "company" ? "SRL AquaWash" : "Ion Popescu"} />
          </Field>
          <Field label="Telefon">
            <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+373 6x xxx xxx" inputMode="tel" />
          </Field>
          {f.type === "company" ? (
            <Field label="IDNO (cod fiscal)">
              <Input value={f.idno} onChange={(e) => set({ idno: e.target.value })} placeholder="1003600012345" inputMode="numeric" />
            </Field>
          ) : (
            <Field label="Oraș">
              <Input value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Chișinău" />
            </Field>
          )}
          <Field label="Segment">
            <Select value={f.segment} onChange={(e) => set({ segment: e.target.value })}>
              {CUSTOMER_SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tip preț">
            <Select value={f.priceType} onChange={(e) => set({ priceType: e.target.value })}>
              <option value="retail">Amănunt</option>
              <option value="wholesale">Angro</option>
            </Select>
          </Field>
          <Field label="Reducere implicită" hint="Se aplică automat pe fiecare produs">
            <NumberInput value={f.discount} onChange={(v) => set({ discount: v })} placeholder="0" suffix="%" />
          </Field>
          <Field label="Adresă livrare">
            <Input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="str., nr." />
          </Field>
        </div>
        {dup && (
          <Alert tone="warn" icon={Warning} title={`Există deja clientul „${dup.name}”`}>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onCreated({ _id: dup._id, name: dup.name, __reload: true })}>
                Folosește clientul existent
              </Button>
              <Button size="sm" variant="ghost" onClick={() => save(true)}>
                Creează oricum
              </Button>
            </div>
          </Alert>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Editorul de comanda ---------- */
export default function OrderEditor({ order, template }) {
  const router = useRouter();
  const toast = useToast();
  const user = useUser();
  // Aprobatorul (admin sau angajat cu drept) creeaza comenzi direct, fara aprobare
  const isAdmin = can(user, "orders.approve");
  const editing = !!order;
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const { data: settings } = useApi("/api/settings");
  const { data: users } = useApi(isAdmin ? "/api/users" : null);

  const source = order || template;
  const [customer, setCustomer] = useState(source?.customer && source.customer.name ? source.customer : null);
  const [walkIn, setWalkIn] = useState(!source?.customer && !!source?.customerName);
  const [walkName, setWalkName] = useState(source?.customer ? "" : source?.customerName || "");
  const [walkPhone, setWalkPhone] = useState(source?.customer ? "" : source?.customerPhone || "");
  const [lines, setLines] = useState(() =>
    (source?.items || []).map((it) => ({
      key: newKey(),
      productId: String(it.product?._id || it.product),
      fallback: { _id: String(it.product?._id || it.product), name: it.productName, unit: it.unit, sku: it.sku, price: it.unitPrice, stock: [] },
      warehouse: String(it.warehouse?._id || it.warehouse),
      quantity: String(it.quantity),
      unitPrice: editing ? String(it.unitPrice) : "",
      discount: String(it.discount || 0),
      discountTouched: true,
    }))
  );
  const [warehouseSel, setWarehouse] = useState("");
  const [channel, setChannel] = useState(order?.channel || "store");
  const [delivery, setDelivery] = useState({
    method: order?.delivery?.method || "pickup",
    cost: order ? String(order.delivery?.cost ?? "") : "",
    city: order?.delivery?.city || "",
    address: order?.delivery?.address || "",
    recipient: order?.delivery?.recipient || "",
    phone: order?.delivery?.phone || "",
  });
  const [paymentMethod, setPaymentMethod] = useState(order?.paymentMethod || "cash");
  const [paidNow, setPaidNow] = useState("");
  const [note, setNote] = useState(order?.note || "");
  const [internalNote, setInternalNote] = useState(order?.internalNote || "");
  const [responsible, setResponsible] = useState(order ? String(order.responsible?._id || order.responsible || "") : user.id);
  const [initialStatus, setInitialStatus] = useState("processing");
  const [saving, setSaving] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(null);
  const productInput = useRef(null);

  const productById = useMemo(() => new Map((products || []).map((p) => [String(p._id), p])), [products]);
  const priceType = customer?.priceType || "retail";
  const custDiscount = Number(customer?.discount) || 0;
  // Preturile individuale ale clientului (produsele lui preferate)
  const { data: custPrices } = useApi(!walkIn && customer?._id ? `/api/customers/${customer._id}/prices` : null);
  const special = useMemo(() => new Map((custPrices || []).map((r) => [String(r.product), r.price])), [custPrices]);
  const allowPriceEdit = isAdmin || !!settings?.requireApproval;

  // Depozitul implicit (pana cand utilizatorul alege altul)
  const defaultWh = useMemo(() => {
    if (!warehouses?.length) return "";
    const def = settings?.defaultWarehouse && warehouses.find((w) => String(w._id) === String(settings.defaultWarehouse));
    return String((def || warehouses.find((w) => w.isDefault) || warehouses[0])._id);
  }, [warehouses, settings]);
  const warehouse = warehouseSel || defaultWh;

  // Alegerea clientului: reducerea lui pe liniile neatinse manual + adresa de livrare
  const selectCustomer = (c) => {
    setCustomer(c);
    const disc = String(Number(c?.discount) || 0);
    setLines((ls) => ls.map((l) => (l.discountTouched ? l : { ...l, discount: disc })));
    if (c && !editing) setDelivery((d) => ({ ...d, city: d.city || c.city || "", address: d.address || c.address || "" }));
  };

  const methods = (settings?.deliveryMethods || []).filter((m) => m.active !== false || m.key === delivery.method);

  // Stoc deja rezervat de comanda editata (se adauga la disponibil)
  const reserved = useMemo(() => {
    const m = new Map();
    if (order?.stockApplied) for (const it of order.items) {
      const k = `${it.product?._id || it.product}|${it.warehouse?._id || it.warehouse}`;
      m.set(k, (m.get(k) || 0) + it.quantity);
    }
    return m;
  }, [order]);

  const rows = lines.map((l) => {
    const p = productById.get(l.productId) || l.fallback;
    const own = special.get(l.productId);
    const base = own ?? defaultPrice(p, priceType);
    const price = allowPriceEdit && l.unitPrice !== "" ? Number(l.unitPrice) || 0 : base;
    const qty = Number(l.quantity) || 0;
    // pretul individual este pretul final: fara reducerea generala a clientului (daca nu a fost pusa manual)
    const disc = own != null && !l.discountTouched ? 0 : Math.min(100, Math.max(0, Number(l.discount) || 0));
    return { ...l, p, base, price, qty, disc, special: own != null, total: r2(qty * price * (1 - disc / 100)) };
  });

  // Necesar total pe produs+depozit vs disponibil
  const need = new Map();
  for (const r of rows) {
    const k = `${r.productId}|${r.warehouse}`;
    need.set(k, (need.get(k) || 0) + r.qty);
  }
  const shortage = (r) => {
    const k = `${r.productId}|${r.warehouse}`;
    const avail = stockIn(r.p, r.warehouse) + (reserved.get(k) || 0);
    return need.get(k) > avail + 1e-9 ? avail : null;
  };

  const vatPayer = settings?.vatPayer !== false;
  const incl = settings?.pricesIncludeVat !== false;
  const std = settings?.vatRate ?? 20;
  const subtotal = r2(rows.reduce((s, r) => s + r.total, 0));
  const gross = r2(rows.reduce((s, r) => s + r.qty * r.price, 0));
  const deliveryCost = delivery.cost !== "" ? Number(delivery.cost) || 0 : methods.find((m) => m.key === delivery.method)?.cost || 0;
  let vat = 0;
  let total = subtotal + deliveryCost;
  if (vatPayer) {
    if (incl) vat = (subtotal * std) / (100 + std) + (deliveryCost * std) / (100 + std);
    else {
      vat = ((subtotal + deliveryCost) * std) / 100;
      total += vat;
    }
  }
  total = r2(total);

  const addProduct = (p) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === String(p._id) && l.warehouse === warehouse);
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      return [...ls, { key: newKey(), productId: String(p._id), warehouse, quantity: "1", unitPrice: "", discount: String(custDiscount), discountTouched: false }];
    });
  };
  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const managerFlow = !isAdmin && (!editing ? settings?.requireApproval : !["new", "pending_approval"].includes(order.status));
  const willConsume = editing ? order.stockApplied : isAdmin ? initialStatus === "processing" : !settings?.requireApproval;
  const blocking = willConsume && rows.some((r) => shortage(r) !== null);
  const canSave = rows.length > 0 && rows.every((r) => r.qty > 0) && !blocking;

  async function submit() {
    setSaving(true);
    const body = {
      customer: walkIn ? null : customer?._id || null,
      customerName: walkIn ? walkName : undefined,
      customerPhone: walkIn ? walkPhone : undefined,
      items: rows.map((r) => ({
        product: r.productId,
        warehouse: r.warehouse,
        quantity: r.qty,
        unitPrice: allowPriceEdit && r.unitPrice !== "" ? Number(r.unitPrice) : undefined,
        discount: r.disc,
      })),
      channel,
      delivery: { ...delivery, cost: delivery.cost === "" ? undefined : Number(delivery.cost) },
      paymentMethod,
      note,
      internalNote,
      responsible: isAdmin ? responsible : undefined,
    };
    try {
      let res;
      if (editing) {
        res = await apiPatch(`/api/orders/${order._id}`, { edit: body });
        toast(res.pendingEdit ? "Modificarea a fost trimisă spre aprobare" : "Comanda a fost actualizată");
      } else {
        const paid = Number(paidNow) || 0;
        res = await apiPost("/api/orders", {
          ...body,
          status: isAdmin ? initialStatus : undefined,
          payments: paid > 0 ? [{ amount: Math.min(paid, total), method: paymentMethod }] : [],
        });
        toast(res.status === "pending_approval" ? `Comanda ${res.number} a fost trimisă spre aprobare` : `Comanda ${res.number} a fost creată`);
      }
      invalidate("/api/orders", "/api/dashboard", "/api/products", "/api/me", "/api/customers", "/api/stock");
      router.push(`/comenzi/${res._id}`);
    } catch (e) {
      toast(e.message, "error");
      setSaving(false);
    }
  }

  const loadingData = !products || !warehouses || !settings;
  const submitLabel = editing
    ? managerFlow
      ? "Trimite modificarea spre aprobare"
      : "Salvează modificările"
    : managerFlow
      ? "Trimite spre aprobare"
      : isAdmin && initialStatus === "new"
        ? "Salvează ciorna"
        : "Creează comanda";

  return (
    <div className="animate-in pb-24 xl:pb-0">
      <PageHeader
        back={{ href: editing ? `/comenzi/${order._id}` : "/comenzi", label: editing ? `Comanda ${order.number}` : "Comenzi" }}
        title={editing ? `Editare ${order.number}` : "Comandă nouă"}
        description={
          editing
            ? managerFlow
              ? "Comanda este în lucru — modificările vor fi aplicate după aprobarea administratorului."
              : "Modificările de cantitate actualizează automat stocul."
            : "Alegeți clientul, adăugați produsele (merge și cu scanerul de coduri de bare) și confirmați."
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-4">
          {/* Client */}
          <Card>
            <CardHeader
              title="Client"
              icon={UserCircle}
              action={
                <button type="button" className="text-[12.5px] font-medium text-accent hover:underline" onClick={() => { setWalkIn((w) => !w); selectCustomer(null); }}>
                  {walkIn ? "Alege client din bază" : "Vânzare fără client înregistrat"}
                </button>
              }
            />
            <div className="px-5 pb-5">
              {walkIn ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nume cumpărător">
                    <Input value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="opțional" />
                  </Field>
                  <Field label="Telefon">
                    <Input value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} placeholder="opțional" inputMode="tel" />
                  </Field>
                </div>
              ) : customer ? (
                <SelectedChip
                  icon={customer.type === "company" ? Buildings : User}
                  title={customer.name}
                  subtitle={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{[customer.phone, customer.idno && `IDNO ${customer.idno}`, segmentLabel(customer.segment)].filter(Boolean).join(" · ")}</span>
                      {customer.priceType === "wholesale" && <Badge tone="accent">Preț angro</Badge>}
                      {custDiscount > 0 && <Badge tone="ok">−{custDiscount}%</Badge>}
                      {customer.paymentTermDays > 0 && <Badge>Termen {customer.paymentTermDays} zile</Badge>}
                    </span>
                  }
                  onClear={() => selectCustomer(null)}
                />
              ) : (
                <CustomerPicker
                  focusFirst={!editing}
                  onSelect={(c) => {
                    selectCustomer(c);
                    setTimeout(() => productInput.current?.focus(), 50);
                  }}
                  onCreate={(q) => setQuickCustomer(q || "")}
                />
              )}
            </div>
          </Card>

          {/* Produse */}
          <Card className="@container">
            <CardHeader
              title="Produse"
              icon={Package}
              description={priceType === "wholesale" ? "Se aplică prețurile angro ale clientului" : "Prețuri cu amănuntul"}
            />
            <div className="px-5 pb-4">
              {loadingData ? (
                <Skeleton className="h-9" />
              ) : (
                <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center">
                  <div className="min-w-0 flex-1">
                    <ProductPicker inputRef={productInput} products={products} warehouse={warehouse} priceType={priceType} onSelect={addProduct} />
                  </div>
                  {warehouses?.length > 1 && (
                    <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="@xl:w-[190px]" aria-label="Depozit pentru produsele adăugate">
                      {warehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          Depozit: {w.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              )}
              <p className="mt-1.5 flex items-center gap-1 text-[12px] text-fg-4">
                <Barcode size={14} /> Scanerul de coduri de bare funcționează direct în câmpul de căutare.
              </p>
              {custPrices?.length > 0 && (
                <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                    <Star size={14} weight="fill" className="text-accent" /> Produsele clientului — un clic adaugă produsul cu prețul lui
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {custPrices.map((r) => {
                      const p = productById.get(String(r.product));
                      const added = rows.some((x) => x.productId === String(r.product));
                      return (
                        <button
                          key={r.product}
                          type="button"
                          disabled={!p}
                          onClick={() => p && addProduct(p)}
                          className={cx(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors disabled:opacity-50",
                            added ? "border-accent bg-surface text-accent" : "border-line bg-surface text-fg-2 hover:border-accent hover:text-fg"
                          )}
                        >
                          {added ? <Check size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
                          <span className="max-w-[220px] truncate">{r.name}</span>
                          <span className="tnum font-semibold text-fg">{money(r.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="border-t border-line">
                <EmptyState compact icon={Package} title="Niciun produs adăugat" description="Căutați după denumire, cod (SKU) sau scanați codul de bare." />
              </div>
            ) : (
              <div className="border-t border-line">
                <div className="hidden grid-cols-[minmax(0,1fr)_84px_104px_72px_108px_32px] gap-3 bg-surface-2/60 px-5 py-2 text-[12px] font-medium text-fg-3 @2xl:grid">
                  <span>Produs</span>
                  <span className="text-right">Cantitate</span>
                  <span className="text-right">Preț unitar</span>
                  <span className="text-right">Reducere %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                <ul className="divide-y divide-line">
                  {rows.map((r) => {
                    const short = shortage(r);
                    const avail = stockIn(r.p, r.warehouse) + (reserved.get(`${r.productId}|${r.warehouse}`) || 0);
                    const lbl = "mb-1 block text-[11.5px] text-fg-3 @2xl:hidden";
                    return (
                      <li
                        key={r.key}
                        className="grid grid-cols-3 gap-x-3 gap-y-2 px-5 py-3 @2xl:grid-cols-[minmax(0,1fr)_84px_104px_72px_108px_32px] @2xl:items-center"
                      >
                        <div className="col-span-3 flex min-w-0 items-start gap-2 @2xl:col-span-1">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-medium text-fg" title={r.p?.name}>
                              {r.p?.name || "Produs"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-fg-3">
                              {r.p?.sku && <span>{r.p.sku}</span>}
                              {r.special && <Badge tone="accent">preț client</Badge>}
                              {warehouses?.length > 1 && (
                                <select
                                  value={r.warehouse}
                                  onChange={(e) => update(r.key, { warehouse: e.target.value })}
                                  className="max-w-[160px] cursor-pointer truncate rounded bg-transparent text-[12px] text-fg-3 underline decoration-dotted underline-offset-2 outline-none hover:text-fg"
                                  aria-label="Depozit"
                                >
                                  {warehouses.map((w) => (
                                    <option key={w._id} value={w._id}>
                                      {w.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <span className={cx("tnum", short !== null ? "font-medium text-bad" : avail <= 0 ? "text-warn" : "")}>
                                {short !== null ? `stoc insuficient (disponibil ${num(short)})` : `în stoc ${num(avail)} ${UNIT_LABELS[r.p?.unit] || ""}`}
                              </span>
                            </div>
                          </div>
                          <IconButton icon={Trash} label="Elimină linia" size="sm" variant="danger-ghost" onClick={() => remove(r.key)} className="@2xl:hidden" />
                        </div>
                        <label className="block" htmlFor={`ln-qty-${r.key}`}>
                          <span className={lbl}>Cantitate</span>
                          <NumberInput id={`ln-qty-${r.key}`} value={r.quantity} onChange={(v) => update(r.key, { quantity: v })} className="text-right" aria-label="Cantitate" invalid={!(r.qty > 0)} />
                        </label>
                        <label className="block" htmlFor={`ln-price-${r.key}`}>
                          <span className={lbl}>Preț unitar</span>
                          <NumberInput
                            id={`ln-price-${r.key}`}
                            value={r.unitPrice}
                            onChange={(v) => update(r.key, { unitPrice: v })}
                            placeholder={num(r.base, 2)}
                            disabled={!allowPriceEdit}
                            className="text-right"
                            aria-label="Preț unitar"
                            title={allowPriceEdit ? "Lăsați gol pentru prețul din catalog" : "Prețul este cel din catalog"}
                          />
                        </label>
                        <label className="block" htmlFor={`ln-disc-${r.key}`}>
                          <span className={lbl}>Reducere %</span>
                          <NumberInput id={`ln-disc-${r.key}`} value={r.discount} onChange={(v) => update(r.key, { discount: v, discountTouched: true })} className="text-right" aria-label="Reducere %" />
                        </label>
                        <div className="tnum col-span-3 flex items-baseline justify-end gap-2 text-right text-[13.5px] font-medium text-fg @2xl:col-span-1 @2xl:block">
                          {r.disc > 0 && <span className="text-[11.5px] font-normal text-fg-4 line-through @2xl:block">{money(r.qty * r.price)}</span>}
                          <span>{money(r.total)}</span>
                        </div>
                        <div className="hidden justify-end @2xl:flex">
                          <IconButton icon={Trash} label="Elimină linia" size="sm" variant="danger-ghost" onClick={() => remove(r.key)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>

          {/* Note */}
          <Card>
            <CardHeader title="Observații" icon={Note} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              <Field label="Pe factură / pentru client" hint="Apare pe documentele tipărite">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: livrare după ora 14:00" />
              </Field>
              <Field label="Notă internă" hint="Vizibilă doar echipei">
                <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="ex: sunați înainte de livrare" />
              </Field>
            </div>
          </Card>
        </div>

        {/* Coloana dreapta */}
        <div className="space-y-4 xl:sticky xl:top-[72px] xl:self-start">
          <Card>
            <CardHeader title="Livrare și plată" icon={Truck} />
            <div className="space-y-3 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canal">
                  <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    {CHANNELS.filter((c) => !["api", "1c"].includes(c.key) || c.key === channel).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Metodă plată">
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
                <Field label="Livrare">
                  <Select value={delivery.method} onChange={(e) => setDelivery((d) => ({ ...d, method: e.target.value, cost: "" }))}>
                    {methods.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cost">
                  <NumberInput
                    value={delivery.cost}
                    onChange={(v) => setDelivery((d) => ({ ...d, cost: v }))}
                    placeholder={String(methods.find((m) => m.key === delivery.method)?.cost ?? 0)}
                    className="text-right"
                  />
                </Field>
              </div>
              {delivery.method !== "pickup" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Oraș">
                    <Input value={delivery.city} onChange={(e) => setDelivery((d) => ({ ...d, city: e.target.value }))} placeholder="Chișinău" />
                  </Field>
                  <Field label="Telefon livrare">
                    <Input value={delivery.phone} onChange={(e) => setDelivery((d) => ({ ...d, phone: e.target.value }))} placeholder="opțional" />
                  </Field>
                  <Field label="Adresă" className="col-span-2">
                    <Input value={delivery.address} onChange={(e) => setDelivery((d) => ({ ...d, address: e.target.value }))} placeholder="Strada, nr., ap." />
                  </Field>
                </div>
              )}
              {!editing && (
                <Field
                  label="Achitat acum"
                  aside={
                    total > 0 && (
                      <button type="button" className="text-[12px] font-medium text-accent hover:underline" onClick={() => setPaidNow(String(total))}>
                        Integral
                      </button>
                    )
                  }
                  hint="Opțional — restul rămâne de încasat"
                >
                  <NumberInput value={paidNow} onChange={setPaidNow} placeholder="0,00" suffix="MDL" />
                </Field>
              )}
              {isAdmin && users && (
                <Field label="Responsabil">
                  <Select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                    {users
                      .filter((u) => u.active || String(u._id) === responsible)
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              {isAdmin && !editing && (
                <Field label="Status la salvare">
                  <Segmented
                    className="w-full [&>button]:flex-1 [&>button]:justify-center"
                    value={initialStatus}
                    onChange={setInitialStatus}
                    options={[
                      { value: "processing", label: "Confirmată", title: "Stocul se rezervă imediat" },
                      { value: "new", label: "Ciornă", title: "Fără rezervare de stoc" },
                    ]}
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="space-y-2 px-5 py-4 text-[13.5px]">
              <div className="flex justify-between text-fg-2">
                <span>Produse ({rows.length})</span>
                <span className="tnum">{money(gross)}</span>
              </div>
              {gross - subtotal > 0.004 && (
                <div className="flex justify-between text-ok">
                  <span>Reduceri</span>
                  <span className="tnum">−{money(gross - subtotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-fg-2">
                <span>Livrare</span>
                <span className="tnum">{deliveryCost ? money(deliveryCost) : "gratuit"}</span>
              </div>
              {vatPayer && (
                <div className="flex justify-between text-fg-3">
                  <span>TVA {std}% {incl ? "inclus" : ""}</span>
                  <span className="tnum">{money(vat)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-[14px] font-semibold text-fg">Total de plată</span>
                <span className="tnum text-[20px] font-semibold tracking-tight text-fg">{money(total)}</span>
              </div>
            </div>
            {blocking && (
              <div className="mx-5 mb-3">
                <Alert tone="bad" icon={Warning}>
                  Stoc insuficient pentru unele produse. Reduceți cantitatea, alegeți alt depozit sau salvați ca ciornă.
                </Alert>
              </div>
            )}
            {managerFlow && (
              <div className="mx-5 mb-3">
                <Alert tone="warn" icon={Wallet}>
                  Comanda va fi trimisă administratorului pentru aprobare.
                </Alert>
              </div>
            )}
            <div className="hidden border-t border-line bg-surface-2/50 px-5 py-3.5 xl:block">
              <Button variant="primary" size="lg" full loading={saving} disabled={!canSave} onClick={submit}>
                {submitLabel}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Bara fixa pe mobil */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-w,244px)] xl:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-fg-3">Total</div>
          <div className="tnum truncate text-[17px] font-semibold text-fg">{money(total)}</div>
        </div>
        <Button variant="primary" size="lg" loading={saving} disabled={!canSave} onClick={submit} icon={Plus}>
          {submitLabel}
        </Button>
      </div>

      <QuickCustomer
        open={quickCustomer !== null}
        initialName={quickCustomer}
        onClose={() => setQuickCustomer(null)}
        onCreated={async (c) => {
          setQuickCustomer(null);
          if (c.__reload) c = await api(`/api/customers/${c._id}`);
          selectCustomer(c);
          setTimeout(() => productInput.current?.focus(), 50);
        }}
      />
    </div>
  );
}
