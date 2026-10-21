"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiDelete } from "@/lib/client";
import { useApi } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser, can } from "@/app/_components/user";
import { money, relativeTime, num } from "@/lib/format";
import { Card, PageHeader, Button, ButtonLink, SearchInput, EmptyState, Badge, Avatar } from "@/app/_components/ui";
import { DataTable, Toolbar } from "@/app/_components/table";
import { useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, Truck, PencilSimple, Trash } from "@/app/_components/icons";

function Inner() {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useQueryState({});
  const router = useRouter();
  // linkuri vechi (?nou=1, ?open=ID) -> paginile noi
  useEffect(() => {
    if (f.nou === "1") router.replace("/furnizori/nou");
    else if (f.open) router.replace(`/furnizori/${f.open}`);
  }, [f.nou, f.open, router]);
  const { data, loading, error, reload } = useApi(`/api/suppliers${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`);

  const remove = async (s) => {
    if (!(await confirm({ title: `Ștergeți furnizorul „${s.name}”?`, message: "Dacă are recepții, va fi doar dezactivat.", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      const r = await apiDelete(`/api/suppliers/${s._id}`);
      toast(r.deactivated ? "Furnizorul are recepții — a fost dezactivat" : "Furnizorul a fost șters");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Furnizor",
      render: (s) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <Avatar name={s.name} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{s.name}</div>
            <div className="truncate text-[12px] text-fg-3">{[s.contactPerson, s.country].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "contact", header: "Contact", className: "hidden md:table-cell", headClassName: "hidden md:table-cell", render: (s) => <div className="text-[12.5px]"><div className="text-fg-2">{s.phone || "—"}</div>{s.email && <div className="text-fg-3">{s.email}</div>}</div> },
    { key: "brands", header: "Mărci", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (s) => <div className="flex flex-wrap gap-1">{(s.brands || []).slice(0, 4).map((b) => <Badge key={b}>{b}</Badge>)}</div> },
    { key: "arrivals", header: "Recepții", align: "right", render: (s) => <span className="tnum">{s.stats.arrivals}</span> },
    { key: "total", header: "Total achiziții", align: "right", render: (s) => <span className="tnum font-medium text-fg">{money(s.stats.total)}</span> },
    { key: "last", header: "Ultima", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (s) => <span className="text-[12.5px] text-fg-3">{s.stats.lastArrivalAt ? relativeTime(s.stats.lastArrivalAt) : "—"}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex justify-end gap-1" data-stop>
          {can(user, "suppliers.manage") && <Button size="xs" variant="ghost" icon={PencilSimple} onClick={() => router.push(`/furnizori/${s._id}/editare`)} aria-label="Editează" />}
          {can(user, ["suppliers.manage", "delete"]) && <Button size="xs" variant="danger-ghost" icon={Trash} onClick={() => remove(s)} aria-label="Șterge" />}
        </div>
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader title="Furnizori" description="De la cine aducem marfa: contacte, condiții și istoricul recepțiilor." actions={<ButtonLink href="/furnizori/nou" variant="primary" icon={Plus}>Furnizor nou</ButtonLink>} />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Caută furnizor…" className="w-full sm:w-64" />
          {data && <span className="ml-auto text-[12.5px] text-fg-3">{num(data.length)} furnizori · achiziții totale <span className="tnum font-medium text-fg">{money(data.reduce((t, s) => t + s.stats.total, 0))}</span></span>}
        </Toolbar>
        <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} rowHref={(s) => `/furnizori/${s._id}`} empty={<EmptyState icon={Truck} title="Niciun furnizor" action={<ButtonLink href="/furnizori/nou" size="sm" variant="primary" icon={Plus}>Adaugă furnizor</ButtonLink>} />} />
      </Card>
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
