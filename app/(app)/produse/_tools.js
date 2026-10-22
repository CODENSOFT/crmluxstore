"use client";

import { useRef, useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { invalidate, useApi } from "@/lib/useApi";
import { parseCSV, mapProductRows } from "@/lib/csvParse";
import { Button, Input, Alert, Badge, IconButton } from "@/app/_components/ui";
import { Drawer, Modal, useConfirm, useToast } from "@/app/_components/overlay";
import { UploadSimple, DownloadSimple, FileCsv, CheckCircle, Warning, Trash, PencilSimple, Check, X, Plus } from "@/app/_components/icons";

const LABELS = {
  name: "Denumire",
  sku: "SKU",
  barcode: "Cod de bare",
  category: "Categorie",
  brand: "Marcă",
  packaging: "Ambalaj",
  unit: "Unitate",
  price: "Preț",
  wholesalePrice: "Preț angro",
  costPrice: "Preț achiziție",
  minStock: "Stoc minim",
  description: "Descriere",
  warehouse: "Depozit",
  quantity: "Cantitate",
};

const TEMPLATE =
  "Denumire;SKU;Cod de bare;Categorie;Marca;Ambalaj;Unitate;Pret;Pret angro;Pret achizitie;Stoc minim;Depozit;Cantitate\n" +
  "Koch-Chemie Green Star 11 kg;KC-GS-11;4004764700038;Chimie auto;Koch-Chemie;Canistră 11 kg;buc;1450;1300;980;3;Depozit principal;12\n" +
  "FOX LINE Spumă activă 5 L;FOX-FOAM-5;;Spumă activă & detergenți;FOX LINE;Canistră 5 L;buc;420;380;260;5;Depozit principal;30\n";

export function ImportDrawer({ open, onClose }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setParsed(null);
    setFileName("");
    setResult(null);
  };

  const [reading, setReading] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      // Excel (.xlsx) se citeste pe server; CSV direct in browser
      let rows;
      if (/\.csv$|\.txt$/i.test(file.name)) rows = parseCSV(await file.text());
      else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/import/sheet", { method: "POST", body: fd });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || "Fișierul nu a putut fi citit");
        rows = j.data.rows;
      }
      setFileName(file.name);
      setResult(null);
      setParsed(mapProductRows(rows));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = await apiPost("/api/products/import", { rows: parsed.mapped });
      setResult(r);
      invalidate("/api/products", "/api/stock", "/api/categories", "/api/dashboard");
      toast(`Import finalizat: ${r.created} produse noi, ${r.updated} actualizate`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "model_import_produse.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cols = parsed ? Object.keys(parsed.mapping) : [];
  return (
    <Drawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import produse din Excel / CSV"
      description="Produsele existente se actualizează (după SKU, cod de bare sau denumire); cele noi se creează."
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>
            Închide
          </Button>
          {parsed && !result && (
            <Button variant="primary" loading={busy} disabled={!parsed.mapped.length || parsed.mapping.name === undefined && parsed.mapping.sku === undefined} onClick={run}>
              Importă {parsed.mapped.length} rânduri
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <ol className="space-y-1.5 text-[13px] text-fg-2">
          <li>1. Folosiți fișierul Excel așa cum îl aveți (.xlsx) — coloanele se recunosc singure după antet: Denumire, SKU / Cod, Preț, Categorie, Depozit, Cantitate…</li>
          <li>2. Încărcați fișierul și verificați previzualizarea: ce coloane s-au recunoscut și câte rânduri.</li>
          <li>3. Apăsați „Importă”. Produsele existente se actualizează, cele noi se creează.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
          <Button variant="primary" icon={UploadSimple} onClick={() => fileRef.current?.click()}>
            {reading ? "Se citește fișierul…" : "Alege fișierul Excel sau CSV"}
          </Button>
          <Button icon={DownloadSimple} onClick={downloadTemplate}>
            Descarcă modelul
          </Button>
        </div>

        {parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              <FileCsv size={18} className="text-fg-3" />
              <span className="font-medium text-fg">{fileName}</span> · {parsed.mapped.length} rânduri
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cols.map((k) => (
                <Badge key={k} tone="ok">
                  {LABELS[k]}
                </Badge>
              ))}
              {parsed.headers.filter((_, i) => !Object.values(parsed.mapping).includes(i)).map((h) => (
                <Badge key={h} title="Coloană ignorată">
                  {h} (ignorată)
                </Badge>
              ))}
            </div>
            {parsed.mapping.name === undefined && parsed.mapping.sku === undefined && (
              <Alert tone="bad" icon={Warning}>
                Fișierul trebuie să aibă cel puțin coloana „Denumire” sau „SKU”.
              </Alert>
            )}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-surface-2/60 text-left text-fg-3">
                    {cols.map((k) => (
                      <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">
                        {LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {parsed.mapped.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      {cols.map((k) => (
                        <td key={k} className="max-w-[220px] truncate px-3 py-2 text-fg-2">
                          {r[k] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.mapped.length > 8 && <p className="text-[12px] text-fg-3">…și încă {parsed.mapped.length - 8} rânduri</p>}
          </div>
        )}

        {result && (
          <Alert tone={result.failed ? "warn" : "ok"} icon={result.failed ? Warning : CheckCircle} title={`${result.created} create · ${result.updated} actualizate · ${result.failed} erori`}>
            {result.errors?.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </div>
    </Drawer>
  );
}

export function CategoriesModal({ open, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useApi(open ? "/api/categories" : null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");

  const refresh = () => {
    reload();
    invalidate("/api/categories", "/api/products");
  };
  const add = async () => {
    if (!name.trim()) return;
    try {
      await apiPost("/api/categories", { name });
      setName("");
      refresh();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const rename = async (c) => {
    try {
      await apiPatch(`/api/categories/${c._id}`, { name: editName });
      setEditing(null);
      refresh();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: `Ștergeți categoria „${c.name}”?`, message: c.productCount ? `${c.productCount} produse vor rămâne fără categorie.` : "Categoria nu are produse.", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      await apiDelete(`/api/categories/${c._id}`);
      refresh();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Categorii de produse" description="Structura catalogului (aceeași ca pe luxstore.md)." size="md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Categorie nouă…" />
          <Button variant="primary" icon={Plus} onClick={add} disabled={!name.trim()}>
            Adaugă
          </Button>
        </div>
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {(data || []).map((c) => (
            <li key={c._id} className="flex items-center gap-2 px-3 py-2">
              {editing === c._id ? (
                <>
                  <Input focusFirst="always" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename(c)} />
                  <IconButton icon={Check} label="Salvează" size="sm" onClick={() => rename(c)} />
                  <IconButton icon={X} label="Renunță" size="sm" onClick={() => setEditing(null)} />
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.name}</span>
                  <span className="tnum text-[12px] text-fg-3">{c.productCount} produse</span>
                  <IconButton icon={PencilSimple} label="Redenumește" size="sm" onClick={() => { setEditing(c._id); setEditName(c.name); }} />
                  <IconButton icon={Trash} label="Șterge" size="sm" variant="danger-ghost" onClick={() => remove(c)} />
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
