"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Badge,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";

function CopyRow({ label, value }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-emerald-300">
        {value}
      </code>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast(`${label} copiat`);
        }}
      >
        Copiaza
      </Button>
    </div>
  );
}

const ENDPOINTS = [
  ["GET", "/api/make/ping", "Test conexiune"],
  ["GET", "/api/make/products", "Lista produse + stoc"],
  ["POST", "/api/make/products", "Creeaza produs"],
  ["GET", "/api/make/warehouses", "Lista depozite (id-uri)"],
  ["GET", "/api/make/orders", "Lista comenzi"],
  ["POST", "/api/make/orders", "Creeaza comanda (pending)"],
  ["POST", "/api/make/arrivals", "Receptie marfa (creste stoc)"],
];

export default function IntegrationPage() {
  const me = useUser();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [webhook, setWebhook] = useState("");
  const [base, setBase] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me?.role === "admin") {
      Promise.all([apiGet("/api/integration"), apiGet("/api/settings")])
        .then(([d, s]) => {
          setData(d);
          setWebhook(d.webhookUrl || "");
          setPublicUrl(s?.publicUrl || "");
          // Preferam URL-ul public configurat / de productie; localhost doar ca ultim resort
          setBase(d.baseUrl || window.location.origin);
        })
        .catch((e) => toast(e.message, "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-slate-500">
        Acces permis doar administratorului.
      </Card>
    );
  }

  async function saveWebhook() {
    setSaving(true);
    try {
      await apiPut("/api/settings", { makeWebhookUrl: webhook });
      toast("Webhook salvat");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function savePublicUrl() {
    setSavingUrl(true);
    try {
      const clean = publicUrl.trim().replace(/\/$/, "");
      await apiPut("/api/settings", { publicUrl: clean });
      setPublicUrl(clean);
      if (clean) setBase(clean);
      toast("URL public salvat");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Integrare Make.com"
        subtitle="Conectati CRM-ul la Make pentru a primi si trimite date automat."
      />

      <div className="space-y-6">
        {/* Date conexiune */}
        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-slate-800">
            1. Date de conexiune (pentru Make → CRM)
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            In Make folositi un modul <b>HTTP</b>. Adaugati header-ul{" "}
            <code className="rounded bg-slate-100 px-1">x-api-key</code> cu cheia
            de mai jos la fiecare cerere.
          </p>
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">
                URL de baza
              </span>
              <CopyRow label="URL" value={base} />
              {base.includes("localhost") && (
                <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
                  Acesta e URL local — Make nu se poate conecta la el. Seteaza
                  mai jos URL-ul public (ex: domeniul Vercel).
                </p>
              )}
              {/* Suprascriere URL public (pentru domeniu propriu) */}
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                  placeholder="https://crmluxstore.vercel.app"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={savePublicUrl}
                  disabled={savingUrl}
                >
                  {savingUrl ? "…" : "Seteaza URL"}
                </Button>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Cheie API (header x-api-key)
              </span>
              {data ? (
                <CopyRow label="Cheia API" value={data.apiKey} />
              ) : (
                <p className="text-sm text-slate-400">Se incarca…</p>
              )}
            </div>
          </div>
        </Card>

        {/* Endpoints */}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-slate-800">
            2. Endpoint-uri disponibile
          </h2>
          <div className="space-y-2">
            {ENDPOINTS.map(([m, path, desc]) => (
              <div
                key={m + path}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <Badge color={m === "GET" ? "blue" : "green"}>{m}</Badge>
                <code className="flex-1 text-xs text-slate-700">
                  {base}
                  {path}
                </code>
                <span className="hidden text-xs text-slate-400 sm:block">
                  {desc}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Exemplu corp pentru POST /api/make/orders:{" "}
            <code className="rounded bg-slate-100 px-1">
              {`{ "items": [{ "sku": "ABC", "warehouseId": "...", "quantity": 2 }], "customerName": "Ion" }`}
            </code>
          </p>
        </Card>

        {/* Webhook iesire */}
        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-slate-800">
            3. Webhook de iesire (CRM → Make)
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Creati in Make un scenariu cu trigger <b>Webhooks → Custom webhook</b>,
            copiati URL-ul generat si lipiti-l aici. CRM va trimite evenimente:{" "}
            <code className="rounded bg-slate-100 px-1">order.created</code>,{" "}
            <code className="rounded bg-slate-100 px-1">order.approved</code>,{" "}
            <code className="rounded bg-slate-100 px-1">product.created</code>,{" "}
            <code className="rounded bg-slate-100 px-1">arrival.created</code> etc.
          </p>
          <Field label="URL Webhook Make">
            <Input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://hook.eu2.make.com/xxxxxxxx"
            />
          </Field>
          <div className="mt-3">
            <Button onClick={saveWebhook} disabled={saving}>
              {saving ? "Se salveaza…" : "Salveaza webhook"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
