"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Plus, Buildings, User, CircleNotch, X } from "./icons";
import { cx, inputBase, Badge } from "./ui";
import { api } from "@/lib/client";
import { UNIT_LABELS, segmentLabel } from "@/lib/constants";
import { num } from "@/lib/format";

/**
 * Camp de cautare cu lista derulanta si navigare din tastatura.
 * search(q) -> array (sincron sau Promise)
 */
export function Combobox({
  search,
  onSelect,
  renderItem,
  placeholder = "Caută…",
  footer,
  autoFocus,
  className,
  onEnterRaw,
  clearOnSelect = true,
  minChars = 0,
  icon = true,
  inputRef: externalRef,
  disabled,
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrap = useRef(null);
  const innerRef = useRef(null);
  const inputRef = externalRef || innerRef;
  const req = useRef(0);

  useEffect(() => {
    if (!open || q.length < minChars) return;
    const id = ++req.current;
    const run = async () => {
      setLoading(true);
      try {
        const res = await search(q);
        if (id === req.current) {
          setItems(res || []);
          setActive(0);
        }
      } finally {
        if (id === req.current) setLoading(false);
      }
    };
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [q, open, search, minChars]);

  useEffect(() => {
    const onDoc = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = q.length < minChars ? [] : items;
  const choose = (it) => {
    onSelect(it);
    if (clearOnSelect) setQ("");
    setOpen(false);
  };

  return (
    <div ref={wrap} className={cx("relative", className)}>
      {icon && <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />}
      <input
        ref={inputRef}
        value={q}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(visible.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (onEnterRaw && q && onEnterRaw(q)) {
              setQ("");
              return;
            }
            if (visible[active]) choose(visible[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cx(inputBase, "h-9", icon && "pl-9", loading && "pr-8")}
      />
      {loading && <CircleNotch size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-3" />}
      {open && (visible.length > 0 || footer || (q && !loading)) && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 animate-pop overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {visible.map((it, i) => (
              <button
                type="button"
                key={it._id || i}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(it)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", i === active ? "bg-surface-2" : "")}
              >
                {renderItem(it, i === active)}
              </button>
            ))}
            {!visible.length && q.length >= minChars && !loading && (
              <div className="px-3 py-3 text-[13px] text-fg-3">Niciun rezultat pentru „{q}”</div>
            )}
          </div>
          {footer && <div className="border-t border-line p-1">{typeof footer === "function" ? footer(q, () => setOpen(false)) : footer}</div>}
        </div>
      )}
    </div>
  );
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function stockIn(product, warehouseId) {
  if (!product) return 0;
  if (!warehouseId) return (product.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
  const e = (product.stock || []).find((s) => String(s.warehouse?._id || s.warehouse) === String(warehouseId));
  return e ? e.quantity : 0;
}

// Cautare produse in lista incarcata (nume, SKU, cod de bare, marca) — fara diacritice
export function filterProducts(products, q, limit = 40) {
  const t = norm(q).trim();
  if (!t) return products.slice(0, limit);
  const words = t.split(/\s+/);
  const scored = [];
  for (const p of products) {
    const hay = norm(`${p.name} ${p.sku || ""} ${p.barcode || ""} ${p.brand || ""}`);
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (norm(p.sku) === t || p.barcode === q.trim()) score = 100;
    else if (norm(p.name).startsWith(t)) score = 50;
    scored.push([score, p]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map((x) => x[1]);
}

export function ProductPicker({ products, warehouse, onSelect, placeholder = "Caută produs după nume, SKU sau cod de bare…", priceType, autoFocus, inputRef }) {
  const search = useMemo(() => (q) => filterProducts(products || [], q), [products]);
  return (
    <Combobox
      search={search}
      onSelect={onSelect}
      autoFocus={autoFocus}
      inputRef={inputRef}
      placeholder={placeholder}
      // Scanner de coduri de bare: Enter cu cod exact -> adauga direct
      onEnterRaw={(q) => {
        const t = q.trim();
        const hit = (products || []).find((p) => p.barcode === t || (p.sku && p.sku.toLowerCase() === t.toLowerCase()));
        if (hit) {
          onSelect(hit);
          return true;
        }
        return false;
      }}
      renderItem={(p) => {
        const st = stockIn(p, warehouse);
        const price = priceType === "wholesale" && p.wholesalePrice > 0 ? p.wholesalePrice : p.price;
        return (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-fg">{p.name}</div>
              <div className="truncate text-[12px] text-fg-3">
                {[p.sku, p.brand, p.packaging].filter(Boolean).join(" · ") || "fără cod"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum text-[13px] font-medium text-fg">{num(price, 2)} MDL</div>
              <div className={cx("tnum text-[12px]", st > 0 ? "text-fg-3" : "text-bad")}>
                {st > 0 ? `${num(st)} ${UNIT_LABELS[p.unit] || ""}` : "fără stoc"}
              </div>
            </div>
          </>
        );
      }}
    />
  );
}

export function CustomerPicker({ onSelect, onCreate, placeholder = "Caută client după nume, telefon sau IDNO…", autoFocus }) {
  const search = useMemo(() => (q) => api(`/api/customers?light=1&limit=12&q=${encodeURIComponent(q)}`), []);
  return (
    <Combobox
      search={search}
      onSelect={onSelect}
      autoFocus={autoFocus}
      placeholder={placeholder}
      renderItem={(c) => (
        <>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
            {c.type === "company" ? <Buildings size={16} /> : <User size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-fg">{c.name}</div>
            <div className="truncate text-[12px] text-fg-3">{[c.phone, c.idno && `IDNO ${c.idno}`, c.city].filter(Boolean).join(" · ") || c.number}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge>{segmentLabel(c.segment)}</Badge>
            {(c.priceType === "wholesale" || c.discount > 0) && (
              <span className="text-[11.5px] text-fg-3">
                {c.priceType === "wholesale" ? "angro" : ""}
                {c.discount > 0 ? ` −${c.discount}%` : ""}
              </span>
            )}
          </div>
        </>
      )}
      footer={
        onCreate
          ? (q, close) => (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onCreate(q);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-accent hover:bg-accent-soft"
              >
                <Plus size={15} weight="bold" />
                {q ? `Client nou „${q}”` : "Client nou"}
              </button>
            )
          : undefined
      }
    />
  );
}

// Valoare selectata afisata ca "pastila" cu buton de stergere
export function SelectedChip({ icon: IconC, title, subtitle, onClear, right }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      {IconC && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-2 ring-1 ring-inset ring-line">
          <IconC size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-fg">{title}</div>
        {subtitle && <div className={cx("mt-0.5 text-[12px] text-fg-3", typeof subtitle === "string" && "truncate")}>{subtitle}</div>}
      </div>
      {right}
      {onClear && (
        <button type="button" onClick={onClear} aria-label="Elimină" className="rounded-md p-1 text-fg-3 hover:bg-surface-3 hover:text-fg">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
