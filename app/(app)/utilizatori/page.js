"use client";

import { useRouter } from "next/navigation";
import { apiDelete, apiPatch } from "@/lib/client";
import { useApi } from "@/lib/useApi";
import { useUser, isOwner } from "@/app/_components/user";
import { moneyShort, relativeTime, formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/constants";
import { Card, PageHeader, Button, ButtonLink, Badge, Avatar, EmptyState } from "@/app/_components/ui";
import { DataTable } from "@/app/_components/table";
import { Menu, useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, UserGear, DotsThree, PencilSimple, Trash, Prohibit, CheckCircle, Key } from "@/app/_components/icons";
import { permissionLabel } from "@/lib/permissions";


export default function UsersPage() {
  const me = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi("/api/users?stats=1");
  const router = useRouter();
  const canOpen = (u) => isOwner(me) || u.role === "manager" || String(u._id) === me.id;

  const toggleActive = async (u) => {
    try {
      await apiPatch(`/api/users/${u._id}`, { active: !u.active });
      toast(u.active ? `${u.name} nu mai are acces` : `${u.name} are din nou acces`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async (u) => {
    if (!(await confirm({ title: `Ștergeți contul lui ${u.name}?`, message: "Recomandat: dezactivați contul — istoricul comenzilor rămâne legat de nume.", tone: "danger", confirmLabel: "Șterge contul" }))) return;
    try {
      await apiDelete(`/api/users/${u._id}`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Utilizator",
      render: (u) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <Avatar name={u.name} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-fg">
              {u.name}
              {String(u._id) === me.id && <Badge>Tu</Badge>}
            </div>
            <div className="truncate text-[12px] text-fg-3">{u.email}{u.position ? ` · ${u.position}` : ""}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Rol", render: (u) => <Badge tone={u.role === "owner" ? "accent" : u.role === "admin" ? "violet" : "neutral"}>{roleLabel(u.role)}</Badge> },
    {
      key: "perms",
      header: "Drepturi",
      className: "hidden md:table-cell",
      headClassName: "hidden md:table-cell",
      render: (u) =>
        u.role !== "manager" ? (
          <span className="text-[12.5px] text-fg-3">{u.role === "owner" ? "Acces complet + administratori, setări" : "Acces complet"}</span>
        ) : u.permissions?.length ? (
          <span className="text-[12.5px] text-fg-2" title={u.permissions.map(permissionLabel).join(", ")}>
            De bază + {u.permissions.length} {u.permissions.length === 1 ? "drept" : "drepturi"}
            {u.permissions.includes("delete") && <Badge tone="bad" className="ml-1.5">poate șterge</Badge>}
          </span>
        ) : (
          <span className="text-[12.5px] text-fg-3">Doar de bază</span>
        ),
    },
    { key: "status", header: "Acces", render: (u) => <Badge tone={u.active ? "ok" : "bad"} dot>{u.active ? "Activ" : "Dezactivat"}</Badge> },
    { key: "month", header: "Vânzări luna aceasta", align: "right", render: (u) => <span className="tnum">{u.month?.orders || 0} cmd. · <span className="font-medium text-fg">{moneyShort(u.month?.revenue)}</span></span> },
    { key: "login", header: "Ultima autentificare", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (u) => <span className="text-[12.5px] text-fg-3" title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "niciodată"}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (u) => (
        (isOwner(me) || u.role === "manager" || String(u._id) === me.id) && (
        <div data-stop>
          <Menu
            trigger={<Button size="xs" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
            items={[
              { label: "Editează și drepturi", icon: PencilSimple, href: `/utilizatori/${u._id}` },
              { label: "Schimbă parola", icon: Key, href: `/utilizatori/${u._id}` },
              String(u._id) !== me.id && u.role !== "owner" && { label: u.active ? "Dezactivează accesul" : "Reactivează accesul", icon: u.active ? Prohibit : CheckCircle, onClick: () => toggleActive(u) },
              String(u._id) !== me.id && u.role !== "owner" && { divider: true },
              String(u._id) !== me.id && u.role !== "owner" && { label: "Șterge contul", icon: Trash, danger: true, onClick: () => remove(u) },
            ]}
          />
        </div>
        )
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader title="Utilizatori" description="Echipa Lux Store: conturi, roluri și drepturile fiecărui angajat." actions={<ButtonLink href="/utilizatori/nou" variant="primary" icon={Plus}>Utilizator nou</ButtonLink>} />
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={data} loading={loading} onRowClick={(u) => canOpen(u) && router.push(`/utilizatori/${u._id}`)} empty={<EmptyState icon={UserGear} title="Niciun utilizator" />} />
      </Card>
    </div>
  );
}
