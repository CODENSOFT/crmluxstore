"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, num, formatDate, formatDateTime, relativeTime, ymd } from "@/lib/format";
import { channelLabel, paymentMethodLabel, PAYMENT_METHODS, UNIT_LABELS, segmentLabel, MOVEMENT_TYPES } from "@/lib/constants";
import { ORDER_STAGES, stageInfo, nextStage, prevStage, isClosed } from "@/lib/orderStages";
import {
  Card, CardHeader, PageHeader, Button, ButtonLink, StageBadge, PaymentBadge, Alert, DetailList, Input, NumberInput, Select,
  Skeleton, ErrorState, Progress, cx, Avatar,
} from "@/app/_components/ui";
import { Menu, useConfirm, useToast } from "@/app/_components/overlay";
import {
  Check, PencilSimple, Printer, DotsThree, X, ArrowCounterClockwise, Trash, Copy, Receipt, Wallet, Truck, UserCircle, Phone,
  EnvelopeSimple, Clock, Warning, Globe, FileText, Package, Info, ClockCounterClockwise, Plus, Buildings, User,
} from "@/app/_components/icons";

const NEXT_LABEL = {
  new: "Confirmă comanda",
  pending_approval: "Aprobă comanda",
  processing: "Marchează gata de livrare",
  ready: "Predă la livrare",
  invoicing: "Finalizează comanda",
};

function Stepper({ status }) {
  const idx = ORDER_STAGES.findIndex((s) => s.key === status);
  if (idx < 0) return null;
  return (
    <div>
      <ol className="flex items-start gap-1">
        {ORDER_STAGES.map((s, i) => {
          const done = i < idx;
          const cur = i === idx;
          return (
            <li key={s.key} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className={cx("h-1.5 rounded-full", done ? "bg-accent" : cur ? "bg-accent/60" : "bg-surface-3")} />
              {/* pe telefon etichetele nu incap una langa alta — se arata doar etapa curenta, dedesubt */}
              <span className={cx("hidden items-center gap-1 truncate text-[12px] sm:flex", cur ? "font-semibold text-fg" : done ? "text-fg-2" : "text-fg-4")}>
                {done && <Check size={12} weight="bold" className="shrink-0 text-accent" />}
                {s.short}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12.5px] text-fg-3 sm:hidden">
        {`Etapa ${idx + 1} din ${ORDER_STAGES.length}:`} <span className="font-semibold text-fg">{ORDER_STAGES[idx].label || ORDER_STAGES[idx].short}</span>
      </p>
    </div>
  );
}

function OrderTotals({ order }) {
  return (
    <dl className="tnum space-y-1 border-t border-line px-4 pb-4 pt-3 text-[13.5px]">
      <div className="flex justify-between gap-3">
        <dt className="text-fg-3">Subtotal</dt>
        <dd className="text-fg-2">{money(order.subtotal ?? order.total)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="min-w-0 text-fg-3">Livrare {order.delivery?.label ? `· ${order.delivery.label}` : ""}</dt>
        <dd className="shrink-0 text-fg-2">{order.delivery?.cost ? money(order.delivery.cost) : "gratuit"}</dd>
      </div>
      {order.vatTotal > 0 && (
        <div className="flex justify-between gap-3">
          <dt className="text-fg-3">din care TVA</dt>
          <dd className="text-fg-3">{money(order.vatTotal)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 pt-1.5">
        <dt className="font-semibold text-fg">Total</dt>
        <dd className="text-[17px] font-semibold text-fg">{money(order.total)}</dd>
      </div>
    </dl>
  );
}

function ItemsTable({ items, order, compare }) {
  return (
    <>
      {/* Telefon: fiecare produs pe un rand compact, totalurile pe toata latimea */}
      <div className="sm:hidden">
        <ul className="divide-y divide-line border-y border-line">
          {items.map((it, i) => (
            <li key={i} className={cx("px-4 py-3", compare && "bg-warn-soft/30")}>
              <Link href={`/produse/${it.product?._id || it.product}`} className="block break-words text-[14px] font-medium text-fg">
                {it.productName}
              </Link>
              {(it.sku || it.warehouse?.name) && <div className="text-[12px] text-fg-3">{[it.sku, it.warehouse?.name].filter(Boolean).join(" · ")}</div>}
              <div className="tnum mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-fg-2">
                  {num(it.quantity)} {UNIT_LABELS[it.unit] || ""} × {money(it.unitPrice)}
                  {it.discount ? <span className="text-fg-3"> · −{num(it.discount)}%</span> : null}
                </span>
                <span className="shrink-0 font-semibold text-fg">{money(it.lineTotal)}</span>
              </div>
            </li>
          ))}
        </ul>
        {order && <OrderTotals order={order} />}
      </div>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-y border-line bg-surface-2/60 text-[12px] text-fg-3">
            <th className="px-5 py-2 text-left font-medium">Produs</th>
            <th className="px-3 py-2 text-right font-medium">Cantitate</th>
            <th className="px-3 py-2 text-right font-medium">Preț</th>
            <th className="px-3 py-2 text-right font-medium">Reducere</th>
            <th className="px-5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((it, i) => (
            <tr key={i} className={cx(compare && "bg-warn-soft/30")}>
              <td className="px-5 py-3">
                <Link href={`/produse/${it.product?._id || it.product}`} className="font-medium text-fg hover:text-accent">
                  {it.productName}
                </Link>
                <div className="text-[12px] text-fg-3">
                  {[it.sku, it.warehouse?.name].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="tnum whitespace-nowrap px-3 py-3 text-right text-fg-2">
                {num(it.quantity)} {UNIT_LABELS[it.unit] || ""}
              </td>
              <td className="tnum whitespace-nowrap px-3 py-3 text-right text-fg-2">{money(it.unitPrice)}</td>
              <td className="tnum px-3 py-3 text-right text-fg-3">{it.discount ? `−${num(it.discount)}%` : "—"}</td>
              <td className="tnum whitespace-nowrap px-5 py-3 text-right font-medium text-fg">{money(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        {order && (
          <tfoot className="text-[13.5px]">
            <tr>
              <td colSpan={4} className="px-5 pt-3 text-right text-fg-3">
                Subtotal
              </td>
              <td className="tnum px-5 pt-3 text-right text-fg-2">{money(order.subtotal ?? order.total)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-5 pt-1 text-right text-fg-3">
                Livrare {order.delivery?.label ? `· ${order.delivery.label}` : ""}
              </td>
              <td className="tnum px-5 pt-1 text-right text-fg-2">{order.delivery?.cost ? money(order.delivery.cost) : "gratuit"}</td>
            </tr>
            {order.vatTotal > 0 && (
              <tr>
                <td colSpan={4} className="px-5 pt-1 text-right text-fg-3">
                  din care TVA
                </td>
                <td className="tnum px-5 pt-1 text-right text-fg-3">{money(order.vatTotal)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={4} className="px-5 pb-4 pt-2 text-right font-semibold text-fg">
                Total
              </td>
              <td className="tnum px-5 pb-4 pt-2 text-right text-[16px] font-semibold text-fg">{money(order.total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  );
}

function Payments({ order, canDelete, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const remaining = Math.max(0, Math.round((order.total - (order.paidAmount || 0)) * 100) / 100);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(order.paymentMethod === "cod" ? "cash" : order.paymentMethod || "cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = ["cancelled", "rejected"].includes(order.status);

  const add = async () => {
    setBusy(true);
    try {
      const res = await apiPost(`/api/orders/${order._id}/payments`, { amount: Number(amount || remaining), method, reference });
      toast("Plata a fost înregistrată");
      setAmount("");
      setReference("");
      onChange(res);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: "Ștergeți plata?", message: `Plata de ${money(p.amount)} din ${formatDate(p.date)} va fi eliminată.`, tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      onChange(await apiDelete(`/api/orders/${order._id}/payments?paymentId=${p._id}`));
      toast("Plata a fost ștearsă");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Plăți"
        icon={Wallet}
        description={order.dueDate && order.paymentStatus !== "paid" ? `Scadență: ${formatDate(order.dueDate)}` : paymentMethodLabel(order.paymentMethod)}
        action={<PaymentBadge status={order.paymentStatus} />}
      />
      <div className="px-5 pb-4">
        <div className="mb-1.5 flex justify-between text-[12.5px] text-fg-3">
          <span>
            Achitat <span className="tnum font-medium text-fg">{money(order.paidAmount)}</span> din {money(order.total)}
          </span>
          {remaining > 0 && (
            <span>
              Rest <span className="tnum font-medium text-bad">{money(remaining)}</span>
            </span>
          )}
        </div>
        <Progress value={order.paidAmount || 0} max={order.total || 1} tone={order.paymentStatus === "paid" ? "ok" : "accent"} />
      </div>
      {order.payments?.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {order.payments.map((p) => (
            <li key={p._id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className="tnum font-medium text-fg">{money(p.amount)}</span>
              <span className="text-fg-3">{paymentMethodLabel(p.method)}</span>
              {p.reference && <span className="truncate text-fg-4">#{p.reference}</span>}
              <span className="ml-auto whitespace-nowrap text-[12px] text-fg-4">
                {formatDate(p.date)}
                {p.createdByName ? ` · ${p.createdByName}` : ""}
              </span>
              {canDelete && (
                <button type="button" onClick={() => remove(p)} className="rounded p-1 text-fg-4 hover:bg-bad-soft hover:text-bad" aria-label="Șterge plata">
                  <Trash size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && !closed && (
        <div className="grid grid-cols-2 gap-2 border-t border-line bg-surface-2/40 px-5 py-3.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <NumberInput value={amount} onChange={setAmount} placeholder={num(remaining, 2)} suffix="MDL" aria-label="Suma" />
          <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Metoda">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nr. chitanță / OP" className="col-span-2 sm:col-span-1" />
          <Button variant="primary" icon={Plus} loading={busy} onClick={add} className="col-span-2 sm:col-span-1">
            Încasează
          </Button>
        </div>
      )}
    </Card>
  );
}

function InlineEdit({ label, value, placeholder, onSave, type = "text" }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || "");
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <div className="group flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-fg-3">{label}</div>
          <div className={cx("mt-0.5 text-[13.5px]", value ? "text-fg" : "text-fg-4")}>{value || placeholder}</div>
        </div>
        <button type="button" onClick={() => { setV(value || ""); setEditing(true); }} className="rounded p-1 text-fg-4 opacity-60 hover:bg-surface-2 hover:text-fg group-hover:opacity-100" aria-label={`Editează ${label}`}>
          <PencilSimple size={14} />
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-[12px] text-fg-3">{label}</div>
      <div className="flex gap-1.5">
        <Input type={type} autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        <Button
          size="md"
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(v);
              setEditing(false);
            } finally {
              setBusy(false);
            }
          }}
          icon={Check}
          aria-label="Salvează"
        />
        <Button size="md" variant="ghost" icon={X} onClick={() => setEditing(false)} aria-label="Renunță" />
      </div>
    </div>
  );
}

function Timeline({ history }) {
  const items = [
    ...(history?.events || []).map((e) => ({ at: e.createdAt, title: e.label, by: e.userName, details: e.details, kind: "event" })),
    ...(history?.movements || []).map((m) => ({
      at: m.createdAt,
      title: `${MOVEMENT_TYPES[m.type]?.label || m.type}: ${m.quantity > 0 ? "+" : ""}${num(m.quantity)} ${m.productName}`,
      by: m.userName,
      details: m.warehouse?.name,
      kind: "stock",
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!history) return <Skeleton className="mx-5 mb-5 h-24" />;
  if (!items.length) return <p className="px-5 pb-5 text-[13px] text-fg-3">Fără evenimente.</p>;
  return (
    <ol className="relative px-5 pb-5">
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" />}
          <span className={cx("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-surface", it.kind === "stock" ? "bg-fg-4" : "bg-accent")} />
          <div className="min-w-0 text-[13px]">
            <div className="text-fg">{it.title}</div>
            <div className="text-[12px] text-fg-3">
              {formatDateTime(it.at)}
              {it.by ? ` · ${it.by}` : ""}
              {it.details ? ` · ${it.details}` : ""}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function OrderPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  // Pentru comenzi, "isAdmin" = administrator sau angajat cu dreptul de aprobare
  const isAdmin = can(user, "orders.approve");
  const canDelete = can(user, "delete");
  const { data: order, error, reload, mutate } = useApi(`/api/orders/${id}`, { keepPrevious: false });
  const { data: history, reload: reloadHistory } = useApi(`/api/orders/${id}/history`, { keepPrevious: false });
  const [busy, setBusy] = useState(null);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!order)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64" />
      </div>
    );

  const isMine = String(order.responsible?._id) === user.id || String(order.createdBy?._id) === user.id;
  const shared = order.status === "new" && ["site", "api", "1c"].includes(order.channel);
  const closed = isClosed(order.status);
  const st = order.status;
  const next = nextStage(st);

  const applyResult = (res) => {
    mutate(res);
    reloadHistory();
    invalidate("/api/orders", "/api/dashboard", "/api/me", "/api/products", "/api/stock", "/api/customers");
  };

  const act = async (body, msg, key = body.action) => {
    setBusy(key);
    try {
      const res = await apiPatch(`/api/orders/${order._id}`, body);
      applyResult(res);
      if (msg) toast(msg);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const advance = () => {
    if (st === "new" || st === "pending_approval") return act({ action: "approve" }, st === "new" ? "Comanda a fost confirmată, stocul a fost rezervat" : "Comanda a fost aprobată");
    return act({ action: "stage", stage: next }, `Comanda este acum: ${stageInfo(next).label.toLowerCase()}`, "stage");
  };

  const canAdvance =
    !closed &&
    next &&
    !order.pendingEdit &&
    (isAdmin || (st === "new" && shared) || (isMine && !["new", "pending_approval"].includes(st)));

  const reject = async () => {
    const reason = await confirm({ title: "Respingeți comanda?", message: "Managerul va fi notificat. Stocul rezervat (dacă există) revine în depozit.", tone: "danger", confirmLabel: "Respinge", input: { label: "Motiv (opțional)", placeholder: "ex: preț greșit" } });
    if (reason === false) return;
    act({ action: "reject", reason }, "Comanda a fost respinsă");
  };
  const cancel = async () => {
    const reason = await confirm({ title: `Anulați comanda ${order.number}?`, message: order.stockApplied ? "Produsele revin automat în stoc." : "Comanda va fi marcată ca anulată.", tone: "danger", confirmLabel: "Anulează comanda", input: { label: "Motivul anulării", placeholder: "ex: clientul a renunțat" } });
    if (reason === false) return;
    act({ action: "cancel", reason }, "Comanda a fost anulată");
  };
  const remove = async () => {
    if (!(await confirm({ title: `Ștergeți definitiv comanda ${order.number}?`, message: "Acțiunea nu poate fi anulată. Pentru evidență, preferați anularea.", tone: "danger", confirmLabel: "Șterge definitiv" }))) return;
    try {
      await apiDelete(`/api/orders/${order._id}`);
      toast("Comanda a fost ștearsă");
      invalidate("/api/orders", "/api/dashboard", "/api/me", "/api/products");
      router.push("/comenzi");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const prev = prevStage(st);
  const c = order.customer;

  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/comenzi", label: "Comenzi" }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            Comanda {order.number}
            <StageBadge status={st} />
            <PaymentBadge status={order.paymentStatus} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              {order.channel === "site" && <Globe size={13} />}
              {channelLabel(order.channel)}
              {order.externalNumber && ` #${order.externalNumber}`}
            </span>
            <span>Creată {formatDateTime(order.createdAt)}</span>
            {order.createdBy?.name && <span>de {order.createdBy.name}</span>}
          </span>
        }
        actions={
          <>
            <Menu
              trigger={<Button icon={Printer}>Tipărește</Button>}
              items={[
                { label: "Factură", icon: FileText, href: `/print/comanda/${order._id}?doc=factura`, external: true },
                { label: "Aviz de însoțire", icon: Truck, href: `/print/comanda/${order._id}?doc=aviz`, external: true },
                { label: "Fișă de pregătire (depozit)", icon: Package, href: `/print/comanda/${order._id}?doc=picking`, external: true },
              ]}
            />
            {!closed && (isAdmin || isMine) && (
              <ButtonLink href={`/comenzi/${order._id}/editeaza`} icon={PencilSimple}>
                Editează
              </ButtonLink>
            )}
            {canAdvance && (
              <Button variant="primary" icon={Check} loading={busy === "approve" || busy === "stage"} onClick={advance}>
                {NEXT_LABEL[st]}
              </Button>
            )}
            <Menu
              trigger={<Button icon={DotsThree} aria-label="Mai multe acțiuni" />}
              items={[
                { label: "Repetă comanda", icon: Copy, href: `/comenzi/nou?from=${order._id}` },
                isAdmin && st === "pending_approval" && { label: "Respinge comanda", icon: X, onClick: reject },
                isAdmin && prev && !closed && { label: `Readu la „${stageInfo(prev).short}”`, icon: ArrowCounterClockwise, onClick: () => act({ action: "stage", stage: prev }, "Stadiul a fost schimbat", "stage") },
                isAdmin && st === "completed" && { label: "Redeschide comanda", icon: ArrowCounterClockwise, onClick: () => act({ action: "stage", stage: "invoicing" }, "Comanda a fost redeschisă", "stage") },
                !["cancelled", "rejected"].includes(st) && (isAdmin || (isMine && ["new", "pending_approval"].includes(st))) && { divider: true },
                !["cancelled", "rejected"].includes(st) && (isAdmin || (isMine && ["new", "pending_approval"].includes(st))) && { label: "Anulează comanda", icon: X, onClick: cancel, danger: true },
                canDelete && { label: "Șterge definitiv", icon: Trash, onClick: remove, danger: true },
              ]}
            />
          </>
        }
      />

      {!closed ? (
        <Card className="mb-4 px-5 py-4">
          <Stepper status={st} />
          {st === "pending_approval" && !isAdmin && (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-warn">
              <Clock size={14} /> Comanda așteaptă aprobarea administratorului. Stocul nu a fost încă rezervat.
            </p>
          )}
          {st === "new" && (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-3">
              <Info size={14} /> Comanda nouă nu rezervă stoc. La confirmare, produsele se scad din depozit.
            </p>
          )}
        </Card>
      ) : st !== "completed" ? (
        <Alert className="mb-4" tone="bad" icon={Warning} title={st === "cancelled" ? "Comandă anulată" : "Comandă respinsă"}>
          {order.cancelReason || "Fără motiv specificat."} Stocul a fost returnat în depozit.
        </Alert>
      ) : (
        <Alert className="mb-4" tone="ok" icon={Check} title="Comandă finalizată">
          {order.completedAt ? `Finalizată ${formatDateTime(order.completedAt)}.` : null} {order.paymentStatus !== "paid" ? "Atenție: comanda nu este achitată integral." : "Achitată integral."}
        </Alert>
      )}

      {order.pendingEdit && (
        <Card className="mb-4 border-warn/40">
          <CardHeader
            title="Modificare propusă, în așteptarea aprobării"
            description={`${order.pendingEdit.requestedByName || "Un angajat"} · ${relativeTime(order.pendingEdit.requestedAt)} · total nou ${money(order.pendingEdit.total)} (acum ${money(order.total)})`}
            icon={PencilSimple}
            action={
              isAdmin && (
                <>
                  <Button size="sm" variant="ghost" loading={busy === "reject_edit"} onClick={() => act({ action: "reject_edit" }, "Modificarea a fost respinsă")}>
                    Respinge
                  </Button>
                  <Button size="sm" variant="primary" icon={Check} loading={busy === "approve_edit"} onClick={() => act({ action: "approve_edit" }, "Modificarea a fost aplicată")}>
                    Aprobă modificarea
                  </Button>
                </>
              )
            }
          />
          <ItemsTable items={order.pendingEdit.items} compare />
          {order.pendingEdit.note !== order.note && order.pendingEdit.note && <p className="px-5 py-3 text-[13px] text-fg-2">Observații noi: {order.pendingEdit.note}</p>}
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader title={`Produse (${order.items.length})`} icon={Receipt} />
            <ItemsTable items={order.items} order={order} />
          </Card>
          <Payments order={order} canDelete={canDelete} onChange={applyResult} />
          <Card>
            <CardHeader title="Istoric" icon={ClockCounterClockwise} description="Acțiuni și mișcări de stoc" />
            <Timeline history={history} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Client" icon={UserCircle} action={c?._id && <Link href={`/clienti/${c._id}`} className="text-[12.5px] font-medium text-accent hover:underline">Fișa clientului</Link>} />
            <div className="space-y-3 px-5 pb-5">
              {c?._id || order.customerName ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-fg-2">{c?.type === "company" ? <Buildings size={18} /> : <User size={18} />}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-fg">{order.customerName || c?.name}</div>
                      <div className="text-[12px] text-fg-3">
                        {c?.segment ? segmentLabel(c.segment) : "Client neînregistrat"}
                        {c?.priceType === "wholesale" ? " · angro" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[13px]">
                    {(order.customerPhone || c?.phone) && (
                      <a href={`tel:${(order.customerPhone || c.phone).replace(/\s/g, "")}`} className="flex items-center gap-2 text-fg-2 hover:text-accent">
                        <Phone size={15} className="text-fg-3" /> {order.customerPhone || c.phone}
                      </a>
                    )}
                    {(order.customerEmail || c?.email) && (
                      <a href={`mailto:${order.customerEmail || c.email}`} className="flex items-center gap-2 text-fg-2 hover:text-accent">
                        <EnvelopeSimple size={15} className="text-fg-3" /> {order.customerEmail || c.email}
                      </a>
                    )}
                    {c?.idno && <div className="text-fg-3">IDNO {c.idno}</div>}
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-fg-3">Vânzare fără client înregistrat.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Livrare" icon={Truck} />
            <div className="space-y-3 px-5 pb-5">
              <DetailList
                items={[
                  ["Metodă", `${order.delivery?.label || "—"}${order.delivery?.cost ? ` · ${money(order.delivery.cost)}` : ""}`],
                  ["Adresă", [order.delivery?.city, order.delivery?.address].filter(Boolean).join(", ")],
                  ["Destinatar", [order.delivery?.recipient, order.delivery?.phone].filter(Boolean).join(" · ")],
                ]}
              />
              {order.delivery?.method !== "pickup" && (
                <InlineEdit
                  label="Număr AWB / urmărire"
                  value={order.delivery?.trackingNumber}
                  placeholder="nespecificat"
                  onSave={(v) => act({ action: "delivery", delivery: { trackingNumber: v } }, "Datele de livrare au fost salvate", "delivery")}
                />
              )}
              <InlineEdit
                label="Data livrării"
                type="date"
                value={order.delivery?.date ? ymd(order.delivery.date) : ""}
                placeholder="neprogramată"
                onSave={(v) => act({ action: "delivery", delivery: { date: v || null } }, "Data livrării a fost salvată", "delivery")}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Detalii" icon={Info} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex items-center gap-2.5">
                <Avatar name={order.responsible?.name || "?"} size={28} />
                <div className="text-[13px]">
                  <div className="text-fg">{order.responsible?.name || "—"}</div>
                  <div className="text-[12px] text-fg-3">Responsabil</div>
                </div>
              </div>
              <DetailList
                items={[
                  ["Aprobată de", order.approvedBy?.name],
                  ["Metodă de plată", paymentMethodLabel(order.paymentMethod)],
                  ["Scadență plată", order.dueDate ? formatDate(order.dueDate) : null],
                  ["Sursă externă", order.externalSource ? `${{ woo: "Site WooCommerce", api: "API", "1c": "1C" }[order.externalSource] || order.externalSource}${order.externalNumber ? ` #${order.externalNumber}` : ""}` : null],
                  ["Export 1C", order.export1c?.exportedAt ? `Preluată ${formatDateTime(order.export1c.exportedAt)}${order.export1c.docNumber ? ` · doc. ${order.export1c.docNumber}` : ""}` : order.stockApplied ? "Așteaptă preluarea în 1C" : null],
                ]}
              />
              <InlineEdit
                label="Factură fiscală"
                value={order.invoice?.number ? `${order.invoice.number}${order.invoice.date ? ` din ${formatDate(order.invoice.date)}` : ""}` : ""}
                placeholder="neemisă"
                onSave={(v) => act({ action: "invoice", invoice: { number: v.split(" din ")[0] } }, "Numărul facturii a fost salvat", "invoice")}
              />
            </div>
          </Card>

          {(order.note || order.internalNote) && (
            <Card>
              <CardHeader title="Observații" icon={FileText} />
              <div className="space-y-3 px-5 pb-5 text-[13.5px]">
                {order.note && (
                  <div>
                    <div className="text-[12px] text-fg-3">Pentru client</div>
                    <p className="mt-0.5 whitespace-pre-line text-fg">{order.note}</p>
                  </div>
                )}
                {order.internalNote && (
                  <div className="rounded-lg bg-warn-soft/60 px-3 py-2">
                    <div className="text-[12px] text-warn">Notă internă</div>
                    <p className="mt-0.5 whitespace-pre-line text-fg">{order.internalNote}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
