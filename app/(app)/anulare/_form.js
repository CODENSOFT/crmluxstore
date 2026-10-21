"use client";

// Casare (scoatere din stoc) — pagina de creare
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { WRITEOFF_REASONS } from "@/lib/constants";
import { Button, Select, Field, FormSection, Input } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { TrashSimple, Package } from "@/app/_components/icons";
import { DocLinesEditor, linesPayload, linesValid } from "../_stockdoc";

/** Pagina „Casare nouă” */
export function WriteoffForm() {
  const toast = useToast();
  const router = useRouter();
  const onClose = () => router.push("/anulare");
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const [whSel, setWarehouse] = useState("");
  const warehouse = whSel || (warehouses?.length ? String((warehouses.find((w) => w.isDefault) || warehouses[0])._id) : "");
  const [reasonCode, setReasonCode] = useState("damaged");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiPost("/api/writeoffs", { warehouse, reasonCode, reason, items: linesPayload(lines) });
      toast(`Casarea ${d.number} a fost înregistrată`);
      invalidate("/api/writeoffs", "/api/products", "/api/stock", "/api/dashboard");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      back={{ href: "/anulare", label: "Casări" }}
      missing={[!lines.length && "produsele casate"].filter(Boolean)}
      title="Casare nouă"
      description="Scoaterea din stoc a produselor expirate, deteriorate sau folosite intern."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="danger" size="lg" icon={TrashSimple} loading={saving} disabled={!warehouse || !linesValid(lines, { warehouse, checkStock: true, products })} onClick={save}>
            Casează produsele
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={TrashSimple} title="Document" description="Din ce depozit și de ce se scot produsele. Pierderea se calculează la prețul de achiziție.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Depozit">
            <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              {(warehouses || []).map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motiv">
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {WRITEOFF_REASONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Detalii" className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: canistră fisurată la descărcare" />
          </Field>
        </div>
        </FormSection>
        <FormSection icon={Package} title="Produse" description="Căutați sau scanați produsele. Stocul disponibil în depozit se verifică automat.">
          <div className="overflow-hidden rounded-xl border border-line">
            <DocLinesEditor lines={lines} setLines={setLines} products={products} warehouse={warehouse} checkStock />
          </div>
        </FormSection>
      </div>
    </FormPage>
  );
}

