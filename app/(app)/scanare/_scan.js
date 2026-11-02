"use client";

// Ecranul de scanare: merge cu orice scaner USB / Bluetooth în modul „tastatură” (codul + Enter),
// cu camera telefonului și cu fișierele exportate de terminale (CSV / TXT).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/app/_components/link";
import { apiGet, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { num } from "@/lib/format";
import { UNIT_LABELS, WRITEOFF_REASONS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { useUser } from "@/app/_components/user";
import { useToast } from "@/app/_components/overlay";
import { Card, CardHeader, Button, Field, Input, NumberInput, Select, Segmented, Badge, Alert, EmptyState, Spinner, cx } from "@/app/_components/ui";
import {
  Barcode, Camera, Trash, Minus, Plus, SpeakerHigh, SpeakerSlash, FileArrowUp, MagnifyingGlass, TrayArrowDown, TrashSimple, ArrowsLeftRight,
  ClipboardText, Receipt, ListChecks, CheckCircle, WarningCircle, Package, PaperPlaneTilt,
} from "@/app/_components/icons";
import { CameraScanner, cameraSupported } from "./_camera";

export const OPS = [
  { key: "lookup", label: "Verificare", icon: MagnifyingGlass, text: "Prețul și stocul produsului, fără a modifica nimic." },
  { key: "arrival", label: "Recepție", icon: TrayArrowDown, text: "Marfa scanată intră în stocul depozitului ales." },
  { key: "writeoff", label: "Casare", icon: TrashSimple, perm: "stock.writeoff", text: "Produsele scanate se scot din stoc (deteriorate, expirate…)." },
  { key: "transfer", label: "Transfer", icon: ArrowsLeftRight, perm: "stock.transfer", text: "Marfa scanată se mută dintr-un depozit în altul." },
  { key: "inventory", label: "Inventariere", icon: ClipboardText, perm: "stock.inventory", text: "Cantitățile numărate se trec în fișa de inventariere." },
  { key: "picking", label: "Pregătire comandă", icon: Receipt, text: "Verificați că ați pus în colet exact produsele comandate." },
  { key: "list", label: "Listă", icon: ListChecks, text: "Doar o listă de coduri (de ex. pentru verificare ulterioară)." },
];

const DRAFT_KEY = "lux.scan.draft";

// Bip scurt la scanare (reușit / cod necunoscut)
let audioCtx = null;
function beep(ok) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 320;
    o.type = ok ? "sine" : "square";
    g.gain.value = 0.06;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25));
    navigator.vibrate?.(ok ? 40 : [80, 60, 80]);
  } catch {
    /* fara sunet */
  }
}

// „5*4840000000001” sau „4840000000001*5” = 5 bucăți
function parseScan(raw, defQty) {
  const t = String(raw || "").trim().replace(/\s+/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)[*xX](.+)$/) || null;
  if (m && m[2].length >= 3) return { code: m[2], qty: Number(m[1].replace(",", ".")) };
  const m2 = t.match(/^(.+?)[*](\d+(?:[.,]\d+)?)$/);
  if (m2) return { code: m2[1], qty: Number(m2[2].replace(",", ".")) };
  return { code: t, qty: defQty };
}

/** Citește fișierul exportat de scaner: „cod;cantitate” / „cod,cantitate” / „cod<TAB>cantitate” / doar „cod” pe linie */
export function parseScanFile(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = [";", "\t", ","].find((d) => lines.slice(0, 20).some((l) => l.includes(d))) || null;
  const rows = lines.map((l) => (delim ? l.split(delim) : [l]).map((c) => c.trim().replace(/^"|"$/g, "")));
  // antet (cod / barcode / code / артикул ...) -> se sare
  let codeCol = 0;
  let qtyCol = rows[0].length > 1 ? 1 : -1;
  const head = rows[0].map((c) => c.toLowerCase());
  if (head.some((c) => /^(cod|code|barcode|ean|sku|штрих|код|артикул|cod de bare)/.test(c))) {
    codeCol = Math.max(0, head.findIndex((c) => /(bar|ean|штрих|cod de bare|^cod$|^code$|^код$)/.test(c)));
    qtyCol = head.findIndex((c) => /(cant|qty|quant|кол|count|nr|buc)/.test(c));
    rows.shift();
  }
  const out = [];
  for (const r of rows) {
    const code = (r[codeCol] || "").replace(/\s+/g, "");
    if (!code) continue;
    const q = qtyCol >= 0 && r[qtyCol] !== undefined && r[qtyCol] !== "" ? Number(String(r[qtyCol]).replace(",", ".")) : 1;
    out.push({ code, quantity: Number.isFinite(q) && q >= 0 ? q : 1 });
  }
  return out;
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

export function ScanWorkspace({ onSessionCreated }) {
  const user = useUser();
  const toast = useToast();
  const { data: warehouses } = useApi("/api/warehouses");
  const { data: ctx, reload: reloadCtx } = useApi("/api/scanner/context");
  const ops = OPS.filter((o) => !o.perm || can(user, o.perm));

  const [draft] = useState(loadDraft);
  const [op, setOp] = useState(draft?.op && ops.some((o) => o.key === draft.op) ? draft.op : "lookup");
  const [whSel, setWh] = useState(draft?.warehouse || "");
  const [toWhSel, setToWh] = useState(draft?.toWarehouse || "");
  const [orderId, setOrderId] = useState(draft?.orderId || "");
  const [inventoryId, setInventoryId] = useState(draft?.inventoryId || "");
  const [mode, setMode] = useState(draft?.mode || "set");
  const [reasonCode, setReasonCode] = useState(draft?.reasonCode || "damaged");
  const [lines, setLines] = useState(() => (Array.isArray(draft?.lines) ? draft.lines.map((l) => ({ ...l, status: l.status === "loading" ? "pending" : l.status })) : []));
  const [qty, setQty] = useState("1");
  const [code, setCode] = useState("");
  const [sound, setSound] = useState(draft?.sound !== false);
  const [camera, setCamera] = useState(false);
  const [lookup, setLookup] = useState(null); // ultimul rezultat in modul „Verificare”
  const [busy, setBusy] = useState(false);
  const [fromFile, setFromFile] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const cache = useRef(new Map()); // cod -> rezultat lookup

  const wh = whSel || (warehouses?.[0] ? String(warehouses[0]._id) : "");
  const toWh = toWhSel || (warehouses?.find((w) => String(w._id) !== wh) ? String(warehouses.find((w) => String(w._id) !== wh)._id) : "");
  const order = ctx?.orders?.find((o) => String(o._id) === orderId) || null;
  const opInfo = OPS.find((o) => o.key === op) || OPS[0];

  // ciorna se pastreaza la reincarcarea paginii (ex: s-a inchis tabul din greseala)
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ op, warehouse: whSel, toWarehouse: toWhSel, orderId, inventoryId, mode, reasonCode, sound, lines: lines.slice(0, 2000) }));
    } catch {
      /* stocare indisponibila */
    }
  }, [op, whSel, toWhSel, orderId, inventoryId, mode, reasonCode, sound, lines]);

  const resolve = async (c) => {
    if (cache.current.has(c)) return cache.current.get(c);
    const r = await apiGet(`/api/scanner/lookup?code=${encodeURIComponent(c)}${wh ? `&warehouse=${wh}` : ""}`);
    cache.current.set(c, r);
    return r;
  };

  const addScan = async (raw, q = Number(qty) || 1) => {
    const s = parseScan(raw, q);
    if (!s || !(s.qty >= 0)) return;
    if (op === "lookup") {
      setLookup({ loading: true, code: s.code });
      try {
        cache.current.delete(s.code);
        const r = await resolve(s.code);
        setLookup(r);
        if (sound) beep(r.found);
      } catch (e) {
        setLookup({ found: false, code: s.code, error: e.message });
        if (sound) beep(false);
      }
      return;
    }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.code === s.code);
      if (i >= 0) {
        const cur = { ...ls[i], qty: Math.round((ls[i].qty + s.qty) * 10000) / 10000, at: Date.now() };
        return [cur, ...ls.slice(0, i), ...ls.slice(i + 1)];
      }
      return [{ code: s.code, qty: s.qty, status: "loading", at: Date.now() }, ...ls];
    });
    try {
      const r = await resolve(s.code);
      setLines((ls) => ls.map((l) => (l.code === s.code ? { ...l, status: r.found ? "ok" : "unknown", name: r.product?.name, sku: r.product?.sku, unit: r.product?.unit, productId: r.product?.id, multiplier: r.multiplier || 1, stock: r.product?.quantityInWarehouse } : l)));
      if (sound) beep(r.found);
    } catch {
      setLines((ls) => ls.map((l) => (l.code === s.code ? { ...l, status: "pending" } : l)));
      if (sound) beep(false);
    }
  };
  const addScanRef = useRef(addScan);
  useEffect(() => {
    addScanRef.current = addScan;
  });

  // Scanerele „tastatură” trimit codul foarte repede + Enter. Prindem codul și când nu e focus pe câmp.
  useEffect(() => {
    let buf = "";
    let lastAt = 0;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      const now = Date.now();
      if (now - lastAt > 60) buf = "";
      lastAt = now;
      if (e.key === "Enter" || e.key === "Tab") {
        if (buf.length >= 3) {
          e.preventDefault();
          addScanRef.current(buf);
        }
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submitInput = (e) => {
    e?.preventDefault();
    const v = code;
    setCode("");
    addScan(v);
    inputRef.current?.focus();
  };

  const setLineQty = (c, v) => setLines((ls) => ls.map((l) => (l.code === c ? { ...l, qty: v } : l)));
  const removeLine = (c) => setLines((ls) => ls.filter((l) => l.code !== c));
  const clear = () => {
    setLines([]);
    setFromFile(false);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rows = parseScanFile(await f.text());
    if (!rows.length) return toast("Fișierul nu conține coduri", "error");
    if (op === "lookup") setOp("list");
    const agg = new Map();
    for (const r of rows) agg.set(r.code, Math.round(((agg.get(r.code) || 0) + r.quantity) * 10000) / 10000);
    setLines(() => [...agg].map(([c, q]) => ({ code: c, qty: q, status: "loading", at: Date.now() })));
    setFromFile(true);
    toast(`${rows.length} linii citite din ${f.name}`);
    // recunoastere in loturi mici (lookup pe cod)
    const codes = [...agg.keys()];
    for (let i = 0; i < codes.length; i += 8) {
      await Promise.all(
        codes.slice(i, i + 8).map(async (c) => {
          try {
            const r = await resolve(c);
            setLines((ls) => ls.map((l) => (l.code === c ? { ...l, status: r.found ? "ok" : "unknown", name: r.product?.name, sku: r.product?.sku, unit: r.product?.unit, productId: r.product?.id, multiplier: r.multiplier || 1 } : l)));
          } catch {
            setLines((ls) => ls.map((l) => (l.code === c ? { ...l, status: "pending" } : l)));
          }
        })
      );
    }
  };

  const unknown = lines.filter((l) => l.status === "unknown").length;
  const totalQty = lines.reduce((t, l) => t + (Number(l.qty) || 0) * (l.multiplier || 1), 0);

  // Pregatire comanda: comparatie in timp real cu liniile comenzii
  const picking = useMemo(() => {
    if (op !== "picking" || !order) return null;
    const got = new Map();
    for (const l of lines) if (l.productId) got.set(String(l.productId), (got.get(String(l.productId)) || 0) + (Number(l.qty) || 0) * (l.multiplier || 1));
    const rows = order.items.map((i) => ({ ...i, picked: Math.round((got.get(String(i.productId)) || 0) * 10000) / 10000 }));
    const ids = new Set(order.items.map((i) => String(i.productId)));
    const extra = lines.filter((l) => l.productId && !ids.has(String(l.productId)));
    return { rows, extra, complete: rows.every((r) => r.picked === Number(r.quantity)) && !extra.length && !unknown };
  }, [op, order, lines, unknown]);

  const missing = [
    !lines.length && "scanați cel puțin un cod",
    ["arrival", "writeoff", "transfer", "inventory"].includes(op) && !wh && !inventoryId && "depozitul",
    op === "transfer" && wh === toWh && "depozite diferite",
    op === "picking" && !orderId && "comanda",
    lines.some((l) => l.status === "loading") && "așteptați recunoașterea codurilor",
  ].filter(Boolean);

  const submit = async (apply) => {
    setBusy(true);
    try {
      const inv = ctx?.inventories?.find((i) => String(i.id) === inventoryId);
      const s = await apiPost("/api/scanner/sessions", {
        operation: op,
        warehouse: op === "inventory" && inv ? inv.warehouseId : wh || undefined,
        toWarehouse: op === "transfer" ? toWh : undefined,
        orderId: op === "picking" ? orderId : undefined,
        inventoryId: op === "inventory" && inventoryId ? inventoryId : undefined,
        options: { mode, reasonCode: op === "writeoff" ? reasonCode : undefined },
        device: "CRM (browser)",
        source: fromFile ? "file" : "crm",
        items: lines.map((l) => ({ code: l.code, quantity: Number(l.qty) || 0 })),
        apply,
      });
      clear();
      invalidate("/api/scanner", "/api/products", "/api/stock", "/api/inventory", "/api/orders");
      reloadCtx();
      if (s.status === "applied") {
        const r = s.result || {};
        toast(r.docType === "order" ? (r.complete ? `Comanda ${r.number} este completă${r.markedReady ? " — trecută la „Gata de livrare”" : ""}` : `Comanda ${r.number}: există diferențe`) : `${s.number} aplicată${r.number ? ` → ${r.number}` : ""}`);
        if (r.docType === "order" && !r.complete) onSessionCreated?.(s);
      } else {
        toast(s.applyError ? `${s.number} salvată, dar nu s-a putut aplica: ${s.applyError}` : `${s.number} salvată pentru verificare`, s.applyError ? "error" : undefined);
        onSessionCreated?.(s);
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const whSelect = (value, onChange, label = "Depozit") => (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {(warehouses || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-fg-4">Ce scanați</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ops.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setOp(o.key);
                  setLookup(null);
                }}
                className={cx(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium ring-1 ring-inset transition-colors",
                  op === o.key ? "bg-accent-soft text-accent ring-accent/40" : "text-fg-2 ring-line hover:bg-surface-2"
                )}
              >
                <o.icon size={16} className="shrink-0" />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-fg-3">{opInfo.text}</p>
        </Card>

        {op !== "list" && (
          <Card className="space-y-3 p-4">
            {op === "lookup" && whSelect(wh, setWh, "Stocul din depozitul")}
            {(op === "arrival" || op === "writeoff") && whSelect(wh, setWh)}
            {op === "writeoff" && (
              <Field label="Motivul casării">
                <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  {WRITEOFF_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </Select>
              </Field>
            )}
            {op === "transfer" && (
              <>
                {whSelect(wh, setWh, "Din depozitul")}
                {whSelect(toWh, setToWh, "În depozitul")}
              </>
            )}
            {op === "inventory" && (
              <>
                <Field label="Fișa de inventariere" hint={inventoryId ? undefined : "Se creează o fișă nouă pentru depozitul ales."}>
                  <Select value={inventoryId} onChange={(e) => setInventoryId(e.target.value)}>
                    <option value="">Fișă nouă</option>
                    {(ctx?.inventories || []).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.warehouseName}</option>)}
                  </Select>
                </Field>
                {!inventoryId && whSelect(wh, setWh)}
                <Field label="Cantitățile scanate">
                  <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={mode} onChange={setMode} options={[{ value: "set", label: "Înlocuiesc" }, { value: "add", label: "Se adună" }]} />
                </Field>
                <p className="text-[12px] text-fg-4">„Se adună” — pentru numărarea pe zone / mai mulți oameni pe aceeași fișă.</p>
              </>
            )}
            {op === "picking" && (
              <Field label="Comanda" hint={ctx && !ctx.orders.length ? "Nu sunt comenzi „În lucru” de pregătit." : undefined}>
                <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">Alegeți comanda…</option>
                  {(ctx?.orders || []).map((o) => <option key={o._id} value={o._id}>{o.number}{o.customerName ? ` · ${o.customerName}` : ""}</option>)}
                </Select>
              </Field>
            )}
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium uppercase tracking-wide text-fg-4">Alte moduri</div>
            <button type="button" onClick={() => setSound((s) => !s)} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-fg-3 hover:bg-surface-2" aria-label="Sunet">
              {sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />} {sound ? "Sunet pornit" : "Fără sunet"}
            </button>
          </div>
          <div className="mt-2 grid gap-2">
            <Button icon={Camera} onClick={() => setCamera(true)} title={cameraSupported() ? undefined : "Browserul nu suportă camera — se va afișa explicația"}>Scanează cu camera</Button>
            {op !== "lookup" && (
              <>
                <Button icon={FileArrowUp} onClick={() => fileRef.current?.click()}>Încarcă fișier de la scaner</Button>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" className="hidden" onChange={onFile} />
                <p className="text-[12px] text-fg-4">CSV / TXT: un cod pe linie sau „cod;cantitate”.</p>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className="p-4">
          <form onSubmit={submitInput} className="flex flex-wrap items-end gap-2">
            <Field label="Cod de bare / SKU" className="min-w-[220px] flex-1" hint="Scanerul tastează codul și apasă Enter. Puteți scrie și „5*cod” pentru 5 bucăți.">
              <Input ref={inputRef} focusFirst="always" value={code} onChange={(e) => setCode(e.target.value)} prefix={<Barcode size={17} />} placeholder="Scanați sau tastați codul…" autoComplete="off" inputMode="text" className="h-11 font-mono text-[15px]" />
            </Field>
            {op !== "lookup" && (
              <Field label="Cantitate" className="w-[110px]">
                <NumberInput value={qty} onChange={setQty} className="h-11 text-center text-[15px]" />
              </Field>
            )}
            <Button type="submit" variant="primary" size="lg" className="h-11" disabled={!code.trim()}>Adaugă</Button>
          </form>
        </Card>

        {op === "lookup" ? (
          <LookupResult r={lookup} />
        ) : (
          <>
            {picking && <PickingPanel picking={picking} order={order} />}
            <Card className="overflow-hidden">
              <CardHeader
                title={`Coduri scanate${lines.length ? ` · ${lines.length}` : ""}`}
                description={lines.length ? `Total ${num(totalQty)} unități${unknown ? ` · ${unknown} coduri necunoscute` : ""}` : "Scanați produsele — fiecare cod apare aici."}
                icon={Barcode}
                action={lines.length > 0 && <Button size="sm" variant="ghost" icon={Trash} onClick={clear}>Golește</Button>}
              />
              {lines.length ? (
                <ul className="divide-y divide-line border-t border-line">
                  {lines.map((l) => (
                    <li key={l.code} className={cx("flex items-center gap-3 px-4 py-2.5", l.status === "unknown" && "bg-warn-soft/40")}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
                        {l.status === "loading" ? <Spinner size={14} /> : l.status === "ok" ? <CheckCircle size={17} className="text-ok" /> : <WarningCircle size={17} className="text-warn" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium text-fg">{l.status === "ok" ? l.name : l.status === "unknown" ? "Cod necunoscut" : l.status === "pending" ? "Nerecunoscut încă (fără conexiune?)" : "Se caută…"}</div>
                        <div className="truncate font-mono text-[12px] text-fg-3">
                          {l.code}
                          {l.sku && l.sku !== l.code ? ` · ${l.sku}` : ""}
                          {l.multiplier > 1 ? ` · bax × ${num(l.multiplier)} = ${num((Number(l.qty) || 0) * l.multiplier)} ${UNIT_LABELS[l.unit] || ""}` : ""}
                          {op === "writeoff" || op === "transfer" ? (l.stock != null ? ` · în stoc ${num(l.stock)}` : "") : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="xs" variant="ghost" icon={Minus} aria-label="Minus" onClick={() => setLineQty(l.code, Math.max(0, (Number(l.qty) || 0) - 1))} />
                        <NumberInput value={String(l.qty)} onChange={(v) => setLineQty(l.code, v)} className="h-8 w-[72px] text-center" aria-label="Cantitate" />
                        <Button size="xs" variant="ghost" icon={Plus} aria-label="Plus" onClick={() => setLineQty(l.code, (Number(l.qty) || 0) + 1)} />
                        <Button size="xs" variant="ghost" icon={Trash} aria-label="Elimină" onClick={() => removeLine(l.code)} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={Barcode} title="Niciun cod scanat" description="Scanerul USB / Bluetooth funcționează imediat: scanați produsul și codul apare aici." />
              )}
            </Card>
            {lines.length > 0 && (
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-[12.5px] text-fg-3">
                  {missing.length ? <>Lipsește: {missing.join(", ")}</> : unknown ? `${unknown} coduri necunoscute — sesiunea se salvează, iar codurile se leagă de produse la verificare.` : op === "list" ? "Lista se salvează în Sesiuni." : "Gata de trimis."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {op !== "list" && op !== "picking" && (
                    <Button icon={PaperPlaneTilt} loading={busy} disabled={missing.length > 0} onClick={() => submit(false)}>Salvează pentru verificare</Button>
                  )}
                  <Button variant="primary" icon={CheckCircle} loading={busy} disabled={missing.length > 0} onClick={() => submit(op !== "list" && !unknown)}>
                    {op === "list" ? "Salvează lista" : op === "picking" ? "Verifică comanda" : unknown ? "Salvează (are coduri necunoscute)" : "Aplică acum"}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      <CameraScanner open={camera} onClose={() => { setCamera(false); inputRef.current?.focus(); }} onCode={(c) => addScanRef.current(c)} />
    </div>
  );
}

function LookupResult({ r }) {
  if (!r) return <Card><EmptyState icon={MagnifyingGlass} title="Scanați un produs" description="Afișăm prețul, stocul pe depozite și codurile produsului." /></Card>;
  if (r.loading) return <Card className="flex items-center gap-3 p-6 text-fg-3"><Spinner /> Se caută {r.code}…</Card>;
  if (!r.found)
    return (
      <Alert tone="warn" icon={WarningCircle} title={`Codul ${r.code} nu există în CRM`}>
        {r.error || "Adăugați codul la produs (Produse → produsul → Coduri de bare) sau verificați că a fost scanat corect."}
      </Alert>
    );
  const p = r.product;
  return (
    <Card className="p-5">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.photoUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl bg-surface-2 object-cover ring-1 ring-line" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        <div className="min-w-0 flex-1">
          <Link href={`/produse/${p.id}`} className="text-[16px] font-semibold text-fg hover:text-accent">{p.name}</Link>
          <div className="mt-0.5 font-mono text-[12.5px] text-fg-3">{[p.sku, p.barcode].filter(Boolean).join(" · ")}</div>
          {!p.active && <Badge tone="bad" className="mt-1">Inactiv</Badge>}
          {r.multiplier > 1 && <Badge tone="info" className="mt-1">Cod de bax: × {num(r.multiplier)}</Badge>}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <div><div className="text-[12px] text-fg-4">Preț</div><div className="tnum text-[20px] font-semibold text-fg">{num(p.price, 2)} MDL</div></div>
            {p.wholesalePrice > 0 && <div><div className="text-[12px] text-fg-4">Angro</div><div className="tnum text-[20px] font-semibold text-fg-2">{num(p.wholesalePrice, 2)} MDL</div></div>}
            {p.quantityInWarehouse != null && <div><div className="text-[12px] text-fg-4">În depozitul ales</div><div className={cx("tnum text-[20px] font-semibold", p.quantityInWarehouse > 0 ? "text-ok" : "text-bad")}>{num(p.quantityInWarehouse)} {UNIT_LABELS[p.unit] || ""}</div></div>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {p.stock.map((s) => (
          <div key={s.warehouseId} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
            <span className="text-fg-2">{s.warehouseName}</span>
            <span className={cx("tnum font-medium", s.quantity > 0 ? "text-fg" : "text-fg-4")}>{num(s.quantity)}</span>
          </div>
        ))}
      </div>
      {p.extraBarcodes?.length > 0 && (
        <div className="mt-3 text-[12.5px] text-fg-3">
          Coduri suplimentare: <span className="font-mono">{p.extraBarcodes.map((b) => (b.multiplier > 1 ? `${b.code} (×${num(b.multiplier)})` : b.code)).join(", ")}</span>
        </div>
      )}
    </Card>
  );
}

function PickingPanel({ picking, order }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Comanda ${order.number}`}
        description={picking.complete ? "Tot ce s-a comandat a fost scanat." : "Bifați scanând fiecare produs din comandă."}
        icon={Package}
        action={<Badge tone={picking.complete ? "ok" : "warn"} dot>{picking.complete ? "Completă" : "În pregătire"}</Badge>}
      />
      <ul className="divide-y divide-line border-t border-line">
        {picking.rows.map((r) => {
          const done = r.picked === Number(r.quantity);
          const over = r.picked > Number(r.quantity);
          return (
            <li key={r.productId} className="flex items-center gap-3 px-4 py-2">
              {done ? <CheckCircle size={18} className="shrink-0 text-ok" /> : <span className={cx("h-[18px] w-[18px] shrink-0 rounded-full ring-2 ring-inset", over ? "ring-bad" : "ring-line-strong")} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-fg">{r.name}</div>
                <div className="truncate font-mono text-[12px] text-fg-4">{r.barcode || r.sku || ""}</div>
              </div>
              <span className={cx("tnum shrink-0 text-[13.5px] font-medium", done ? "text-ok" : over ? "text-bad" : "text-fg-2")}>
                {num(r.picked)} / {num(r.quantity)}
              </span>
            </li>
          );
        })}
        {picking.extra.map((l) => (
          <li key={l.code} className="flex items-center gap-3 bg-bad-soft/40 px-4 py-2">
            <WarningCircle size={18} className="shrink-0 text-bad" />
            <div className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{l.name} — nu este în comandă</div>
            <span className="tnum text-[13.5px] font-medium text-bad">{num(l.qty)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
