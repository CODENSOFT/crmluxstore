"use client";

import { useEffect, useState } from "react";
import { apiGet, formatDateTime } from "@/lib/client";
import { Card, Badge, Empty, PageHeader, useToast } from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";

const CATEGORIES = [
  ["", "Toate"],
  ["order", "Comenzi"],
  ["stock", "Stoc"],
  ["product", "Produse"],
  ["supplier", "Furnizori"],
];

// Iconita + culoare in functie de actiune
function actionStyle(action) {
  if (action.startsWith("supplier"))
    return { icon: "truck", tone: "bg-indigo-50 text-indigo-600" };
  if (action.startsWith("product"))
    return { icon: "package", tone: "bg-violet-50 text-violet-600" };
  if (action === "transfer")
    return { icon: "transfer", tone: "bg-sky-50 text-sky-600" };
  if (action === "arrival")
    return { icon: "inbox", tone: "bg-emerald-50 text-emerald-600" };
  if (action === "writeoff")
    return { icon: "trash", tone: "bg-rose-50 text-rose-600" };
  if (action.includes("reject"))
    return { icon: "x", tone: "bg-rose-50 text-rose-600" };
  if (action.includes("approv"))
    return { icon: "checkCircle", tone: "bg-emerald-50 text-emerald-600" };
  if (action === "deleted")
    return { icon: "trash", tone: "bg-rose-50 text-rose-600" };
  return { icon: "receipt", tone: "bg-indigo-50 text-indigo-600" };
}

export default function ActivityPage() {
  const me = useUser();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = cat ? `?category=${cat}` : "";
      setItems(await apiGet(`/api/activity${q}`));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  if (me?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-slate-500">
        Acces permis doar administratorului.
      </Card>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Istoric activitate"
        subtitle="Cine, ce si cum — comenzi, stoc, produse. Se pastreaza 1 luna, apoi se sterge automat."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setCat(v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              cat === v
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Se incarca…
          </div>
        ) : items.length === 0 ? (
          <Empty>Nu exista activitate inregistrata.</Empty>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map((a) => {
              const st = actionStyle(a.action);
              return (
                <div key={a._id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${st.tone}`}
                  >
                    <Icon name={st.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-slate-800">
                        {a.userName}
                      </span>
                      <Badge color={a.userRole === "admin" ? "blue" : "slate"}>
                        {a.userRole === "admin" ? "admin" : "manager"}
                      </Badge>
                      <span className="text-sm text-slate-500">{a.label}</span>
                      {a.orderNumber && (
                        <span className="text-sm font-medium text-indigo-600">
                          {a.orderNumber}
                        </span>
                      )}
                    </div>
                    {a.details && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {a.details}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
