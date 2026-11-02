"use client";

// Sesiunile de scanare: venite de la terminale (API), din fișiere sau din pagina Scanare.
// Aici se verifică, se leagă codurile necunoscute de produse și se aplică / resping.
import { useState } from "react";
import Link from "@/app/_components/link";
import { apiPatch } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { formatDateTime, relativeTime, num } from "@/lib/format";
import { UNIT_LABELS, writeoffReasonLabel } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { useUser } from "@/app/_components/user";
import { Drawer, useConfirm, useToast } from "@/app/_components/overlay";
import { Card, Button, Select, Badge, Alert, EmptyState, Checkbox, NumberInput, Field, DetailList, cx } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { ProductPicker } from "@/app/_components/pickers";
import { Barcode, ArrowsClockwise, CheckCircle, WarningCircle, Prohibit, Trash, ArrowSquareOut, LinkIcon } from "@/app/_components/icons";
import { OPS } from "./_scan";

const STATUS = {
  pending: { label: "De verificat", tone: "warn" },
  applied: { label: "Aplicată", tone: "ok" },
  rejected: { label: "Respinsă", tone: "neutral" },
  error: { label: "Eroare", tone: "bad" },
};
const SOURCE = { scanner: "Terminal (API)", crm: "Pagina Scanare", file: "Fișier" };
const opLabel = (k) => OPS.find((o) => o.key === k)?.label || k;
const PERM = { writeoff: "stock.writeoff", transfer: "stock.transfer", inventory: "stock.inventory" };

export function SessionsList({ openId, onOpen }) {
  const [f, setF] = useQueryState({ tab: "scan", page: "1" });
  const { data, loading, reload } = useApi(`/api/scanner/sessions${qs({ status: f.status, operation: f.operation, source: f.source, page: f.page, limit: 30 })}`);
  const columns = [
    { key: "number", header: "Sesiune", render: (s) => <div><div className="font-medium text-fg">{s.number}</div><div className="text-[12px] text-fg-3">{formatDateTime(s.createdAt)}</div></div> },
    { key: "op", header: "Operațiune", render: (s) => <span className="text-[13px] text-fg-2">{opLabel(s.operation)}</span> },
    { key: "src", header: "Sursă", render: (s) => <div className="text-[12.5px]"><div className="text-fg-2">{SOURCE[s.source] || s.source}</div><div className="truncate text-fg-4">{s.device || s.sourceName || ""}</div></div> },
    { key: "lines", header: "Coduri", align: "right", render: (s) => <span className="tnum text-[13px]">{s.items.length}{s.unknownCount ? <span className="text-warn"> · {s.unknownCount} necunoscute</span> : ""}</span> },
    { key: "status", header: "Status", render: (s) => <Badge tone={STATUS[s.status]?.tone} dot>{STATUS[s.status]?.label || s.status}</Badge> },
  ];
  return (
    <>
      <Card className="overflow-hidden">
        <Toolbar>
          <Select value={f.status || ""} onChange={(e) => setF({ status: e.target.value })} className="w-[160px]">
            <option value="">Toate statusurile</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}{data?.counts?.[k] ? ` (${data.counts[k]})` : ""}</option>)}
          </Select>
          <Select value={f.operation || ""} onChange={(e) => setF({ operation: e.target.value })} className="w-[180px]">
            <option value="">Toate operațiunile</option>
            {OPS.filter((o) => o.key !== "lookup").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
          <Select value={f.source || ""} onChange={(e) => setF({ source: e.target.value })} className="w-[170px]">
            <option value="">Toate sursele</option>
            {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button size="sm" variant="ghost" icon={ArrowsClockwise} onClick={reload} className="ml-auto">Reîmprospătează</Button>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.items}
          loading={loading}
          onRowClick={(s) => onOpen(s._id)}
          empty={<EmptyState compact icon={Barcode} title="Nicio sesiune de scanare" description="Aici apar listele trimise de terminalele de scanare, fișierele încărcate și scanările salvate pentru verificare." />}
        />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
      <SessionDrawer id={openId} onClose={() => onOpen("")} onChanged={reload} />
    </>
  );
}

function SessionDrawer({ id, onClose, onChanged }) {
  if (!id) return null;
  return <SessionDrawerBody key={id} id={id} onClose={onClose} onChanged={onChanged} />;
}

function SessionDrawerBody({ id, onClose, onChanged }) {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: s, reload, mutate } = useApi(`/api/scanner/sessions/${id}`);
  const { data: warehouses } = useApi("/api/warehouses");
  const open = s && (s.status === "pending" || s.status === "error");
  const { data: products } = useApi(open && s.unknownCount > 0 ? "/api/products?light=1" : null);
  const [whSel, setWh] = useState("");
  const [toWhSel, setToWh] = useState("");
  const [busy, setBusy] = useState("");
  const [save, setSave] = useState(can(user, "products.manage"));
  const [mult, setMult] = useState({});

  const wh = whSel || (s?.warehouseId ? String(s.warehouseId) : "");
  const toWh = toWhSel || (s?.toWarehouseId ? String(s.toWarehouseId) : "");

  const act = async (body, msg) => {
    setBusy(body.action);
    try {
      const r = await apiPatch(`/api/scanner/sessions/${id}`, body);
      mutate(r);
      onChanged?.();
      if (body.action === "apply") invalidate("/api/products", "/api/stock", "/api/inventory", "/api/orders", "/api/arrivals", "/api/transfers", "/api/writeoffs");
      if (msg) toast(typeof msg === "function" ? msg(r) : msg);
    } catch (e) {
      toast(e.message, "error");
      reload();
      onChanged?.();
    } finally {
      setBusy("");
    }
  };

  const apply = () =>
    act({ action: "apply", warehouse: wh || undefined, toWarehouse: toWh || undefined }, (r) =>
      r.result?.docType === "order" ? (r.result.complete ? `Comanda ${r.result.number} este completă` : `Comanda ${r.result.number}: există diferențe`) : `Sesiunea a fost aplicată${r.result?.number ? ` → ${r.result.number}` : ""}`
    );
  const reject = async () => {
    if (!(await confirm({ title: `Respingeți ${s.number}?`, message: "Sesiunea nu va modifica stocul. Terminalul o va vedea ca respinsă.", tone: "danger", confirmLabel: "Respinge" }))) return;
    act({ action: "reject" }, "Sesiunea a fost respinsă");
  };

  if (!s) return <Drawer open onClose={onClose} title="Sesiune de scanare" width="lg:w-[760px]"><div className="p-6 text-fg-3">Se încarcă…</div></Drawer>;
  const needWh = ["arrival", "writeoff", "transfer"].includes(s.operation) || (s.operation === "inventory" && !s.inventoryId);
  const permOk = !PERM[s.operation] || can(user, PERM[s.operation]);
  const r = s.result;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${s.number} · ${opLabel(s.operation)}`}
      description={`${SOURCE[s.source] || s.source}${s.device ? ` · ${s.device}` : ""} · ${relativeTime(s.createdAt)}`}
      width="lg:w-[820px]"
      headerAction={<Badge tone={STATUS[s.status]?.tone} dot>{STATUS[s.status]?.label}</Badge>}
      footer={
        open && (
          <>
            <Button variant="ghost" icon={Prohibit} loading={busy === "reject"} onClick={reject}>Respinge</Button>
            {s.unknownCount > 0 && <Button icon={Trash} loading={busy === "drop-unknown"} onClick={() => act({ action: "drop-unknown" }, "Codurile necunoscute au fost eliminate")}>Elimină codurile necunoscute</Button>}
            {s.operation !== "list" && (
              <Button variant="primary" icon={CheckCircle} loading={busy === "apply"} disabled={s.unknownCount > 0 || !permOk || (needWh && !wh) || (s.operation === "transfer" && (!toWh || wh === toWh))} onClick={apply}>
                {s.operation === "picking" ? "Verifică comanda" : "Aplică"}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4 p-5">
        {s.status === "error" && s.error && <Alert tone="bad" icon={WarningCircle} title="Nu s-a putut aplica">{s.error}</Alert>}
        {s.status === "rejected" && <Alert tone="info" icon={Prohibit} title="Sesiune respinsă">{s.error || "Nu a modificat stocul."}</Alert>}
        {!permOk && open && <Alert tone="warn" icon={WarningCircle}>Nu aveți dreptul de a aplica această operațiune. Cereți-l administratorului.</Alert>}
        {r && <ResultBox r={r} />}

        <DetailList
          cols={2}
          items={[
            s.warehouse && ["Depozit", s.warehouse.name],
            s.toWarehouse && ["În depozitul", s.toWarehouse.name],
            s.order && ["Comanda", <Link key="o" href={`/comenzi/${s.order._id}`} className="text-accent hover:underline">{s.order.number}{s.order.customerName ? ` · ${s.order.customerName}` : ""}</Link>],
            s.inventory && ["Inventariere", <Link key="i" href={`/inventariere/${s.inventory._id}`} className="text-accent hover:underline">{s.inventory.number}</Link>],
            s.operation === "inventory" && ["Cantități", s.options?.mode === "add" ? "Se adună la cele numărate" : "Înlocuiesc cele numărate"],
            s.operation === "writeoff" && ["Motiv", s.options?.reason || writeoffReasonLabel(s.options?.reasonCode || "other")],
            s.externalId && ["ID extern", <span key="e" className="font-mono">{s.externalId}</span>],
            s.createdBy && ["Creată de", s.createdBy.name],
            s.appliedBy && [s.status === "rejected" ? "Respinsă de" : "Aplicată de", `${s.appliedBy.name}${s.appliedAt ? ` · ${formatDateTime(s.appliedAt)}` : ""}`],
            s.note && ["Notă", s.note],
          ].filter(Boolean)}
        />

        {open && needWh && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={s.operation === "transfer" ? "Din depozitul" : "Depozit"}>
              <Select value={wh} onChange={(e) => setWh(e.target.value)}>
                <option value="">Alegeți…</option>
                {(warehouses || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </Select>
            </Field>
            {s.operation === "transfer" && (
              <Field label="În depozitul">
                <Select value={toWh} onChange={(e) => setToWh(e.target.value)}>
                  <option value="">Alegeți…</option>
                  {(warehouses || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}

        {open && s.unknownCount > 0 && (
          <Alert tone="warn" icon={LinkIcon} title={`${s.unknownCount} coduri necunoscute`}>
            Alegeți produsul pentru fiecare cod. Dacă bifați „Salvează codul la produs”, data viitoare codul va fi recunoscut automat (și pe terminal).
            <Checkbox className="mt-2" checked={save} disabled={!can(user, "products.manage")} onChange={setSave} label="Salvează codul la produs" />
          </Alert>
        )}

        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {s.items.map((i) => (
              <li key={i.code} className={cx("px-4 py-2.5", !i.matched && "bg-warn-soft/30")}>
                <div className="flex items-center gap-3">
                  {i.matched ? <CheckCircle size={17} className="shrink-0 text-ok" /> : <WarningCircle size={17} className="shrink-0 text-warn" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg">
                      {i.matched ? <Link href={`/produse/${i.productId}`} className="hover:text-accent">{i.productName}</Link> : "Cod necunoscut"}
                      {i.inactive && <Badge tone="bad" className="ml-2">inactiv</Badge>}
                    </div>
                    <div className="truncate font-mono text-[12px] text-fg-3">
                      {i.code}
                      {i.matchedBy && i.matchedBy !== "barcode" ? ` · după ${{ extra: "cod suplimentar", sku: "SKU", externalId: "cod 1C", manual: "legătură manuală" }[i.matchedBy] || i.matchedBy}` : ""}
                      {i.scans > 1 ? ` · scanat de ${i.scans} ori` : ""}
                    </div>
                  </div>
                  <div className="tnum shrink-0 text-right text-[13.5px]">
                    {i.multiplier > 1 ? <span className="text-fg-3">{num(i.scanned)} × {num(i.multiplier)} = </span> : null}
                    <span className="font-semibold text-fg">{num(i.quantity)}</span> <span className="text-fg-4">{UNIT_LABELS[i.unit] || ""}</span>
                  </div>
                </div>
                {!i.matched && open && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                    <div className="min-w-[240px] flex-1">
                      <ProductPicker products={products} placeholder="Alegeți produsul pentru acest cod…" onSelect={(p) => act({ action: "link", code: i.code, productId: p._id, saveBarcode: save, multiplier: mult[i.code] || 1 }, `Codul ${i.code} → ${p.name}`)} />
                    </div>
                    {save && (
                      <label className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-fg-3" title="Pentru coduri de bax / cutie: câte bucăți conține">
                        bax ×
                        <NumberInput value={mult[i.code] ?? "1"} onChange={(v) => setMult((m) => ({ ...m, [i.code]: v }))} className="h-8 w-[64px] text-center" />
                      </label>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Drawer>
  );
}

function ResultBox({ r }) {
  if (r.docType === "order") {
    return (
      <Alert tone={r.complete ? "ok" : "warn"} icon={r.complete ? CheckCircle : WarningCircle} title={r.complete ? `Comanda ${r.number} este completă${r.markedReady ? " — trecută la „Gata de livrare”" : ""}` : `Comanda ${r.number}: diferențe față de comandă`}>
        <ul className="mt-1 space-y-0.5 text-[12.5px]">
          {r.lines.filter((l) => l.diff !== 0).map((l) => (
            <li key={l.product}>• {l.name}: scanat {num(l.picked)} din {num(l.ordered)} ({l.diff > 0 ? `+${num(l.diff)} în plus` : `lipsesc ${num(-l.diff)}`})</li>
          ))}
          {r.extra.map((l) => <li key={l.product}>• {l.name}: {num(l.picked)} — nu este în comandă</li>)}
        </ul>
        <Link href={r.href} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">Deschide comanda <ArrowSquareOut size={13} /></Link>
      </Alert>
    );
  }
  const label = { arrival: "Recepția", writeoff: "Casarea", transfer: "Transferul", inventory: "Inventarierea" }[r.docType] || "Documentul";
  return (
    <Alert tone="ok" icon={CheckCircle} title={`${label} ${r.number || ""} a fost creat${r.docType === "inventory" ? "ă / actualizată" : r.docType === "arrival" || r.docType === "writeoff" ? "ă" : ""}`}>
      {r.docType === "inventory" && <div className="text-[12.5px]">{num(r.lines)} produse numărate ({r.mode === "add" ? "adunate" : "înlocuite"}). Finalizați fișa din Inventariere.</div>}
      {r.href && <Link href={r.href} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">Deschide documentul <ArrowSquareOut size={13} /></Link>}
    </Alert>
  );
}
