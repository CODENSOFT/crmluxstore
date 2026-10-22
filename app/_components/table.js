"use client";

import Link from "@/app/_components/link";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, ArrowUp, ArrowDown } from "./icons";
import { cx, SkeletonRows, EmptyState, ErrorState } from "./ui";

/**
 * Tabel de date.
 * columns: [{ key, header, render?(row), className?, headClassName?, align?: "right"|"center", width?, sort? }]
 * rowHref(row) -> link pe tot randul; onRowClick(row)
 * mobile(row) -> randare compacta (card) sub 640px. Fara `mobile`, pe telefon fiecare rand devine automat
 *   un cartonas: prima coloana = titlu, coloanele fara antet text (bife, butoane) = dreapta sus,
 *   restul = „eticheta: valoare”. mobile={false} pastreaza tabelul (cu derulare laterala).
 *   Pe coloana: mobileLabel (alt text pe telefon), mobile: false (ascunsa pe telefon).
 */
export function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  empty,
  rowHref,
  onRowClick,
  keyField = "_id",
  mobile,
  sort,
  onSort,
  footer,
  dense,
  className,
  rowClassName,
}) {
  const router = useRouter();
  if (error && !rows?.length) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows?.length) return <SkeletonRows cols={Math.min(columns.length, 6)} />;
  if (!rows?.length) return empty || <EmptyState title="Nu există înregistrări" compact />;

  const align = (c) => (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");
  const go = (row) => {
    if (onRowClick) return onRowClick(row);
    if (rowHref) router.push(rowHref(row));
  };
  const clickable = !!(rowHref || onRowClick);
  // randurile clicabile se pot deschide si de la tastatura (Tab + Enter)
  const keyOpen = (r) => (e) => {
    if (e.key === "Enter" && e.target === e.currentTarget) go(r);
  };

  const auto = mobile === undefined && !footer;
  const cell = (c, r, i) => (c.render ? c.render(r, i) : r[c.key] ?? "—");
  const autoCard = (r, i) => {
    const [head, ...rest] = columns.filter((c) => c.mobile !== false);
    const label = (c) => c.mobileLabel ?? (typeof c.header === "string" ? c.header.trim() : "");
    const side = rest.filter((c) => !label(c));
    const pairs = rest.filter((c) => label(c));
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 break-words text-[14px] font-medium text-fg">{head && cell(head, r, i)}</div>
          {side.length > 0 && (
            <div className="flex shrink-0 items-center gap-1" data-stop>
              {side.map((c) => (
                <span key={c.key}>{cell(c, r, i)}</span>
              ))}
            </div>
          )}
        </div>
        {pairs.length > 0 && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-[13px]">
            {pairs.map((c) => (
              <div key={c.key} className="contents">
                <dt className="text-fg-3">{label(c)}</dt>
                <dd className="flex min-w-0 justify-end break-words text-right text-fg-2">{cell(c, r, i)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  };

  return (
    <div className={cx(loading && "opacity-70 transition-opacity", className)}>
      {auto && (
        <div className="divide-y divide-line sm:hidden">
          {rows.map((r, i) => (
            <div
              key={r[keyField] ?? i}
              role={clickable ? (rowHref ? "link" : "button") : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? keyOpen(r) : undefined}
              onClick={clickable ? (e) => {
                // click venit din meniuri/foi deschise din rand (portal) sau pe elemente interactive -> nu deschide randul
                if (!e.currentTarget.contains(e.target) || e.target.closest("a,button,input,select,label,[data-stop]")) return;
                go(r);
              } : undefined}
              className={cx(
                "px-4 py-3.5",
                clickable && "cursor-pointer active:bg-surface-2",
                typeof rowClassName === "function" ? rowClassName(r) : rowClassName
              )}
            >
              {autoCard(r, i)}
            </div>
          ))}
        </div>
      )}
      {mobile && (
        <div className="divide-y divide-line sm:hidden">
          {rows.map((r, i) => {
            const content = mobile(r);
            return rowHref ? (
              <Link key={r[keyField] ?? i} href={rowHref(r)} className="block px-4 py-3 active:bg-surface-2">
                {content}
              </Link>
            ) : (
              <div
                key={r[keyField] ?? i}
                className="px-4 py-3"
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? keyOpen(r) : undefined}
                onClick={() => onRowClick?.(r)}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
      <div className={cx("overflow-x-auto", (mobile || auto) && "hidden sm:block")}>
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => {
                const sortable = c.sort && onSort;
                const activeSort = sort === c.sort || sort === `-${c.sort}`;
                const desc = sort === `-${c.sort}`;
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={cx(
                      "whitespace-nowrap bg-surface-2/60 px-4 py-2.5 text-[12px] font-medium text-fg-3 first:pl-5 last:pr-5",
                      align(c),
                      c.headClassName
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(activeSort && !desc ? `-${c.sort}` : c.sort)}
                        className={cx("inline-flex items-center gap-1 hover:text-fg", activeSort && "text-fg")}
                      >
                        {c.header}
                        {activeSort && (desc ? <ArrowDown size={12} weight="bold" /> : <ArrowUp size={12} weight="bold" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr
                key={r[keyField] ?? i}
                {...(clickable ? { tabIndex: 0, onKeyDown: keyOpen(r) } : {})}
                onClick={clickable ? (e) => {
                  // click venit din meniuri/foi deschise din rand (portal) sau pe elemente interactive -> nu deschide randul
                if (!e.currentTarget.contains(e.target) || e.target.closest("a,button,input,select,label,[data-stop]")) return;
                  go(r);
                } : undefined}
                className={cx(
                  "transition-colors",
                  clickable && "cursor-pointer hover:bg-surface-2/70",
                  typeof rowClassName === "function" ? rowClassName(r) : rowClassName
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      "px-4 align-middle text-fg-2 first:pl-5 last:pr-5",
                      dense ? "py-2" : "py-3",
                      align(c),
                      c.className
                    )}
                  >
                    {cell(c, r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="border-t border-line bg-surface-2/40">{footer}</tfoot>}
        </table>
      </div>
    </div>
  );
}

export function Pagination({ page, limit, total, onChange, className }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={cx("flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-fg-3", className)}>
      <span className="tnum">
        {from}–{to} din {total.toLocaleString("ro-RO")}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-30"
          aria-label="Pagina anterioară"
        >
          <CaretLeft size={15} weight="bold" />
        </button>
        <span className="tnum px-2 font-medium text-fg-2">
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-30"
          aria-label="Pagina următoare"
        >
          <CaretRight size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}

// Rand de filtre deasupra unui tabel
export function Toolbar({ children, className }) {
  // pe telefon filtrele umplu randul (latimi egale), butoanele raman compacte
  return <div className={cx("flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5 max-sm:[&>*:not(button)]:grow", className)}>{children}</div>;
}
