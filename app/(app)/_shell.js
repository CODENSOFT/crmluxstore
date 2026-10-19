"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { relativeTime, money } from "@/lib/format";
import { roleLabel } from "@/lib/constants";
import { stageInfo } from "@/lib/orderStages";
import {
  SquaresFour, Receipt, UsersThree, Package, Stack, TrayArrowDown, ArrowsLeftRight, TrashSimple, ClipboardText,
  Truck, Warehouse, CheckSquareOffset, ChartLineUp, Bell, UserGear, PlugsConnected, ClockCounterClockwise, GearSix,
  MagnifyingGlass, Plus, List, SidebarSimple, SignOut, Moon, Sun, Desktop, UserCircle, X, Drop, CaretRight, Buildings, User, Warning,
} from "@/app/_components/icons";
import { Avatar, Kbd, cx, Spinner } from "@/app/_components/ui";
import { Menu, Popover } from "@/app/_components/overlay";
import { can } from "@/lib/permissions";

const NAV = [
  { items: [{ href: "/", label: "Panou", icon: SquaresFour }] },
  {
    title: "Vânzări",
    items: [
      { href: "/comenzi", label: "Comenzi", icon: Receipt, badge: "attention" },
      { href: "/clienti", label: "Clienți", icon: UsersThree },
      { href: "/produse", label: "Produse", icon: Package },
    ],
  },
  {
    title: "Stoc",
    items: [
      { href: "/stoc", label: "Situația stocului", icon: Stack },
      { href: "/receptie", label: "Recepții", icon: TrayArrowDown },
      { href: "/transfer", label: "Transferuri", icon: ArrowsLeftRight, perm: "stock.transfer" },
      { href: "/anulare", label: "Casări", icon: TrashSimple, perm: "stock.writeoff" },
      { href: "/inventariere", label: "Inventariere", icon: ClipboardText, perm: "stock.inventory" },
      { href: "/furnizori", label: "Furnizori", icon: Truck },
      { href: "/depozite", label: "Depozite", icon: Warehouse, admin: true },
    ],
  },
  {
    title: "Echipă",
    items: [
      { href: "/sarcini", label: "Sarcini", icon: CheckSquareOffset, badge: "tasks" },
      { href: "/rapoarte", label: "Rapoarte", icon: ChartLineUp, perm: "reports.view" },
      { href: "/notificari", label: "Notificări", icon: Bell, badge: "unread" },
    ],
  },
  {
    title: "Administrare",
    admin: true,
    items: [
      { href: "/utilizatori", label: "Utilizatori", icon: UserGear },
      { href: "/integrari", label: "Integrări", icon: PlugsConnected },
      { href: "/istoric", label: "Istoric activitate", icon: ClockCounterClockwise },
      { href: "/setari", label: "Setări", icon: GearSix },
    ],
  },
];

// Meniul vizibil pentru utilizator: sectiuni/pagini de admin + pagini care cer un drept anume
function visibleNav(user) {
  const admin = user.role === "admin";
  return NAV.filter((s) => !s.admin || admin)
    .map((s) => ({ ...s, items: s.items.filter((it) => (!it.admin || admin) && (!it.perm || can(user, it.perm))) }))
    .filter((s) => s.items.length);
}

const CREATE = [
  { href: "/comenzi/nou", label: "Comandă nouă", icon: Receipt, hint: "N" },
  { href: "/clienti?nou=1", label: "Client nou", icon: UsersThree },
  { href: "/produse?nou=1", label: "Produs nou", icon: Package, perm: "products.manage" },
  { href: "/receptie/nou", label: "Recepție marfă", icon: TrayArrowDown },
  { href: "/sarcini?nou=1", label: "Sarcină nouă", icon: CheckSquareOffset },
];

/* ---------------- Preferinte locale (tema, meniu restrans) ---------------- */
const PREF_EVENT = "lux-pref";
function subscribePrefs(cb) {
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readPref(key, def) {
  try {
    return localStorage.getItem(key) ?? def;
  } catch {
    return def;
  }
}
function useLocalPref(key, def) {
  const value = useSyncExternalStore(subscribePrefs, () => readPref(key, def), () => def);
  const set = useCallback(
    (v) => {
      try {
        if (v === null || v === def) localStorage.removeItem(key);
        else localStorage.setItem(key, v);
      } catch {
        /* stocare indisponibila */
      }
      window.dispatchEvent(new Event(PREF_EVENT));
    },
    [key, def]
  );
  return [value, set];
}

function useTheme() {
  const [theme, setPref] = useLocalPref("lux-theme", "system");
  const setTheme = (t) => {
    setPref(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return [theme, setTheme];
}

/* ---------------- Logo ---------------- */
function Brand({ collapsed }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-white shadow-sm">
        <Drop size={17} weight="fill" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[14px] font-semibold tracking-tight text-fg">Lux Store</span>
          <span className="block text-[11.5px] text-fg-3">CRM · chimie auto</span>
        </span>
      )}
    </Link>
  );
}

/* ---------------- Meniu lateral ---------------- */
function Sidebar({ user, collapsed, onToggle, summary, onNavigate, mobile }) {
  const pathname = usePathname();
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const sections = visibleNav(user);
  return (
    <div className="flex h-full flex-col">
      <div className={cx("flex h-14 items-center justify-between gap-2 px-3", collapsed && "justify-center px-2")}>
        <Brand collapsed={collapsed} />
        {!collapsed && !mobile && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Restrânge meniul"
            title="Restrânge meniul"
            className="rounded-md p-1.5 text-fg-4 transition-colors hover:bg-surface-2 hover:text-fg-2"
          >
            <SidebarSimple size={17} />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-1" aria-label="Navigare principală">
        {sections.map((s, si) => (
          <div key={si} className={cx(si > 0 && "mt-4")}>
            {s.title && !collapsed && <div className="mb-1 px-2.5 text-[11.5px] font-medium text-fg-4">{s.title}</div>}
            {s.title && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-line" />}
            <ul className="space-y-px">
              {s.items.map((it) => {
                const active = isActive(it.href);
                const count = it.badge ? summary?.[it.badge] || 0 : 0;
                const IconC = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      title={collapsed ? it.label : undefined}
                      className={cx(
                        "group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
                      )}
                    >
                      <IconC size={17} weight={active ? "fill" : "regular"} className={cx("shrink-0", !active && "text-fg-3 group-hover:text-fg-2")} />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                      {count > 0 &&
                        (collapsed ? (
                          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                        ) : (
                          <span className={cx("tnum rounded-md px-1.5 text-[11px] font-semibold leading-5", active ? "bg-accent text-white" : "bg-surface-3 text-fg-2")}>
                            {count > 99 ? "99+" : count}
                          </span>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {collapsed && !mobile && (
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Extinde meniul"
            title="Extinde meniul"
            className="flex h-8 w-full items-center justify-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg"
          >
            <SidebarSimple size={17} />
          </button>
        </div>
      )}
      {!collapsed && (
        <div className="border-t border-line p-3">
          <Link href="/setari" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-surface-2">
            <Avatar name={user.name} size={30} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-fg">{user.name}</span>
              <span className="block truncate text-[11.5px] text-fg-3">{roleLabel(user.role)}</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------------- Notificari (popover) ---------------- */
function NotificationsButton({ unread, onChanged }) {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    apiGet("/api/notifications?limit=8")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, [open]);
  const openItem = async (n, close) => {
    close();
    if (!n.read) apiPatch(`/api/notifications/${n._id}`, { read: true }).then(onChanged).catch(() => {});
    const href = n.link || (n.order ? `/comenzi/${n.order._id || n.order}` : "/notificari");
    router.push(href);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(380px,calc(100vw-1.5rem))]"
      trigger={
        <button type="button" aria-label="Notificări" className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
          <Bell size={18} />
          {unread > 0 && (
            <span className="tnum absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white ring-2 ring-bg">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[14px] font-semibold text-fg">Notificări</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-[12.5px] font-medium text-accent hover:underline"
                onClick={async () => {
                  await apiPost("/api/notifications", {});
                  setItems((x) => x?.map((n) => ({ ...n, read: true })));
                  onChanged();
                }}
              >
                Marchează toate citite
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items === null ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-fg-3">Nu aveți notificări.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => openItem(n, close)}
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-2"
                >
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-[13px] leading-snug", n.read ? "text-fg-2" : "font-medium text-fg")}>{n.title}</span>
                    {n.message && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-3">{n.message}</span>}
                    <span className="mt-1 block text-[11.5px] text-fg-4">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <Link href="/notificari" onClick={close} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg">
            Vezi toate notificările
          </Link>
        </div>
      )}
    </Popover>
  );
}

/* ---------------- Paleta de comenzi (Ctrl+K) ---------------- */
function CommandPalette(props) {
  return props.open ? <PaletteBody {...props} /> : null;
}

function PaletteBody({ open, onClose, user }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resState, setRes] = useState(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(() => {
      setLoading(true);
      apiGet(`/api/search?q=${encodeURIComponent(term)}`)
        .then((d) => {
          setRes(d);
          setActive(0);
        })
        .catch(() => setRes({ products: [], customers: [], orders: [] }))
        .finally(() => setLoading(false));
    }, 160);
    return () => clearTimeout(t);
  }, [term]);
  const res = term.length < 2 ? null : resState;

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pages = visibleNav(user)
      .flatMap((s) => s.items)
      .filter((i) => !t || i.label.toLowerCase().includes(t))
      .map((i) => ({ key: `p${i.href}`, label: i.label, icon: i.icon, href: i.href, meta: "Pagină" }));
    const actions = CREATE.filter((c) => (!c.perm || can(user, c.perm)) && (!t || c.label.toLowerCase().includes(t))).map((c) => ({
      key: `a${c.href}`,
      label: c.label,
      icon: Plus,
      href: c.href,
      meta: "Acțiune",
    }));
    const out = [];
    if (res) {
      if (res.orders.length)
        out.push({
          title: "Comenzi",
          items: res.orders.map((o) => ({
            key: o._id,
            label: `${o.number} · ${o.customerName || "fără client"}`,
            icon: Receipt,
            href: `/comenzi/${o._id}`,
            meta: `${money(o.total)} · ${stageInfo(o.status).short}`,
          })),
        });
      if (res.customers.length)
        out.push({
          title: "Clienți",
          items: res.customers.map((c) => ({
            key: c._id,
            label: c.name,
            icon: c.type === "company" ? Buildings : User,
            href: `/clienti/${c._id}`,
            meta: c.phone || c.number,
          })),
        });
      if (res.products.length)
        out.push({
          title: "Produse",
          items: res.products.map((p) => ({
            key: p._id,
            label: p.name,
            icon: Package,
            href: `/produse/${p._id}`,
            meta: `${p.sku ? p.sku + " · " : ""}stoc ${p.totalStock}`,
          })),
        });
    }
    if (actions.length) out.push({ title: "Acțiuni rapide", items: actions });
    if (pages.length) out.push({ title: "Navigare", items: pages.slice(0, t ? 8 : 6) });
    return out;
  }, [res, q, user]);

  const flat = groups.flatMap((g) => g.items);
  const go = (it) => {
    ref.current?.close();
    onClose();
    router.push(it.href);
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let idx = -1;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none items-start justify-center bg-transparent p-3 open:flex sm:pt-[12vh]"
    >
      <div className="fixed inset-0" onClick={() => ref.current?.close()} aria-hidden />
      <div className="relative w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-3 border-b border-line px-4">
          {loading ? <Spinner size={18} /> : <MagnifyingGlass size={18} className="text-fg-3" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(flat.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && flat[active]) {
                e.preventDefault();
                go(flat[active]);
              }
            }}
            placeholder="Caută comenzi, clienți, produse sau pagini…"
            className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-4"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-fg-3">Niciun rezultat pentru „{q}”</p>}
          {groups.map((g) => (
            <div key={g.title} className="mb-1">
              <div className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-fg-4">{g.title}</div>
              {g.items.map((it) => {
                idx++;
                const i = idx;
                const IconC = it.icon;
                return (
                  <button
                    key={it.key}
                    type="button"
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it)}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", active === i ? "bg-surface-2" : "")}
                  >
                    <IconC size={17} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{it.label}</span>
                    {it.meta && <span className="shrink-0 truncate text-[12px] text-fg-3">{it.meta}</span>}
                    {active === i && <CaretRight size={13} className="shrink-0 text-fg-3" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2 text-[11.5px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigare
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> deschide
          </span>
        </div>
      </div>
    </dialog>
  );
}

/* ---------------- Shell ---------------- */
export default function Shell({ user, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsedPref, setCollapsedPref] = useLocalPref("lux-sidebar", "0");
  const collapsed = collapsedPref === "1";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useTheme();
  const { data: summary, refresh } = useApi("/api/me/summary", { refreshInterval: 30000 });

  const toggle = () => setCollapsedPref(collapsed ? "0" : "1");

  // Contoarele din meniu se reimprospateaza la fiecare navigare
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Scurtaturi: Ctrl/⌘+K cautare, N comanda noua (in afara campurilor)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      const tag = e.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.target?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key.toLowerCase() === "n" && !pathname.startsWith("/comenzi/nou")) {
        router.push("/comenzi/nou");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  const logout = useCallback(async () => {
    await apiPost("/api/auth/logout", {});
    invalidate("/");
    router.replace("/login");
    router.refresh();
  }, [router]);

  return (
    <div className="flex min-h-dvh bg-bg" style={{ "--sidebar-w": collapsed ? "60px" : "244px" }}>
      <a href="#continut" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
        Sari la conținut
      </a>

      {/* Desktop */}
      <aside
        className={cx(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-[60px]" : "w-[244px]"
        )}
      >
        <Sidebar user={user} collapsed={collapsed} onToggle={toggle} summary={summary} />
      </aside>

      {/* Mobil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[rgb(10_14_22/0.45)]" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-in border-r border-line bg-surface shadow-lg">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Închide meniul"
              className="absolute right-2 top-3 rounded-lg p-2 text-fg-3 hover:bg-surface-2"
            >
              <X size={18} />
            </button>
            <Sidebar user={user} summary={summary} onNavigate={() => setMobileOpen(false)} mobile />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {user.authBypass && (
          <div role="status" className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-3 py-1.5 text-[12.5px] text-warn sm:px-5">
            <Warning size={15} weight="fill" className="shrink-0" />
            <span>
              Mod local fără parolă (<code className="font-mono">AUTH_BYPASS=1</code>) — sunteți conectat automat ca administrator. Funcționează doar cu <code className="font-mono">npm run dev</code>, niciodată pe site.
            </span>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Deschide meniul"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2 lg:hidden"
          >
            <List size={20} />
          </button>
          <div className="lg:hidden">
            <Brand collapsed />
          </div>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="ml-1 flex h-9 min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-left text-[13px] text-fg-4 shadow-xs transition-colors hover:border-line-strong hover:text-fg-3"
          >
            <MagnifyingGlass size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">Caută comenzi, clienți, produse…</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Menu
              align="right"
              width="w-60"
              trigger={
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13.5px] font-medium text-white shadow-xs transition-colors hover:bg-accent-hover"
                >
                  <Plus size={16} weight="bold" />
                  <span className="hidden sm:inline">Nou</span>
                </button>
              }
              items={CREATE.filter((c) => !c.perm || can(user, c.perm)).map((c) => ({ label: c.label, icon: c.icon, href: c.href, hint: c.hint }))}
            />
            <NotificationsButton unread={summary?.unread || 0} onChanged={refresh} />
            <Menu
              align="right"
              width="w-64"
              trigger={
                <button type="button" aria-label="Contul meu" className="ml-1 rounded-[11px] p-0.5 transition-shadow hover:ring-2 hover:ring-line">
                  <Avatar name={user.name} size={32} />
                </button>
              }
              items={[
                { header: `${user.name} · ${roleLabel(user.role)}` },
                { label: "Profil și parolă", icon: UserCircle, href: "/setari?tab=profil" },
                { divider: true },
                { header: "Temă" },
                { label: "Ca în sistem", icon: Desktop, onClick: () => setTheme("system"), active: theme === "system" },
                { label: "Luminoasă", icon: Sun, onClick: () => setTheme("light"), active: theme === "light" },
                { label: "Întunecată", icon: Moon, onClick: () => setTheme("dark"), active: theme === "dark" },
                { divider: true },
                { label: "Ieșire din cont", icon: SignOut, onClick: logout, danger: true },
              ]}
            />
          </div>
        </header>

        <main id="continut" className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 sm:px-6 sm:py-7 lg:px-8">
          {children}
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} user={user} />
    </div>
  );
}
