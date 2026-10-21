"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { Card, CardHeader, PageHeader, Button, Field, Input, Select, Textarea, Switch, ButtonLink } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { TrayArrowDown, Package, Truck } from "@/app/_components/icons";
import { DocLinesEditor, linesPayload, linesValid } from "../../_stockdoc";

function NewArrival() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const { data: suppliers } = useApi("/api/suppliers");
  const [whSel, setWarehouse] = useState("");
  const warehouse = whSel || (warehouses?.length ? String((warehouses.find((w) => w.isDefault) || warehouses[0])._id) : "");
  // ?supplier=ID (ex: dupa „+ furnizor nou” sau din pagina furnizorului)
  const [supplierId, setSupplierId] = useState(() => sp.get("supplier") || "");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
  const [note, setNote] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  // ?product=ID -> produsul preselectat (cat timp utilizatorul nu a modificat lista)
  const [linesState, setLines] = useState(null);
  const pre = sp.get("product") && products ? products.find((x) => String(x._id) === sp.get("product")) : null;
  const lines = linesState ?? (pre ? [{ key: "pre", product: pre, quantity: "1", unitCost: pre.costPrice ? String(pre.costPrice) : "" }] : []);
  const [saving, setSaving] = useState(false);


  const save = async () => {
    setSaving(true);
    try {
      const doc = await apiPost("/api/arrivals", {
        warehouse,
        supplierId: supplierId || undefined,
        supplierInvoice,
        supplierInvoiceDate: supplierInvoiceDate || undefined,
        note,
        updateCostPrice: updateCost,
        items: linesPayload(lines, true),
      });
      toast(`Recepția ${doc.number} a fost înregistrată — stocul a fost actualizat`);
      invalidate("/api/arrivals", "/api/products", "/api/stock", "/api/dashboard", "/api/suppliers");
      router.push(`/receptie/${doc._id}`);
    } catch (e) {
      toast(e.message, "error");
      setSaving(false);
    }
  };

  return (
    <div className="animate-in">
      <PageHeader back={{ href: "/receptie", label: "Recepții" }} title="Recepție nouă" description="Adăugați produsele sosite, cu cantitatea și prețul de achiziție din factura furnizorului." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader title="Produse primite" icon={Package} />
          <DocLinesEditor lines={lines} setLines={(fn) => setLines(typeof fn === "function" ? fn(lines) : fn)} products={products} withCost autoFocus />
        </Card>
        <div className="space-y-4 xl:sticky xl:top-[72px] xl:self-start">
          <Card>
            <CardHeader title="Document" icon={Truck} />
            <div className="space-y-3 px-5 pb-5">
              <Field label="Depozit de destinație" required>
                <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                  {(warehouses || []).map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Furnizor" aside={<ButtonLink href="/furnizori/nou?next=/receptie/nou" size="xs" variant="link">+ furnizor nou</ButtonLink>}>
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Fără furnizor</option>
                  {(suppliers || []).map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nr. factură furnizor">
                  <Input value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} placeholder="FV-0001" />
                </Field>
                <Field label="Data facturii">
                  <Input type="date" value={supplierInvoiceDate} onChange={(e) => setSupplierInvoiceDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Notă">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Switch checked={updateCost} onChange={setUpdateCost} label="Actualizează prețul de achiziție" description="Produsele primesc prețul din această recepție (pentru calculul marjei)." />
            </div>
            <div className="border-t border-line bg-surface-2/50 px-5 py-3.5">
              <Button variant="primary" size="lg" full icon={TrayArrowDown} loading={saving} disabled={!warehouse || !linesValid(lines)} onClick={save}>
                Înregistrează recepția
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function NewArrivalPage() {
  return (
    <Suspense>
      <NewArrival />
    </Suspense>
  );
}
