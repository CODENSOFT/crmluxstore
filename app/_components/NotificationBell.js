"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet } from "@/lib/client";
import { Icon } from "./icons";

// Clopotelul din header — afiseaza numarul de necitite si deschide pagina de notificari
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const d = await apiGet("/api/notifications?countOnly=1");
      setUnread(d.unread);
    } catch {
      /* ignoram erorile de polling */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, [load]);

  // Reimprospateaza la navigare (ex: dupa ce ai marcat citite pe pagina)
  useEffect(() => {
    load();
  }, [pathname, load]);

  return (
    <Link
      href="/notificari"
      title="Notificari"
      className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <Icon name="bell" className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
