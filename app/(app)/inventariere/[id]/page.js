"use client";

import { isAdminUser } from "@/lib/permissions";
import { use, useEffect, useMemo, useState } from "react";
import { apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser } from "@/app/_components/user";
import { money, num, formatDateTime } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { Card, PageHeader, Button, Badge, SearchInput, NumberInput, Skeleton, ErrorState, Stat, Segmented, Alert, cx } from "@/app/_components/ui";
import { Toolbar } from "@/app/_components/table";
import { useConfirm, useToast } from "@/app/_components/overlay";
import { Check, FloppyDisk, Printer, X, ClipboardText, Warning, ListChecks, TrendUp, TrendDown } from "@/app/_components/icons";

export default function InventoryDetail({ params }) {
  const { id } = use(params);
  const { data: inv, error, reload } = useApi(`/api/inventory/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!inv) return <Skeleton className="h-96" />;
  // remontare la fiecare versiune a documentului -> cantitatile pornesc din server
  return <InventoryView key={`${inv._id}-${inv.updatedAt}`} inv={inv} reload={reload} />;
}

function InventoryView({ inv, reload }) {
  const id = inv._id;
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [counts, setCounts] = useState(() => Object.fromEntries(inv.items.map((l) => [String(l.product), l.counted == null ? "" : String(l.counted)])));
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState("all");
  const [busy, setBusy] = useState(null);

  // avertizare la parasirea paginii cu modificari nesalvate
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inv.items
      .map((l) => {
        const c = counts[String(l.product)];
        const counted = c === "" || c === undefined ? null : Number(c);
        const base = inv.status === "draft" ? l.current ?? l.expected : l.expected;
        return { ...l, countedVal: counted, base, diff: counted == null ? null : counted - base };
      })
      .filter((l) => !t || `${l.productName} ${l.sku || ""} ${l.barcode || ""}`.toLowerCase().includes(t))
      .filter((l) => (view === "todo" ? l.countedVal == null : view === "diff" ? l.diff != null && l.diff !== 0 : true));
  }, [inv, counts, q, view]);

  const draft = inv.status === "draft";
  const all = inv.items.map((l) => {
    const c = counts[String(l.product)];
    const counted = c === "" || c === undefined ? null : Number(c);
    const base = draft ? l.current ?? l.expected : l.expected;
    return { counted, diff: counted == null ? 0 : counted - base, cost: l.unitCost || 0 };
  });
  const countedN = all.filter((x) => x.counted != null).length;
  const surplus = all.reduce((s, x) => s + (x.diff > 0 ? x.diff : 0), 0);
  const shortage = all.reduce((s, x) => s + (x.diff < 0 ? -x.diff : 0), 0);
  const valueDiff = all.reduce((s, x) => s + x.diff * x.cost, 0);

  const payload = () => ({ items: Object.entries(counts).map(([product, counted]) => ({ product, counted })) });
  const save = async () => {
    setBusy("save");
    try {
      await apiPatch(`/api/inventory/${id}`, payload());
      setDirty(false);
      toast("Cantitățile au fost salvate");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const complete = async () => {
    if (!(await confirm({ title: "Finalizați inventarierea?", message: `Stocul pentru ${countedN} produse numărate devine exact cantitatea introdusă. Produsele nenumărate rămân neschimbate.`, confirmLabel: "Finalizează și corectează stocul" }))) return;
    setBusy("complete");
    try {
      await apiPost(`/api/inventory/${id}`, { action: "complete", items: payload().items });
      toast("Inventarierea a fost finalizată, stocul a fost corectat");
      invalidate("/api/inventory", "/api/products", "/api/stock", "/api/dashboard");
      setDirty(false);
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    if (!(await confirm({ title: "Anulați inventarierea?", message: "Stocul rămâne neschimbat.", tone: "danger", confirmLabel: "Anulează" }))) return;
    try {
      await apiPost(`/api/inventory/${id}`, { action: "cancel" });
      invalidate("/api/inventory");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/inventariere", label: "Inventariere" }}
        title={
          <span className="flex items-center gap-2.5">
            Inventarierea {inv.number}
            <Badge tone={draft ? "warn" : inv.status === "completed" ? "ok" : "neutral"} dot>
              {draft ? "În desfășurare" : inv.status === "completed" ? "Finalizată" : "Anulată"}
            </Badge>
          </span>
        }
        description={`${inv.warehouse?.name} · începută ${formatDateTime(inv.createdAt)} de ${inv.createdBy?.name || "—"}${inv.completedAt ? ` · finalizată ${formatDateTime(inv.completedAt)}` : ""}`}
        actions={
          <>
            <Button icon={Printer} onClick={() => window.print()}>
              Fișă de numărare
            </Button>
            {draft && (
              <>
                <Button variant="ghost" icon={X} onClick={cancel}>
                  Anulează
                </Button>
                <Button icon={FloppyDisk} loading={busy === "save"} disabled={!dirty} onClick={save}>
                  Salvează
                </Button>
                {isAdminUser(user) && (
                  <Button variant="primary" icon={Check} loading={busy === "complete"} disabled={!countedN} onClick={complete}>
                    Finalizează
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Numărate" icon={ListChecks} value={`${countedN} / ${inv.items.length}`} />
        <Stat label="Plusuri" icon={TrendUp} value={num(draft ? surplus : inv.summary?.surplus)} sub="unități în plus față de sistem" />
        <Stat label="Lipsuri" icon={TrendDown} tone={(draft ? shortage : inv.summary?.shortage) > 0 ? "bad" : undefined} value={num(draft ? shortage : inv.summary?.shortage)} sub="unități lipsă" />
        <Stat label="Diferență valorică" icon={ClipboardText} value={money(draft ? valueDiff : inv.summary?.valueDiff)} sub="la preț de achiziție" />
      </div>

      {draft && !isAdminUser(user) && (
        <Alert className="no-print mb-4" tone="info" icon={Warning}>
          Introduceți cantitățile numărate și salvați. Finalizarea (corectarea stocului) o face administratorul.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <Toolbar className="no-print">
          <SearchInput value={q} onChange={setQ} placeholder="Caută produs, SKU sau scanează codul…" className="w-full sm:w-80" delay={80} />
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "Toate" },
              { value: "todo", label: "Nenumărate" },
              { value: "diff", label: "Cu diferențe" },
            ]}
          />
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-left text-[12px] text-fg-3">
                <th className="px-5 py-2 font-medium">Produs</th>
                <th className="px-3 py-2 text-right font-medium">În sistem</th>
                <th className="w-40 px-3 py-2 text-right font-medium">Numărat</th>
                <th className="px-5 py-2 text-right font-medium">Diferență</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => (
                <tr key={String(l.product)} className={cx(l.diff != null && l.diff !== 0 && "bg-warn-soft/30")}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-fg">{l.productName}</div>
                    <div className="text-[12px] text-fg-3">{[l.sku, l.barcode].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-fg-2">
                    {num(l.base)} {UNIT_LABELS[l.unit]}
                  </td>
                  <td className="px-3 py-2">
                    {draft ? (
                      <NumberInput
                        value={counts[String(l.product)] ?? ""}
                        onChange={(v) => {
                          setCounts((c) => ({ ...c, [String(l.product)]: v }));
                          setDirty(true);
                        }}
                        placeholder="—"
                        className="text-right"
                        aria-label={`Cantitate numărată ${l.productName}`}
                      />
                    ) : (
                      <div className="tnum text-right text-fg">{l.counted == null ? "—" : num(l.counted)}</div>
                    )}
                  </td>
                  <td className={cx("tnum whitespace-nowrap px-5 py-2.5 text-right font-medium", l.diff > 0 ? "text-ok" : l.diff < 0 ? "text-bad" : "text-fg-4")}>
                    {l.diff == null ? "—" : `${l.diff > 0 ? "+" : ""}${num(l.diff)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="px-5 py-10 text-center text-[13px] text-fg-3">Niciun produs în această vedere.</p>}
        </div>
      </Card>
    </div>
  );
}
