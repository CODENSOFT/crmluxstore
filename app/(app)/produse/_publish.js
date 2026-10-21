"use client";

// Publicarea manuala a produselor pe site (luxstore.md). Nimic nu se publica automat.
import { useState } from "react";
import { apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { Button, Alert, Badge } from "@/app/_components/ui";
import { Modal, useToast } from "@/app/_components/overlay";
import { Globe, CheckCircle, WarningCircle } from "@/app/_components/icons";

export function usePublishInfo(enabled) {
  return useApi(enabled ? "/api/products/publish" : null);
}

export function PublishModal({ open, onClose, ids, title, onDone }) {
  const toast = useToast();
  const { data: info } = useApi(open ? "/api/products/publish" : null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const count = ids?.length || info?.pending || 0;
  const run = async () => {
    setBusy(true);
    try {
      const r = await apiPost("/api/products/publish", { ids });
      setResult(r);
      toast(r.errors ? `Publicate: ${r.published}, cu erori: ${r.errors}` : `Publicate pe site: ${r.published}`, r.errors ? "error" : "success");
      invalidate("/api/products");
      onDone?.(r);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setResult(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title || "Publicare pe site"}
      description={info?.siteUrl ? info.siteUrl.replace(/^https?:\/\//, "") : null}
      footer={
        result ? (
          <Button variant="primary" onClick={close}>Închide</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Renunță</Button>
            <Button variant="primary" icon={Globe} loading={busy} disabled={!info?.configured || !count} onClick={run}>
              {ids?.length === 1 ? "Publică acum" : `Publică ${count} produse`}
            </Button>
          </>
        )
      }
    >
      {!info ? null : !info.configured ? (
        <Alert tone="warn" icon={WarningCircle} title="Site-ul nu este conectat">
          Administratorul principal trebuie să completeze cheile WooCommerce în Integrări → Site luxstore.md.
        </Alert>
      ) : result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[14px] font-medium text-fg">
            <CheckCircle size={20} weight="fill" className="text-ok" /> Publicate: {result.published} (noi: {result.created})
          </div>
          {result.results.filter((r) => !r.ok).map((r) => (
            <div key={r.product} className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
              <b>{r.name}</b>: {r.error}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 text-[13.5px] text-fg-2">
          <p>
            {ids?.length
              ? "Produsul se publică (sau se actualizează) pe site:"
              : <>Se vor publica pe site <Badge tone="accent">{count}</Badge> produse active care încă nu sunt acolo:</>}
          </p>
          <ul className="list-inside list-disc space-y-1 text-fg-3">
            <li>denumire, preț, descriere, categorie și cod (SKU)</li>
            <li>fotografia (la produsele noi)</li>
            <li>stocul din depozitele marcate „stoc pe site”</li>
          </ul>
          <p className="text-[12.5px] text-fg-4">Produsele apar pe site imediat. Nimic nu se publică automat — doar când apăsați butonul.</p>
        </div>
      )}
    </Modal>
  );
}
