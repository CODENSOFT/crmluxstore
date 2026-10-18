"use client";

import { Suspense, useState } from "react";
import { apiDelete, apiPatch, apiPost, apiPut } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { formatDateTime, relativeTime, num } from "@/lib/format";
import { WEBHOOK_EVENTS } from "@/lib/constants";
import {
  Card, CardHeader, PageHeader, Tabs, Button, Field, Input, PasswordInput, Select, Switch, Badge, Alert, EmptyState, Skeleton, Checkbox, Segmented, cx, Dot, FormSection,
} from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Modal, Drawer, Menu, useConfirm, useToast } from "@/app/_components/overlay";
import {
  Globe, Key, WebhooksLogo, Database, Copy, Check, ArrowsClockwise, PaperPlaneTilt, Plus, Trash, DotsThree, CheckCircle, WarningCircle, DownloadSimple, BookOpen,
  Lightning, ShieldCheck, ArrowRight, Info, Code, ListChecks, Prohibit, } from "@/app/_components/icons";

function CopyField({ label, value, secret, hint }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(!secret);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponibil */
    }
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-1.5">
        <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-line bg-surface-2 px-3 font-mono text-[12.5px] text-fg">
          <span className="truncate">{show ? value || "—" : "•".repeat(Math.min(32, value?.length || 8))}</span>
        </div>
        {secret && <Button variant="secondary" onClick={() => setShow((s) => !s)}>{show ? "Ascunde" : "Arată"}</Button>}
        <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy} disabled={!value} aria-label="Copiază">
          {copied ? "Copiat" : ""}
        </Button>
      </div>
    </Field>
  );
}

function StatusPill({ ok, okText, badText }) {
  return <Badge tone={ok ? "ok" : "neutral"} dot>{ok ? okText : badText}</Badge>;
}

/* ================= Prezentare ================= */
function Overview({ go }) {
  const { data: o } = useApi("/api/integrations/overview");
  if (!o) return <Skeleton className="h-80" />;
  const cards = [
    {
      key: "site",
      icon: Globe,
      title: "Site luxstore.md",
      text: "Comenzile de pe site intră automat în CRM; stocul și statusurile se pot publica înapoi pe site.",
      status: <StatusPill ok={o.woo.enabled && o.woo.configured} okText="Conectat" badText={o.woo.configured ? "Dezactivat" : "Neconfigurat"} />,
      meta: `${num(o.woo.siteOrders)} comenzi importate · ${num(o.woo.linkedProducts)} produse legate${o.woo.lastOrderSyncAt ? ` · sincronizat ${relativeTime(o.woo.lastOrderSyncAt)}` : ""}`,
    },
    {
      key: "1c",
      icon: Database,
      title: "1C (contabilitate)",
      text: "API pregătit: catalog, prețuri, stocuri, clienți, comenzi și recepții. Documentația e gata pentru programatorul 1C.",
      status: <StatusPill ok={o.onec.keys > 0 && !!o.onec.lastUsedAt} okText="Activ" badText={o.onec.keys ? "Cheie creată, neutilizată" : "Pregătit"} />,
      meta: `${num(o.onec.productsMapped)}/${num(o.onec.productsTotal)} produse cu cod 1C · ${num(o.onec.notExported)} comenzi de preluat`,
    },
    {
      key: "api",
      icon: Key,
      title: "API și chei de acces",
      text: "Chei separate pentru fiecare sistem extern, cu drepturi de citire / scriere și jurnal de utilizare.",
      status: <StatusPill ok={o.api.activeKeys > 0} okText={`${o.api.activeKeys} chei active`} badText="Nicio cheie" />,
      meta: `Adresa API: ${o.baseUrl}/api/v1`,
    },
    {
      key: "webhooks",
      icon: WebhooksLogo,
      title: "Webhook-uri (notificări către alte sisteme)",
      text: "CRM-ul trimite evenimente semnate (comandă nouă, stoc modificat…) către orice adresă — de ex. un bot sau 1C.",
      status: <StatusPill ok={o.api.webhooks > 0} okText={`${o.api.webhooks} active`} badText="Niciunul" />,
      meta: "Semnătură HMAC-SHA256 · reîncercare automată",
    },
  ];
  return (
    <div className="space-y-4">
      <Alert tone="accent" icon={Lightning} title="Toate conexiunile rulează direct din CRM">
        Nu mai este nevoie de Make sau alte servicii intermediare: site-ul, 1C și orice alt sistem comunică direct cu CRM-ul prin API-ul și webhook-urile de mai jos.
        Scenariile vechi din Make pot fi oprite.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.key} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <c.icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-fg">{c.title}</h3>
                  {c.status}
                </div>
                <p className="mt-1 text-[13px] text-fg-3">{c.text}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="min-w-0 truncate text-[12.5px] text-fg-3">{c.meta}</span>
              <Button size="sm" iconRight={ArrowRight} onClick={() => go(c.key)}>
                Configurează
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================= Site (WooCommerce) ================= */
function SiteTab() {
  const { data: cfg, mutate } = useApi("/api/integrations/woo");
  if (!cfg) return <Skeleton className="h-96" />;
  return <SiteConfig cfg={cfg} mutate={mutate} />;
}

function SiteConfig({ cfg, mutate }) {
  const toast = useToast();
  const { data: warehouses } = useApi("/api/warehouses");
  const [f, setF] = useState(() => ({ ...cfg }));
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [importStock, setImportStock] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const save = async (extra = {}) => {
    setBusy("save");
    try {
      const res = await apiPut("/api/integrations/woo", { ...f, ...extra });
      mutate(res);
      setF({ ...res });
      invalidate("/api/integrations");
      toast("Configurația site-ului a fost salvată");
      return res;
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const run = async (action, body = {}, okMsg) => {
    setBusy(action);
    setResult(null);
    try {
      const r = await apiPost(`/api/integrations/woo/${action}`, body);
      setResult({ action, ok: true, data: r });
      toast(okMsg(r));
      invalidate("/api/integrations", "/api/products", "/api/orders", "/api/stock");
      mutate((x) => x);
    } catch (e) {
      setResult({ action, ok: false, error: e.message });
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Conectare la luxstore.md (WooCommerce)" description="Cheile se creează în WordPress: WooCommerce → Setări → Avansat → REST API → Adaugă cheie (permisiuni: Citire/Scriere)." icon={Globe} />
          <div className="space-y-3 px-5 pb-5">
            <Field label="Adresa site-ului">
              <Input value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://luxstore.md" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Consumer key" hint={f.hasKeys ? "Salvată — introduceți una nouă doar pentru a o schimba" : "începe cu ck_"}>
                <PasswordInput value={f.consumerKey} onChange={(e) => set({ consumerKey: e.target.value })} placeholder="ck_…" autoComplete="off" />
              </Field>
              <Field label="Consumer secret" hint="începe cu cs_">
                <PasswordInput value={f.consumerSecret} onChange={(e) => set({ consumerSecret: e.target.value })} placeholder="cs_…" autoComplete="off" />
              </Field>
            </div>
            <Field label="Depozitul pentru comenzile de pe site" hint="De aici se rezervă marfa când confirmați o comandă de pe site">
              <Select value={f.warehouse || ""} onChange={(e) => set({ warehouse: e.target.value })}>
                <option value="">Depozitul implicit</option>
                {(warehouses || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </Select>
            </Field>
            <div className="space-y-3 rounded-xl border border-line p-4">
              <Switch checked={f.enabled} onChange={(v) => set({ enabled: v })} label="Integrare activă" />
              <Switch checked={f.importOrders} onChange={(v) => set({ importOrders: v })} label="Importă automat comenzile de pe site" description="Comenzile apar instant în CRM ca „Nouă”, cu clientul creat sau găsit după telefon/email." />
              <Switch checked={f.pushStock} onChange={(v) => set({ pushStock: v })} label="Publică stocul pe site" description="La fiecare vânzare, recepție sau corecție, stocul produsului se actualizează pe site (depozitele marcate „pe site”)." />
              <Switch checked={f.pushOrderStatus} onChange={(v) => set({ pushOrderStatus: v })} label="Actualizează statusul comenzii pe site" description="Comandă finalizată / anulată în CRM → la fel pe site (clientul primește emailul WooCommerce)." />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">
            <Button loading={busy === "test"} icon={Lightning} disabled={!f.hasKeys} onClick={() => run("test", {}, (r) => `Conexiune reușită: ${r.products} produse și ${r.orders} comenzi pe site`)}>
              Testează conexiunea
            </Button>
            <Button variant="primary" loading={busy === "save"} onClick={() => save()}>
              Salvează
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sincronizare" description="Operațiuni manuale (rulează și automat zilnic, ca plasă de siguranță)." icon={ArrowsClockwise} />
          <div className="divide-y divide-line border-t border-line">
            {[
              {
                key: "setup-webhooks",
                title: "Creează automat webhook-urile pe site",
                text: "Configurează pe luxstore.md trimiterea instantă a comenzilor noi și modificate către CRM.",
                btn: "Configurează",
                msg: (r) => r.webhooks.map((w) => `${w.topic}: ${w.status === "created" ? "creat" : w.status === "exists" ? "există" : "reactivat"}`).join(", "),
              },
              { key: "sync-orders", title: "Sincronizează comenzile (ultimele 7 zile)", text: "Aduce comenzile care eventual au lipsit.", btn: "Sincronizează", body: { days: 7 }, msg: (r) => `Comenzi noi: ${r.created}, actualizate: ${r.updated}, erori: ${r.errors}`, last: cfg.lastOrderSyncAt },
              { key: "import-products", title: "Importă catalogul de pe site", text: "Creează produsele lipsă și le leagă pe cele existente după SKU. Nu modifică prețurile din CRM.", btn: "Importă", body: { importStock }, msg: (r) => `Produse noi: ${r.created}, legate: ${r.linked}`, last: cfg.lastProductImportAt, extra: <Checkbox className="mt-2" checked={importStock} onChange={setImportStock} label="Preia și stocul de pe site pentru produsele noi" /> },
              { key: "push-stock", title: "Publică acum tot stocul pe site", text: "Trimite cantitățile curente pentru toate produsele legate.", btn: "Publică", msg: (r) => `Stoc actualizat pentru ${r.updated} produse`, last: cfg.lastStockPushAt },
            ].map((a) => (
              <div key={a.key} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 max-w-xl">
                  <div className="text-[13.5px] font-medium text-fg">{a.title}</div>
                  <div className="text-[12.5px] text-fg-3">{a.text}{a.last ? ` Ultima dată: ${relativeTime(a.last)}.` : ""}</div>
                  {a.extra}
                  {result?.action === a.key && (
                    <div className={cx("mt-2 flex items-center gap-1.5 text-[12.5px]", result.ok ? "text-ok" : "text-bad")}>
                      {result.ok ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
                      {result.ok ? a.msg(result.data) : result.error}
                    </div>
                  )}
                </div>
                <Button size="sm" loading={busy === a.key} disabled={!cfg.hasKeys} onClick={() => run(a.key, a.body || {}, a.msg)}>
                  {a.btn}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Webhook manual (opțional)" description="Dacă preferați să creați webhook-ul din WordPress: WooCommerce → Setări → Avansat → Webhooks." icon={WebhooksLogo} />
          <div className="space-y-3 px-5 pb-5">
            <CopyField label="Adresă livrare (Delivery URL)" value={cfg.webhookUrl} />
            <CopyField label="Secret" value={cfg.webhookSecret} secret hint="Același secret în WooCommerce; verificăm semnătura fiecărei cereri" />
            <p className="text-[12.5px] text-fg-3">Subiect (Topic): „Order created” și „Order updated”. Versiune API: WP REST API Integration v3.</p>
            <Button size="sm" variant="ghost" icon={ArrowsClockwise} onClick={() => save({ regenerateSecret: true })}>
              Generează alt secret
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h4 className="flex items-center gap-2 text-[13.5px] font-semibold text-fg"><Info size={16} /> Cum funcționează</h4>
          <ol className="mt-2 space-y-1.5 text-[12.5px] text-fg-3">
            <li>1. Clientul comandă pe luxstore.md.</li>
            <li>2. Site-ul trimite instant comanda în CRM (semnată, securizată).</li>
            <li>3. Comanda apare ca „Nouă de pe site”, toată echipa primește notificare.</li>
            <li>4. Managerul sună clientul și apasă „Confirmă comanda” — stocul se rezervă.</li>
            <li>5. Stocul nou se publică automat pe site; la finalizare, statusul se actualizează și pe site.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

/* ================= 1C ================= */
const ENDPOINTS = [
  ["GET", "/ping", "Test conexiune și cheie"],
  ["POST", "/warehouses", "Depozite (potrivire după externalId / cod)"],
  ["POST", "/categories", "Grupe de produse"],
  ["POST", "/products", "Nomenclator: produse, prețuri, cod de bare (lot ≤ 1000)"],
  ["POST", "/stock", "Stocuri pe depozit (mode=set: 1C e sursa de adevăr)"],
  ["POST", "/customers", "Contragenți (IDNO, IBAN, condiții)"],
  ["GET", "/orders?exported=0", "Comenzi confirmate, încă nepreluate în 1C"],
  ["POST", "/orders/{id}/export", "Confirmare: comanda a fost creată în 1C (nr. document)"],
  ["POST", "/orders/{id}/payments", "Încasări înregistrate în 1C"],
  ["PATCH", "/orders/{id}", "Status, nr. factură fiscală, AWB"],
  ["POST", "/arrivals", "Recepții (intrări de marfă) din 1C"],
  ["GET", "/movements?since=", "Registrul de stoc (pentru reconciliere)"],
];

function OneCTab({ go }) {
  const { data: o } = useApi("/api/integrations/overview");
  if (!o) return <Skeleton className="h-96" />;
  const steps = [
    { done: o.onec.keys > 0, title: "Creați o cheie API de tip „1C”", text: "Tab-ul API și chei → Cheie nouă → tip 1C. Cheia se transmite programatorului.", action: <Button size="sm" onClick={() => go("api")}>Creează cheia</Button> },
    { done: !!o.onec.lastUsedAt, title: "Programatorul 1C testează conexiunea", text: o.onec.lastUsedAt ? `Ultima cerere: ${relativeTime(o.onec.lastUsedAt)}` : "GET /api/v1/ping cu antetul X-API-Key." },
    { done: o.onec.productsMapped > 0, title: "Sincronizarea nomenclatorului", text: `${num(o.onec.productsMapped)} din ${num(o.onec.productsTotal)} produse au cod 1C (externalId). Potrivirea se face automat după SKU / cod de bare.` },
    { done: o.onec.customersMapped > 0, title: "Sincronizarea contragenților", text: `${num(o.onec.customersMapped)} din ${num(o.onec.customersTotal)} clienți au cod 1C. Potrivire după IDNO / telefon.` },
    { done: false, title: "Schimb periodic (sarcină programată în 1C)", text: `Recomandat la fiecare 5–15 minute. ${num(o.onec.notExported)} comenzi confirmate așteaptă acum preluarea în 1C.` },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Integrarea cu 1C — pregătită" description="CRM-ul expune un API REST/JSON standard. Programatorul 1C îl apelează din 1C prin HTTPСоединение — fără module externe." icon={Database} />
          <ol className="divide-y divide-line border-t border-line">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", s.done ? "bg-ok text-white" : "bg-surface-3 text-fg-2")}>
                  {s.done ? <Check size={13} weight="bold" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-fg">{s.title}</div>
                  <div className="text-[12.5px] text-fg-3">{s.text}</div>
                </div>
                {s.action}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Endpoint-uri pentru 1C" description={`Adresa de bază: ${o.baseUrl}/api/v1 · antet: X-API-Key`} icon={Code} />
          <table className="w-full border-t border-line text-[13px]">
            <tbody className="divide-y divide-line">
              {ENDPOINTS.map(([m, p, d]) => (
                <tr key={m + p}>
                  <td className="w-20 px-5 py-2.5">
                    <Badge tone={m === "GET" ? "info" : m === "POST" ? "ok" : "warn"}>{m}</Badge>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[12.5px] text-fg">{p}</td>
                  <td className="px-5 py-2.5 text-fg-3">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-5">
          <h4 className="flex items-center gap-2 text-[14px] font-semibold text-fg"><BookOpen size={17} /> Pentru programatorul 1C</h4>
          <p className="mt-1.5 text-[13px] text-fg-3">Documentația completă: fluxul de schimb, formatele JSON, potrivirea după cod, exemple de cod 1C (BSL) și gestionarea erorilor.</p>
          <div className="mt-4 space-y-2">
            <a href="/docs/INTEGRARE-1C.md" target="_blank" rel="noreferrer" className="flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-[13.5px] font-medium text-white hover:bg-accent-hover">
              <DownloadSimple size={16} weight="bold" /> Documentația (Markdown)
            </a>
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2">
              <Code size={16} /> Specificația OpenAPI 3.1 (JSON)
            </a>
          </div>
          <p className="mt-3 text-[12px] text-fg-4">Specificația OpenAPI se importă direct în Postman / Swagger pentru teste.</p>
        </Card>
        <Card className="p-5">
          <h4 className="flex items-center gap-2 text-[13.5px] font-semibold text-fg"><ShieldCheck size={16} /> Reguli de schimb</h4>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-fg-3">
            <li>• Identificatorul comun este <span className="font-mono text-fg-2">externalId</span> = UUID-ul obiectului din 1C.</li>
            <li>• Trimiterile repetate sunt sigure (idempotente) — nu se creează dubluri.</li>
            <li>• Prețurile și stocurile din 1C suprascriu valorile din CRM.</li>
            <li>• Comenzile se creează în CRM și se preiau în 1C după confirmare.</li>
            <li>• Fiecare cerere apare în Jurnal, cu rezultat și durată.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ================= Chei API ================= */
function KeysTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi("/api/integrations/api-keys");
  const { data: ov } = useApi("/api/integrations/overview");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", kind: "1c", scopes: ["read", "write"] });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const k = await apiPost("/api/integrations/api-keys", f);
      setCreated(k);
      setOpen(false);
      setF({ name: "", kind: "1c", scopes: ["read", "write"] });
      reload();
      invalidate("/api/integrations");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (k) => {
    await apiPatch(`/api/integrations/api-keys/${k._id}`, { active: !k.active });
    reload();
  };
  const remove = async (k) => {
    if (!(await confirm({ title: `Ștergeți cheia „${k.name}”?`, message: "Sistemul care o folosește nu se va mai putea conecta.", tone: "danger", confirmLabel: "Șterge" }))) return;
    await apiDelete(`/api/integrations/api-keys/${k._id}`);
    reload();
  };

  const columns = [
    { key: "name", header: "Cheie", render: (k) => <div><div className="font-medium text-fg">{k.name}</div><div className="font-mono text-[12px] text-fg-3">{k.prefix}…</div></div> },
    { key: "kind", header: "Sistem", render: (k) => <Badge tone={k.kind === "1c" ? "violet" : "neutral"}>{{ "1c": "1C", site: "Site", generic: "General" }[k.kind]}</Badge> },
    { key: "scopes", header: "Drepturi", render: (k) => <span className="text-[12.5px] text-fg-2">{k.scopes.map((s) => (s === "read" ? "citire" : "scriere")).join(" + ")}</span> },
    { key: "used", header: "Utilizare", render: (k) => <span className="text-[12.5px] text-fg-3">{k.lastUsedAt ? `${relativeTime(k.lastUsedAt)} · ${num(k.usageCount)} cereri` : "neutilizată"}</span> },
    { key: "status", header: "Status", render: (k) => <Badge tone={k.active ? "ok" : "bad"} dot>{k.active ? "Activă" : "Revocată"}</Badge> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (k) => (
        <div data-stop>
          <Menu
            trigger={<Button size="xs" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
            items={[
              { label: k.active ? "Revocă (blochează)" : "Reactivează", icon: k.active ? Prohibit : CheckCircle, onClick: () => toggle(k) },
              { label: "Șterge", icon: Trash, danger: true, onClick: () => remove(k) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Chei API"
          description={ov ? `Adresa API: ${ov.baseUrl}/api/v1 · trimiteți cheia în antetul X-API-Key` : "…"}
          icon={Key}
          action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setOpen(true)}>Cheie nouă</Button>}
        />
        <DataTable columns={columns} rows={data} loading={loading} empty={<EmptyState compact icon={Key} title="Nicio cheie API" description="Creați câte o cheie pentru fiecare sistem (1C, aplicații)." />} />
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cheie API nouă"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Renunță</Button>
            <Button variant="primary" loading={busy} disabled={!f.name.trim() || !f.scopes.length} onClick={create}>Generează cheia</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nume" hint="Pentru cine este cheia">
            <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="1C Contabilitate" />
          </Field>
          <Field label="Sistem">
            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "1c", label: "1C" }, { value: "generic", label: "Altă aplicație" }]} />
          </Field>
          <div className="space-y-2">
            <Checkbox checked={f.scopes.includes("read")} onChange={(v) => setF({ ...f, scopes: v ? [...new Set([...f.scopes, "read"])] : f.scopes.filter((s) => s !== "read") })} label="Citire" description="Produse, stocuri, clienți, comenzi" />
            <Checkbox checked={f.scopes.includes("write")} onChange={(v) => setF({ ...f, scopes: v ? [...new Set([...f.scopes, "write"])] : f.scopes.filter((s) => s !== "write") })} label="Scriere" description="Creare / actualizare date, stocuri, comenzi" />
          </div>
        </div>
      </Modal>
      <Modal open={!!created} onClose={() => setCreated(null)} title="Cheia a fost creată" description="Copiați-o acum — din motive de securitate nu va mai fi afișată." size="md" footer={<Button variant="primary" onClick={() => setCreated(null)}>Am salvat cheia</Button>}>
        {created && (
          <div className="space-y-3">
            <CopyField label={created.name} value={created.key} />
            <Alert tone="warn" icon={WarningCircle}>Tratați cheia ca pe o parolă. Dacă se pierde, revocați-o și creați alta.</Alert>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================= Webhook-uri ================= */
function HookForm(props) {
  return props.open ? <HookFormBody {...props} /> : null;
}

function HookFormBody({ open, onClose, hook, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => (hook ? { name: hook.name, url: hook.url, events: hook.events } : { name: "", url: "", events: ["*"] }));
  const [busy, setBusy] = useState(false);
  const all = f.events.includes("*");
  const toggle = (k, v) => setF((x) => ({ ...x, events: v ? [...x.events.filter((e) => e !== "*"), k] : x.events.filter((e) => e !== k) }));
  const save = async () => {
    setBusy(true);
    try {
      hook ? await apiPatch(`/api/integrations/webhooks/${hook._id}`, f) : await apiPost("/api/integrations/webhooks", f);
      toast("Webhook-ul a fost salvat");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={hook ? "Editare webhook" : "Webhook nou"} footer={<><Button variant="ghost" onClick={onClose}>Renunță</Button><Button variant="primary" loading={busy} disabled={!f.name.trim() || !/^https?:\/\//.test(f.url)} onClick={save}>Salvează</Button></>}>
      <div className="space-y-8">
        <FormSection icon={WebhooksLogo} title="Destinație" description="Adresa care primește evenimentele prin POST JSON, semnate cu X-Lux-Signature.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Nume"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex: Bot Telegram comenzi" /></Field>
            <Field label="Adresa (URL)" hint="Primește cereri POST cu JSON"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></Field>
          </div>
        </FormSection>
        <FormSection icon={Lightning} title="Evenimente" description="Alegeți ce modificări din CRM se trimit către această adresă.">
          <Checkbox checked={all} onChange={(v) => setF({ ...f, events: v ? ["*"] : [] })} label="Toate evenimentele" />
          {!all && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {WEBHOOK_EVENTS.map((e) => <Checkbox key={e.key} checked={f.events.includes(e.key)} onChange={(v) => toggle(e.key, v)} label={e.label} description={e.key} />)}
            </div>
          )}
        </FormSection>
      </div>
    </Drawer>
  );
}

function HooksTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi("/api/integrations/webhooks");
  const [form, setForm] = useState({ open: false, hook: null });
  const [log, setLog] = useState(null);
  const { data: deliveries } = useApi(log ? `/api/integrations/webhooks?deliveries=${log._id}` : null);
  const [secretOf, setSecretOf] = useState(null);

  const test = async (h) => {
    try {
      const r = await apiPost(`/api/integrations/webhooks/${h._id}`, {});
      toast(r.status === "success" ? `Răspuns OK (HTTP ${r.httpStatus})` : `Eșec: ${r.error}`, r.status === "success" ? "success" : "error");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async (h) => {
    if (!(await confirm({ title: `Ștergeți webhook-ul „${h.name}”?`, tone: "danger", confirmLabel: "Șterge" }))) return;
    await apiDelete(`/api/integrations/webhooks/${h._id}`);
    reload();
  };
  const toggle = async (h) => {
    await apiPatch(`/api/integrations/webhooks/${h._id}`, { active: !h.active });
    reload();
  };

  const columns = [
    { key: "name", header: "Webhook", render: (h) => <div className="min-w-[200px]"><div className="font-medium text-fg">{h.name}</div><div className="max-w-[320px] truncate font-mono text-[12px] text-fg-3">{h.url}</div></div> },
    { key: "events", header: "Evenimente", render: (h) => <span className="text-[12.5px] text-fg-2">{h.events.includes("*") ? "toate" : `${h.events.length} evenimente`}</span> },
    { key: "last", header: "Ultima livrare", render: (h) => (h.lastDeliveryAt ? <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-3"><Dot tone={h.lastStatus === "success" ? "ok" : "bad"} />{relativeTime(h.lastDeliveryAt)}{h.lastError ? ` · ${h.lastError}` : ""}</span> : <span className="text-[12.5px] text-fg-4">—</span>) },
    { key: "status", header: "Status", render: (h) => <Badge tone={h.active ? "ok" : "neutral"} dot>{h.active ? "Activ" : "Oprit"}</Badge> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (h) => (
        <div className="flex justify-end gap-1" data-stop>
          <Button size="xs" icon={PaperPlaneTilt} onClick={() => test(h)}>Test</Button>
          <Menu
            trigger={<Button size="xs" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
            items={[
              { label: "Editează", icon: Info, onClick: () => setForm({ open: true, hook: h }) },
              { label: "Jurnal livrări", icon: ListChecks, onClick: () => setLog(h) },
              { label: "Arată secretul de semnare", icon: ShieldCheck, onClick: () => setSecretOf(h) },
              { label: h.active ? "Oprește" : "Pornește", icon: h.active ? Prohibit : CheckCircle, onClick: () => toggle(h) },
              { divider: true },
              { label: "Șterge", icon: Trash, danger: true, onClick: () => remove(h) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader title="Webhook-uri de ieșire" description="La fiecare eveniment, CRM-ul trimite un POST JSON semnat (antet X-Lux-Signature: sha256=HMAC)." icon={WebhooksLogo} action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setForm({ open: true, hook: null })}>Webhook nou</Button>} />
        <DataTable columns={columns} rows={data} loading={loading} empty={<EmptyState compact icon={WebhooksLogo} title="Niciun webhook" description="Exemple: notificare în Telegram la comandă nouă, actualizare instantă în 1C." />} />
      </Card>
      <Card className="p-5">
        <h4 className="text-[13.5px] font-semibold text-fg">Format</h4>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg-2">{`POST <URL>
X-Lux-Event: order.created
X-Lux-Delivery: 2f1c…-uuid
X-Lux-Signature: sha256=<HMAC-SHA256(secret, corpul cererii)>

{ "id": "…", "event": "order.created", "createdAt": "2026-10-17T09:12:00Z", "data": { …comanda… } }`}</pre>
      </Card>
      <HookForm open={form.open} hook={form.hook} onClose={() => setForm({ open: false, hook: null })} onSaved={reload} />
      <Drawer open={!!log} onClose={() => setLog(null)} title={`Livrări — ${log?.name || ""}`} description="Ultimele 50 (se păstrează 14 zile)">
        {!deliveries ? <Skeleton className="h-40" /> : deliveries.length === 0 ? <EmptyState compact title="Nicio livrare încă" /> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {deliveries.map((d) => (
              <li key={d._id} className="px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <Dot tone={d.status === "success" ? "ok" : "bad"} />
                  <span className="font-mono text-[12.5px] text-fg">{d.event}</span>
                  <span className="text-fg-3">HTTP {d.httpStatus ?? "—"} · {d.durationMs} ms · {d.attempts} încercări</span>
                  <span className="ml-auto text-[12px] text-fg-4">{formatDateTime(d.createdAt)}</span>
                </div>
                {d.error && <div className="mt-1 text-[12.5px] text-bad">{d.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
      <Modal open={!!secretOf} onClose={() => setSecretOf(null)} title="Secret de semnare" size="md" footer={<Button variant="primary" onClick={() => setSecretOf(null)}>Închide</Button>}>
        {secretOf && <CopyField label={secretOf.name} value={secretOf.secret} secret hint="Verificați semnătura pe server: HMAC-SHA256(secret, corp) = valoarea din X-Lux-Signature" />}
      </Modal>
    </div>
  );
}

/* ================= Jurnal ================= */
function LogTab() {
  const [f, setF] = useQueryState({ tab: "log", page: "1" });
  const { data, loading, reload } = useApi(`/api/integrations/logs${qs({ source: f.source, status: f.status, page: f.page, limit: 50 })}`);
  const SRC = { woo: "Site", "1c": "1C", api: "API", cron: "Automat", webhook: "Webhook" };
  const columns = [
    { key: "date", header: "Când", render: (l) => <span className="whitespace-nowrap text-[12.5px] text-fg-3">{formatDateTime(l.createdAt)}</span> },
    { key: "src", header: "Sursă", render: (l) => <Badge tone={l.source === "woo" ? "accent" : l.source === "1c" ? "violet" : "neutral"}>{SRC[l.source] || l.source}</Badge> },
    { key: "dir", header: "Direcție", render: (l) => <span className="text-[12.5px] text-fg-3">{l.direction === "in" ? "← intrare" : "→ ieșire"}</span> },
    { key: "action", header: "Operațiune", render: (l) => <span className="font-mono text-[12.5px] text-fg">{l.action}</span> },
    { key: "msg", header: "Rezultat", render: (l) => <span className={cx("inline-flex items-start gap-1.5 text-[12.5px]", l.status === "error" ? "text-bad" : "text-fg-2")}><Dot tone={l.status === "error" ? "bad" : "ok"} className="mt-1.5 shrink-0" />{l.message}{l.ref ? ` · ${l.ref}` : ""}</span> },
    { key: "ms", header: "Durată", align: "right", render: (l) => <span className="tnum text-[12px] text-fg-4">{l.durationMs != null ? `${l.durationMs} ms` : ""}</span> },
  ];
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <Select value={f.source || ""} onChange={(e) => setF({ source: e.target.value })} className="w-[160px]">
          <option value="">Toate sursele</option>
          {Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={f.status || ""} onChange={(e) => setF({ status: e.target.value })} className="w-[140px]">
          <option value="">Orice rezultat</option>
          <option value="ok">Reușite</option>
          <option value="error">Erori</option>
        </Select>
        <Button size="sm" variant="ghost" icon={ArrowsClockwise} onClick={reload} className="ml-auto">Reîmprospătează</Button>
      </Toolbar>
      <DataTable columns={columns} rows={data?.items} loading={loading} dense empty={<EmptyState compact title="Jurnalul este gol" description="Aici apar sincronizările cu site-ul, cererile 1C și erorile." />} />
      <Pagination page={Number(f.page) || 1} limit={50} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
    </Card>
  );
}

function Inner() {
  const [f, setF] = useQueryState({ tab: "overview" });
  const go = (t) => setF({ tab: t });
  return (
    <div className="animate-in">
      <PageHeader title="Integrări" description="Conexiuni directe cu site-ul luxstore.md, 1C și alte sisteme — fără servicii intermediare." />
      <Tabs
        className="mb-5"
        value={f.tab}
        onChange={(t) => setF({ tab: t, page: "", source: "", status: "" })}
        tabs={[
          { key: "overview", label: "Prezentare" },
          { key: "site", label: "Site luxstore.md" },
          { key: "1c", label: "1C" },
          { key: "api", label: "API și chei" },
          { key: "webhooks", label: "Webhook-uri" },
          { key: "log", label: "Jurnal" },
        ]}
      />
      {f.tab === "overview" && <Overview go={go} />}
      {f.tab === "site" && <SiteTab />}
      {f.tab === "1c" && <OneCTab go={go} />}
      {f.tab === "api" && <KeysTab />}
      {f.tab === "webhooks" && <HooksTab />}
      {f.tab === "log" && <LogTab />}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
