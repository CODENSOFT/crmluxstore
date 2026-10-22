"use client";

import { use } from "react";
import Link from "@/app/_components/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, moneyShort, num, formatDate, relativeTime } from "@/lib/format";
import { segmentLabel, sourceLabel, channelLabel, TASK_PRIORITY } from "@/lib/constants";
import { Card, CardHeader, PageHeader, Button, ButtonLink, Badge, Stat, DetailList, StageBadge, PaymentBadge, Skeleton, ErrorState, EmptyState, cx } from "@/app/_components/ui";
import { Menu, useConfirm, useToast } from "@/app/_components/overlay";
import { BarList } from "@/app/_components/charts";
import {
  Plus, PencilSimple, DotsThree, Phone, EnvelopeSimple, MapPin, Buildings, User, Receipt, Coins, Wallet, Package, CheckSquareOffset, ArrowsClockwise, Trash, Info, Tag,
} from "@/app/_components/icons";
import { CustomerPrices } from "../_prices";

export default function CustomerPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, error, reload, mutate } = useApi(`/api/customers/${id}`, { keepPrevious: false });

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!c) return <Skeleton className="h-96" />;

  const avg = c.stats?.ordersCount ? c.stats.totalSpent / c.stats.ordersCount : 0;
  const overdue = (c.orders || []).filter((o) => o.paymentStatus !== "paid" && ["processing", "ready", "invoicing", "completed"].includes(o.status));

  const recalc = async () => {
    try {
      const res = await apiPost(`/api/customers/${id}`, {});
      mutate((x) => ({ ...x, stats: res.stats }));
      toast("Statisticile au fost recalculate");
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Ștergeți clientul „${c.name}”?`, message: "Dacă are comenzi, va fi doar dezactivat (istoricul rămâne).", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      const r = await apiDelete(`/api/customers/${id}`);
      toast(r.deactivated ? "Clientul are comenzi — a fost dezactivat" : "Clientul a fost șters");
      invalidate("/api/customers");
      router.push("/clienti");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/clienti", label: "Clienți" }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {c.name}
            {c.active === false && <Badge tone="bad">Inactiv</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1">
              {c.type === "company" ? <Buildings size={14} /> : <User size={14} />}
              {c.type === "company" ? "Persoană juridică" : "Persoană fizică"}
            </span>
            <span>·</span>
            <span>{c.number}</span>
            <Badge>{segmentLabel(c.segment)}</Badge>
            {c.priceType === "wholesale" && <Badge tone="accent">Preț angro</Badge>}
            {c.discount > 0 && <Badge tone="ok">Reducere {c.discount}%</Badge>}
            {(c.tags || []).map((t) => (
              <Badge key={t} tone="violet">
                {t}
              </Badge>
            ))}
          </span>
        }
        actions={
          <>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2">
                <Phone size={16} weight="bold" /> Sună
              </a>
            )}
            {can(user, "customers.manage") && (
              <ButtonLink href={`/clienti/${c._id}/editare`} icon={PencilSimple}>
                Editează
              </ButtonLink>
            )}
            <ButtonLink href={`/comenzi/nou?customer=${c._id}`} variant="primary" icon={Plus}>
              Comandă nouă
            </ButtonLink>
            <Menu
              trigger={<Button icon={DotsThree} aria-label="Mai multe" />}
              items={[
                { label: "Sarcină pentru acest client", icon: CheckSquareOffset, href: `/sarcini/nou?customer=${c._id}` },
                { label: "Recalculează statisticile", icon: ArrowsClockwise, onClick: recalc },
                can(user, ["customers.manage", "delete"]) && { divider: true },
                can(user, ["customers.manage", "delete"]) && { label: "Șterge / dezactivează", icon: Trash, onClick: remove, danger: true },
              ]}
            />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total cumpărat" icon={Coins} value={moneyShort(c.stats?.totalSpent)} sub="comenzi confirmate" />
        <Stat label="Comenzi" icon={Receipt} value={c.stats?.ordersCount || 0} sub={c.stats?.lastOrderAt ? `ultima ${relativeTime(c.stats.lastOrderAt)}` : "nicio comandă încă"} />
        <Stat label="Bon mediu" icon={Tag} value={moneyShort(avg)} />
        <Stat label="Datorie" icon={Wallet} tone={c.stats?.balance > 0 ? "bad" : undefined} value={moneyShort(c.stats?.balance)} sub={overdue.length ? `${overdue.length} comenzi neachitate` : "fără datorii"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <CustomerPrices customer={c} />
          <Card className="overflow-hidden">
            <CardHeader title="Comenzi" icon={Receipt} description="Ultimele 100" />
            {c.orders?.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {c.orders.map((o) => (
                  <li key={o._id}>
                    <Link href={`/comenzi/${o._id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
                          {o.number}
                          <span className="text-[12px] font-normal text-fg-4">{channelLabel(o.channel)}</span>
                        </div>
                        <div className="truncate text-[12.5px] text-fg-3">
                          {formatDate(o.createdAt)} · {(o.items || []).map((i) => i.productName).slice(0, 3).join(", ")}
                        </div>
                      </div>
                      {!["cancelled", "rejected"].includes(o.status) && (
                        <span className="hidden sm:block">
                          <PaymentBadge status={o.paymentStatus} />
                        </span>
                      )}
                      <StageBadge status={o.status} short />
                      <span className="tnum w-28 text-right text-[13.5px] font-medium text-fg">{money(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Receipt}
                title="Nicio comandă"
                action={
                  <ButtonLink href={`/comenzi/nou?customer=${c._id}`} size="sm" variant="primary" icon={Plus}>
                    Prima comandă
                  </ButtonLink>
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Produse cumpărate frecvent" icon={Package} description="După valoare, tot istoricul" />
            <div className="px-5 pb-5">
              <BarList
                items={(c.topProducts || []).map((p) => ({ key: String(p._id), label: p.name, value: p.total, sub: `${num(p.qty)} buc./u.m.` }))}
                format={(v) => moneyShort(v)}
                empty="Clientul nu are încă vânzări confirmate."
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact" icon={Phone} />
            <div className="space-y-2 px-5 pb-5 text-[13.5px]">
              {c.contactPerson && <div className="text-fg">{c.contactPerson}</div>}
              {[c.phone, c.phone2].filter(Boolean).map((p) => (
                <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="flex items-center gap-2 text-fg-2 hover:text-accent">
                  <Phone size={15} className="text-fg-3" /> {p}
                </a>
              ))}
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-fg-2 hover:text-accent">
                  <EnvelopeSimple size={15} className="text-fg-3" /> {c.email}
                </a>
              )}
              {(c.city || c.address) && (
                <div className="flex items-start gap-2 text-fg-2">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-fg-3" /> {[c.city, c.address].filter(Boolean).join(", ")}
                </div>
              )}
              {!c.phone && !c.email && !c.address && <p className="text-fg-3">Fără date de contact.</p>}
            </div>
          </Card>

          {c.type === "company" && (
            <Card>
              <CardHeader title="Date fiscale" icon={Buildings} />
              <div className="px-5 pb-5">
                <DetailList
                  items={[
                    ["IDNO", c.idno],
                    ["Cod TVA", c.vatCode],
                    ["IBAN", c.iban],
                    ["Banca", c.bank],
                    ["Adresa juridică", c.legalAddress],
                  ]}
                />
                {!c.idno && !c.iban && <p className="text-[13px] text-fg-3">Completați datele fiscale pentru facturi corecte.</p>}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Condiții și detalii" icon={Info} />
            <div className="px-5 pb-5">
              <DetailList
                items={[
                  ["Tip preț", c.priceType === "wholesale" ? "Angro" : "Cu amănuntul"],
                  ["Reducere implicită", c.discount ? `${c.discount}%` : "—"],
                  ["Termen de plată", c.paymentTermDays ? `${c.paymentTermDays} zile` : "La livrare"],
                  ["Manager", c.manager?.name],
                  ["Sursă", c.source ? sourceLabel(c.source) : null],
                  ["Client din", formatDate(c.createdAt)],
                  ["Cod în 1C", c.externalId],
                ]}
              />
              {c.note && <p className="mt-4 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">{c.note}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Sarcini"
              icon={CheckSquareOffset}
              action={<Link href={`/sarcini/nou?customer=${c._id}`} className="text-[12.5px] font-medium text-accent hover:underline">Adaugă</Link>}
            />
            {c.tasks?.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {c.tasks.map((t) => (
                  <li key={t._id} className="flex items-start gap-2.5 px-5 py-2.5 text-[13px]">
                    <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.status === "done" ? "bg-ok" : t.priority === "high" ? "bg-bad" : "bg-accent")} />
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate", t.status === "done" ? "text-fg-3 line-through" : "text-fg")}>{t.title}</div>
                      <div className="text-[12px] text-fg-3">
                        {t.assignedTo?.name} {t.dueDate ? `· ${formatDate(t.dueDate)}` : ""}
                      </div>
                    </div>
                    {t.priority === "high" && t.status !== "done" && <Badge tone="bad">{TASK_PRIORITY[2].label}</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-fg-3">Nicio sarcină legată de acest client.</p>
            )}
          </Card>
        </div>
      </div>

    </div>
  );
}
