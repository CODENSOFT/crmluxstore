"use client";

import { isAdminUser } from "@/lib/permissions";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiPost, apiPatch } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, moneyShort, num, pct, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { UNIT_LABELS, UNIT_NAMES, MOVEMENT_TYPES } from "@/lib/constants";
import { Card, CardHeader, PageHeader, Button, ButtonLink, Badge, Stat, DetailList, Skeleton, ErrorState, EmptyState, Field, NumberInput, Input, Select, cx } from "@/app/_components/ui";
import { Menu, Modal, useConfirm, useToast } from "@/app/_components/overlay";
import { Pagination } from "@/app/_components/table";
import {
  PencilSimple, DotsThree, TrayArrowDown, Stack, Coins, ChartLineUp, Clock, Warehouse, ClockCounterClockwise, Trash, Prohibit, CheckCircle, Sliders, Package, Globe, Info,
} from "@/app/_components/icons";
import { PublishModal } from "../_publish";
import { ProductGallery } from "../_gallery";

const REF_LINK = {
  Order: (id) => `/comenzi/${id}`,
  StockArrival: (id) => `/receptie/${id}`,
  InventoryCount: (id) => `/inventariere/${id}`,
};

function AdjustModal({ open, onClose, product, onDone }) {
  const toast = useToast();
  const [warehouse, setWarehouse] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: warehouses } = useApi(open ? "/api/warehouses" : null);
  const current = (product.stock || []).find((s) => String(s.warehouse?._id || s.warehouse) === warehouse)?.quantity || 0;
  const save = async () => {
    setBusy(true);
    try {
      const res = await apiPost(`/api/products/${product._id}/stock`, { warehouse, quantity: Number(qty), note });
      toast("Stocul a fost corectat");
      onDone(res);
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Corecție manuală de stoc"
      description="Pentru diferențe constatate. Pentru marfă nouă folosiți Recepția, pentru marfă deteriorată — Casarea."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" loading={busy} disabled={!warehouse || qty === ""} onClick={save}>
            Setează stocul
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Depozit">
          <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">Alegeți…</option>
            {(warehouses || []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cantitate reală" hint={warehouse ? `În sistem: ${num(current)} ${UNIT_LABELS[product.unit]}` : null}>
          <NumberInput value={qty} onChange={setQty} placeholder="0" suffix={UNIT_LABELS[product.unit]} />
        </Field>
        <Field label="Motiv">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: numărare la raft" />
        </Field>
      </div>
    </Modal>
  );
}

export default function ProductPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = isAdminUser(user);
  const manage = can(user, "products.manage");
  const canDelete = can(user, ["products.manage", "delete"]);
  const [page, setPage] = useState(1);
  const { data: p, error, reload, mutate } = useApi(`/api/products/${id}`, { keepPrevious: false });
  const { data: mov, reload: reloadMov } = useApi(`/api/products/${id}/movements?page=${page}&limit=20`);
  const [publishing, setPublishing] = useState(false);
  const [adjust, setAdjust] = useState(false);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!p) return <Skeleton className="h-96" />;

  const unit = UNIT_LABELS[p.unit] || "";
  const vat = 1 + (p.vatRate ?? 20) / 100;
  const margin = (price) => (price > 0 && p.costPrice > 0 ? ((price / vat - p.costPrice) / (price / vat)) * 100 : null);
  const maxStock = Math.max(1, ...(p.stock || []).map((s) => s.quantity));
  const daily = (p.stats?.qty30 || 0) / 30;
  const coverDays = daily > 0 ? Math.floor(p.totalStock / daily) : null;

  const toggleActive = async () => {
    try {
      const res = await apiPatch(`/api/products/${id}`, { active: p.active === false });
      mutate((x) => ({ ...x, active: res.active }));
      invalidate("/api/products");
      toast(res.active ? "Produsul a fost activat" : "Produsul a fost dezactivat");
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Ștergeți „${p.name}”?`, message: "Dacă produsul are vânzări sau mișcări de stoc, va fi doar dezactivat.", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      const r = await apiDelete(`/api/products/${id}`);
      toast(r.deactivated ? "Produsul are istoric — a fost dezactivat" : "Produsul a fost șters");
      invalidate("/api/products", "/api/stock");
      router.push("/produse");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/produse", label: "Produse" }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {p.name}
            {p.isComposite && <Badge tone="violet">Set</Badge>}
            {p.active === false && <Badge tone="bad">Inactiv</Badge>}
            {p.wooId ? <Badge tone="ok">Pe site</Badge> : <Badge>Nepublicat pe site</Badge>}
          </span>
        }
        description={[p.sku && `SKU ${p.sku}`, p.barcode && `EAN ${p.barcode}`, p.category?.name, p.brand, p.packaging].filter(Boolean).join(" · ") || "Fără cod"}
        actions={
          <>
            <ButtonLink href={`/receptie/nou?product=${p._id}`} icon={TrayArrowDown}>
              Recepție
            </ButtonLink>
            {manage && (
              <ButtonLink href={`/produse/${p._id}/editare`} variant="primary" icon={PencilSimple}>
                Editează
              </ButtonLink>
            )}
            {(manage || isAdmin) && (
            <Menu
              trigger={<Button icon={DotsThree} aria-label="Mai multe" />}
              items={[
                manage && { label: p.wooId ? "Actualizează pe site" : "Publică pe site", icon: Globe, onClick: () => setPublishing(true) },
                isAdmin && { label: "Corecție manuală de stoc", icon: Sliders, onClick: () => setAdjust(true) },
                manage && { label: p.active === false ? "Activează produsul" : "Dezactivează produsul", icon: p.active === false ? CheckCircle : Prohibit, onClick: toggleActive },
                canDelete && { divider: true },
                canDelete && { label: "Șterge produsul", icon: Trash, onClick: remove, danger: true },
              ]}
            />
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stoc total" icon={Stack} value={`${num(p.totalStock)} ${unit}`} sub={`valoare ${money(p.totalStock * (p.price || 0))}`} tone={p.totalStock <= (p.minStock ?? 5) ? "warn" : undefined} />
        <Stat label="Vândut în 30 de zile" icon={ChartLineUp} value={`${num(p.stats?.qty30)} ${unit}`} sub={coverDays !== null ? `stocul ajunge ~${coverDays} zile` : "fără vânzări recente"} />
        <Stat label="Vânzări 90 de zile" icon={Coins} value={moneyShort(p.stats?.revenue90)} sub={`${num(p.stats?.qty90)} ${unit} · ${p.stats?.orders90 || 0} comenzi`} />
        <Stat label="Ultima recepție" icon={Clock} value={p.stats?.lastArrivalAt ? relativeTime(p.stats.lastArrivalAt) : "—"} sub={p.stats?.lastArrivalAt ? formatDate(p.stats.lastArrivalAt) : "nicio recepție"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Stoc pe depozite" icon={Warehouse} description={`Prag minim: ${num(p.minStock ?? 5)} ${unit}`} action={isAdmin && <Button size="sm" variant="ghost" icon={Sliders} onClick={() => setAdjust(true)}>Corecție</Button>} />
            <div className="space-y-3 px-5 pb-5">
              {(p.stock || []).length === 0 && <p className="text-[13px] text-fg-3">Produsul nu are stoc în niciun depozit.</p>}
              {(p.stock || []).map((s) => (
                <div key={s.warehouse?._id || s.warehouse}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="text-fg-2">{s.warehouse?.name || "Depozit șters"}</span>
                    <span className={cx("tnum font-medium", s.quantity <= 0 ? "text-bad" : "text-fg")}>
                      {num(s.quantity)} {unit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(1, (s.quantity / maxStock) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Registrul de stoc" icon={ClockCounterClockwise} description="Fiecare intrare și ieșire, cu soldul după operațiune" />
            {mov?.items?.length ? (
              <>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-surface-2/60 text-left text-[12px] text-fg-3">
                        <th className="px-5 py-2 font-medium">Data</th>
                        <th className="px-3 py-2 font-medium">Operațiune</th>
                        <th className="px-3 py-2 font-medium">Depozit</th>
                        <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                        <th className="px-3 py-2 text-right font-medium">Sold</th>
                        <th className="px-5 py-2 font-medium">Document</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {mov.items.map((m) => {
                        const t = MOVEMENT_TYPES[m.type];
                        const href = m.refId && REF_LINK[m.refType]?.(m.refId);
                        return (
                          <tr key={m._id}>
                            <td className="whitespace-nowrap px-5 py-2.5 text-fg-3">{formatDateTime(m.createdAt)}</td>
                            <td className="px-3 py-2.5">
                              <Badge tone={t?.tone}>{t?.label || m.type}</Badge>
                            </td>
                            <td className="px-3 py-2.5 text-fg-2">{m.warehouse?.name || "—"}</td>
                            <td className={cx("tnum whitespace-nowrap px-3 py-2.5 text-right font-medium", m.quantity > 0 ? "text-ok" : "text-bad")}>
                              {m.quantity > 0 ? "+" : ""}
                              {num(m.quantity)}
                            </td>
                            <td className="tnum px-3 py-2.5 text-right text-fg-2">{m.balanceAfter != null ? num(m.balanceAfter) : "—"}</td>
                            <td className="px-5 py-2.5 text-[12.5px]">
                              {href ? (
                                <Link href={href} className="font-medium text-accent hover:underline">
                                  {m.refNumber || "deschide"}
                                </Link>
                              ) : (
                                <span className="text-fg-3">{m.refNumber || m.note || "—"}</span>
                              )}
                              {m.userName && <span className="ml-1.5 text-fg-4">· {m.userName}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} limit={20} total={mov.total} onChange={setPage} />
              </>
            ) : (
              <EmptyState compact icon={ClockCounterClockwise} title="Nicio mișcare de stoc" />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <ProductGallery product={p} onAdd={manage ? () => router.push(`/produse/${p._id}/editare`) : null} />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] text-fg-3">Preț cu amănuntul</span>
                <span className="tnum text-[20px] font-semibold tracking-tight text-fg">{money(p.price)}</span>
              </div>
              <DetailList
                items={[
                  ["Preț angro", p.wholesalePrice ? `${money(p.wholesalePrice)}${margin(p.wholesalePrice) != null ? ` · marjă ${pct(margin(p.wholesalePrice))}` : ""}` : "—"],
                  ["Preț de achiziție", p.costPrice ? `${money(p.costPrice)}${margin(p.price) != null ? ` · marjă amănunt ${pct(margin(p.price))}` : ""}` : "—"],
                  ["Cotă TVA", p.vatRate != null ? `${p.vatRate}%` : "implicită"],
                  ["Unitate", UNIT_NAMES[p.unit]],
                ]}
              />
            </div>
          </Card>

          {p.isComposite && (
            <Card>
              <CardHeader title="Componența setului" icon={Package} />
              <ul className="divide-y divide-line border-t border-line">
                {p.components.map((c) => (
                  <li key={c.product?._id || c.productName} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                    <Link href={`/produse/${c.product?._id}`} className="truncate text-fg hover:text-accent">
                      {c.product?.name || c.productName}
                    </Link>
                    <span className="tnum text-fg-3">× {num(c.quantity)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {p.description && (
            <Card>
              <CardHeader title="Descriere" icon={Info} />
              <p className="whitespace-pre-line px-5 pb-5 text-[13.5px] leading-relaxed text-fg-2">{p.description}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Integrări" icon={Globe} />
            <div className="px-5 pb-5">
              <DetailList
                items={[
                  ["Site luxstore.md", p.wooId ? `legat (#${p.wooId})` : "nelegat"],
                  ["Cod în 1C", p.externalId || "nesincronizat"],
                  ["Creat", formatDate(p.createdAt)],
                  ["Ultima modificare", formatDateTime(p.updatedAt)],
                ]}
              />
            </div>
          </Card>
        </div>
      </div>

      <PublishModal open={publishing} onClose={() => setPublishing(false)} ids={[p._id]} title={p.wooId ? "Actualizare pe site" : "Publicare pe site"} onDone={() => reload()} />
      <AdjustModal
        open={adjust}
        onClose={() => setAdjust(false)}
        product={p}
        onDone={() => {
          reload();
          reloadMov();
          invalidate("/api/products", "/api/stock");
        }}
      />
    </div>
  );
}
