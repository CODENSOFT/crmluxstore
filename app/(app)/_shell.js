"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Icon } from "@/app/_components/icons";
import NotificationBell from "@/app/_components/NotificationBell";

// Navigatie grupata pe sectiuni
const SECTIONS = [
  {
    title: null,
    items: [{ href: "/", label: "Panou", icon: "dashboard" }],
  },
  {
    title: "Operatiuni",
    items: [
      { href: "/comenzi", label: "Comenzi", icon: "receipt" },
      { href: "/produse", label: "Produse", icon: "package" },
      { href: "/depozite", label: "Depozite", icon: "warehouse" },
    ],
  },
  {
    title: "Gestiune stoc",
    items: [
      { href: "/receptie", label: "Receptie marfa", icon: "inbox" },
      { href: "/furnizori", label: "Furnizori", icon: "truck" },
      { href: "/transfer", label: "Transfer", icon: "transfer" },
      { href: "/anulare", label: "Anulare", icon: "trash" },
    ],
  },
  {
    title: "Activitate",
    items: [
      { href: "/sarcini", label: "Sarcini", icon: "tasks" },
      { href: "/rapoarte", label: "Rapoarte", icon: "chart" },
    ],
  },
  {
    title: "Administrare",
    admin: true,
    items: [
      { href: "/utilizatori", label: "Manageri", icon: "users" },
      { href: "/istoric", label: "Istoric activitate", icon: "history" },
      { href: "/integrare", label: "Integrare Make", icon: "plug" },
      { href: "/setari", label: "Setari", icon: "settings" },
    ],
  },
];

export default function Shell({ user, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await apiPost("/api/auth/logout", {});
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const sections = SECTIONS.filter((s) => !s.admin || user.role === "admin");

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar (dark) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-900/40">
            <Icon name="droplet" className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight tracking-tight text-white">
              Lux Store
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              CRM intern
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
          {sections.map((section, si) => (
            <div key={si}>
              {section.title && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {section.title}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((n) => {
                  const active = isActive(n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/30"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon
                        name={n.icon}
                        className={`h-[18px] w-[18px] ${
                          active
                            ? "text-white"
                            : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profil in subsolul sidebar-ului */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-semibold text-white">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                {user.name}
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                {user.role === "admin" ? "Administrator" : "Manager"}
              </div>
            </div>
            <button
              onClick={logout}
              title="Iesire"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Icon name="logout" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Continut */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-8">
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 text-white">
              <Icon name="droplet" className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="text-sm font-bold text-slate-800">Lux Store</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <span className="hidden text-sm font-medium text-slate-500 sm:block">
              {user.name}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-semibold text-white lg:hidden">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
