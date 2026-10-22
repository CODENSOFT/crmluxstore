"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "@/app/_components/link";
import { useRouter } from "next/navigation";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser, can } from "@/app/_components/user";
import { PublishModal, usePublishInfo } from "./_publish";
import { money, num, pct } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { Card, PageHeader, Button, Select, SearchInput, Badge, EmptyState, Segmented, Dot, cx, Skeleton } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Menu } from "@/app/_components/overlay";
import { Plus, DownloadSimple, UploadSimple, Package, Rows, SquaresFour, ImageIcon, Tag, DotsThree, Globe } from "@/app/_components/icons";
import { ImportDrawer, CategoriesModal } from "./_tools";

const STOCK = { in: { tone: "ok", label: "În stoc" }, low: { tone: "warn", label: "Stoc mic" }, out: { tone: "bad", label: "Fără stoc" } };

function Thumb({ p, size = 40 }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2" style={{ width: size, height: size }}>
      {p.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photoUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <ImageIcon size={size * 0.42} className="text-fg-4" />
      )}
    </span>
  );
}

const marginOf = (p) => {
  if (!(p.price > 0 && p.costPrice > 0)) return null;
  const net = p.price / (1 + (p.vatRate ?? 20) / 100);
  return ((net - p.costPrice) / net) * 100;
};

function ProductsInner() {
  const router = useRouter();
  const user = useUser();
  const manage = can(user, "products.manage");
  const { data: publishInfo } = usePublishInfo(manage);
  const [publishing, setPublishing] = useState(false);
  const [f, setF] = useQueryState({ page: "1", sort: "name", view: "table", active: "1" });
  // linkuri vechi „?nou=1” -> pagina noua
  useEffect(() => {
    if (f.nou === "1") router.replace("/produse/nou");
  }, [f.nou, router]);
  const [importing, setImporting] = useState(false);
  const [cats, setCats] = useState(false);
  const params = { q: f.q, category: f.category, brand: f.brand, status: f.status, warehouse: f.warehouse, sort: f.sort, active: f.active, page: f.page, limit: 48 };
  const { data, loading, error, reload } = useApi(`/api/products${qs(params)}`);
  const { data: categories } = useApi("/api/categories");
  const { data: warehouses } = useApi("/api/warehouses");

  const columns = [
    {
      key: "name",
      header: "Produs",
      render: (p) => (
        <div className="flex min-w-[240px] items-center gap-3">
          <Thumb p={p} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-fg">{p.name}</span>
              {p.isComposite && <Badge tone="violet">Set</Badge>}
              {p.active === false && <Badge tone="bad">Inactiv</Badge>}
            </div>
            <div className="truncate text-[12px] text-fg-3">{[p.sku, p.brand, p.packaging].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Categorie",
      className: "hidden lg:table-cell",
      headClassName: "hidden lg:table-cell",
      render: (p) => <span className="text-[12.5px] text-fg-2">{p.categoryName || <span className="text-fg-4">—</span>}</span>,
    },
    {
      key: "price",
      header: "Preț",
      align: "right",
      sort: "price",
      render: (p) => (
        <div className="whitespace-nowrap">
          <div className="tnum font-medium text-fg">{money(p.price)}</div>
          {p.wholesalePrice > 0 && <div className="tnum text-[12px] text-fg-3">angro {money(p.wholesalePrice)}</div>}
        </div>
      ),
    },
    {
      key: "margin",
      header: "Marjă",
      align: "right",
      className: "hidden xl:table-cell",
      headClassName: "hidden xl:table-cell",
      render: (p) => {
        const m = marginOf(p);
        return m == null ? <span className="text-fg-4">—</span> : <span className={cx("tnum text-[12.5px]", m < 15 ? "text-warn" : "text-fg-2")}>{pct(m, 0)}</span>;
      },
    },
    {
      key: "stock",
      header: f.warehouse ? "Stoc depozit" : "Stoc",
      align: "right",
      sort: "stock",
      render: (p) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Dot tone={STOCK[p.stockStatus]?.tone} />
          <span className={cx("tnum font-medium", p.stockStatus === "out" ? "text-bad" : p.stockStatus === "low" ? "text-warn" : "text-fg")}>{num(p.totalStock)}</span>
          <span className="text-[12px] text-fg-3">{UNIT_LABELS[p.unit]}</span>
        </div>
      ),
    },
  ];

  const filtered = f.q || f.category || f.brand || f.status || f.warehouse;

  return (
    <div className="animate-in">
      <PageHeader
        title="Produse"
        description="Catalogul magazinului: chimie auto, spumă activă, detailing, parfumuri, echipamente și piese pentru spălătorii."
        actions={
          <>
            <Menu
              trigger={<Button icon={DotsThree}>Instrumente</Button>}
              items={[
                manage && { label: "Import din Excel / CSV", icon: UploadSimple, onClick: () => setImporting(true) },
                { label: "Export în Excel (CSV)", icon: DownloadSimple, download: true, href: `/api/products${qs({ ...params, page: undefined, limit: undefined, format: "csv" })}` },
                manage && { label: "Gestionare categorii", icon: Tag, onClick: () => setCats(true) },
              ]}
            />
            {manage && publishInfo?.configured && publishInfo.pending > 0 && (
              <Button icon={Globe} onClick={() => setPublishing(true)}>
                Publică pe site
                <Badge tone="accent" className="ml-1">{publishInfo.pending}</Badge>
              </Button>
            )}
            {manage && (
              <Button variant="primary" icon={Plus} onClick={() => router.push("/produse/nou")}>
                Produs nou
              </Button>
            )}
          </>
        }
      />
      <PublishModal open={publishing} onClose={() => setPublishing(false)} title="Publicare produse noi pe site" onDone={() => invalidate("/api/products/publish")} />

      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[{ _id: "", name: "Toate", productCount: null }, ...(categories || [])].map((c) => {
          const active = (f.category || "") === c._id;
          return (
            <button
              key={c._id || "all"}
              type="button"
              onClick={() => setF({ category: c._id })}
              className={cx(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium ring-1 ring-inset transition-colors",
                active ? "bg-fg text-bg ring-fg" : "bg-surface text-fg-2 ring-line hover:ring-line-strong"
              )}
            >
              {c.name}
              {c.productCount != null && <span className={cx("tnum text-[11.5px]", active ? "text-bg/70" : "text-fg-4")}>{c.productCount}</span>}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Denumire, SKU, cod de bare, marcă…" className="w-full sm:w-72" />
          <Select value={f.status || ""} onChange={(e) => setF({ status: e.target.value })} className="w-[150px]">
            <option value="">Orice stoc</option>
            <option value="in">În stoc</option>
            <option value="low">Stoc mic</option>
            <option value="out">Fără stoc</option>
          </Select>
          {data?.brands?.length > 0 && (
            <Select value={f.brand || ""} onChange={(e) => setF({ brand: e.target.value })} className="w-[160px]">
              <option value="">Toate mărcile</option>
              {data.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          )}
          {warehouses?.length > 1 && (
            <Select value={f.warehouse || ""} onChange={(e) => setF({ warehouse: e.target.value })} className="w-[170px]">
              <option value="">Toate depozitele</option>
              {warehouses.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={f.active} onChange={(e) => setF({ active: e.target.value })} className="w-[130px]">
            <option value="1">Active</option>
            <option value="0">Inactive</option>
            <option value="">Toate</option>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Select value={f.sort} onChange={(e) => setF({ sort: e.target.value })} className="w-[170px]">
              <option value="name">Denumire A–Z</option>
              <option value="-createdAt">Cele mai noi</option>
              <option value="price">Preț crescător</option>
              <option value="-price">Preț descrescător</option>
              <option value="stock">Stoc crescător</option>
              <option value="-stock">Stoc descrescător</option>
            </Select>
            <Segmented
              size="sm"
              value={f.view}
              onChange={(v) => setF({ view: v }, { resetPage: false })}
              options={[
                { value: "table", icon: Rows, title: "Tabel" },
                { value: "grid", icon: SquaresFour, title: "Galerie" },
              ]}
            />
          </div>
        </Toolbar>

        {f.view === "grid" ? (
          loading && !data ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          ) : data?.items?.length ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {data.items.map((p) => (
                <Link key={p._id} href={`/produse/${p._id}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-md">
                  <div className="flex aspect-square items-center justify-center bg-surface-2">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name} loading="lazy" className="h-full w-full object-contain p-3 transition-transform group-hover:scale-[1.03]" />
                    ) : (
                      <ImageIcon size={34} className="text-fg-4" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="line-clamp-2 text-[13px] font-medium leading-snug text-fg">{p.name}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-fg-3">{p.sku || p.brand || p.categoryName || "—"}</div>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <span className="tnum text-[13.5px] font-semibold text-fg">{money(p.price)}</span>
                      <Badge tone={STOCK[p.stockStatus]?.tone}>{num(p.totalStock)} {UNIT_LABELS[p.unit]}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={Package} title="Niciun produs găsit" />
          )
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items}
            loading={loading}
            error={error}
            onRetry={reload}
            sort={f.sort}
            onSort={(s) => setF({ sort: s })}
            rowHref={(p) => `/produse/${p._id}`}
            mobile={(p) => (
              <div className="flex items-center gap-3">
                <Thumb p={p} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-fg">{p.name}</div>
                  <div className="truncate text-[12px] text-fg-3">{p.sku || p.brand || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[13px] font-medium text-fg">{money(p.price)}</div>
                  <div className={cx("tnum text-[12px]", p.stockStatus === "out" ? "text-bad" : p.stockStatus === "low" ? "text-warn" : "text-fg-3")}>
                    {num(p.totalStock)} {UNIT_LABELS[p.unit]}
                  </div>
                </div>
              </div>
            )}
            empty={
              <EmptyState
                icon={Package}
                title={filtered ? "Niciun produs nu corespunde filtrelor" : "Catalogul este gol"}
                description={filtered ? "Modificați căutarea." : "Adăugați produse manual, importați din Excel sau din site (Integrări → Site)."}
                action={
                  !filtered && (
                    <div className="flex gap-2">
                      {manage && (
                        <Button size="sm" icon={UploadSimple} onClick={() => setImporting(true)}>
                          Import
                        </Button>
                      )}
                      {manage && (
                        <Button size="sm" variant="primary" icon={Plus} onClick={() => router.push("/produse/nou")}>
                          Produs nou
                        </Button>
                      )}
                    </div>
                  )
                }
              />
            }
          />
        )}
        <Pagination page={Number(f.page) || 1} limit={48} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>

      <ImportDrawer open={importing} onClose={() => setImporting(false)} />
      <CategoriesModal open={cats} onClose={() => setCats(false)} />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsInner />
    </Suspense>
  );
}
