"use client";

// Coduri de bare suplimentare: alte ambalaje, coduri vechi ale furnizorului, coduri de bax (cu multiplicator)
import { useState } from "react";
import { apiDelete, apiPost } from "@/lib/client";
import { useApi } from "@/lib/useApi";
import { num } from "@/lib/format";
import { Card, CardHeader, Button, Input, NumberInput, Badge } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { Barcode, Plus, Trash } from "@/app/_components/icons";

export function BarcodesCard({ product, manage }) {
  const toast = useToast();
  const { data, mutate } = useApi(`/api/products/${product._id}/barcodes`);
  const [code, setCode] = useState("");
  const [mult, setMult] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      mutate(await apiPost(`/api/products/${product._id}/barcodes`, { code, multiplier: mult, note }));
      setCode("");
      setMult("1");
      setNote("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c) => {
    try {
      await apiDelete(`/api/products/${product._id}/barcodes?code=${encodeURIComponent(c)}`);
      mutate((list) => (list || []).filter((b) => b.code !== c));
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <Card>
      <CardHeader title="Coduri de bare" icon={Barcode} description="Codul principal + coduri suplimentare recunoscute la scanare" />
      <ul className="divide-y divide-line border-t border-line text-[13px]">
        <li className="flex items-center justify-between gap-3 px-5 py-2.5">
          <span className="font-mono text-fg">{product.barcode || "—"}</span>
          <Badge tone="accent">principal</Badge>
        </li>
        {(data || []).map((b) => (
          <li key={b.code} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <span className="font-mono text-fg">{b.code}</span>
              {b.note && <span className="ml-2 text-fg-3">{b.note}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {b.multiplier !== 1 && <Badge tone="info">bax × {num(b.multiplier)}</Badge>}
              {manage && <Button size="xs" variant="ghost" icon={Trash} aria-label="Șterge codul" onClick={() => remove(b.code)} />}
            </div>
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scanați / tastați codul" className="min-w-[150px] flex-1 font-mono" autoComplete="off" />
          <NumberInput value={mult} onChange={setMult} className="w-[64px] text-center" title="Câte bucăți conține (pentru bax / cutie)" aria-label="Multiplicator" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notă (opțional)" className="w-[130px]" />
          <Button type="submit" size="sm" icon={Plus} loading={busy} disabled={!code.trim()}>Adaugă</Button>
        </form>
      )}
    </Card>
  );
}
