"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, ArrowUp, ArrowDown } from "./icons";
import { cx, SkeletonRows, EmptyState, ErrorState } from "./ui";

/**
 * Tabel de date.
 * columns: [{ key, header, render?(row), className?, headClassName?, align?: "right"|"center", width?, sort? }]
 * rowHref(row) -> link pe tot randul; onRowClick(row)
 * mobile(row) -> randare compacta (card) sub 640px
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

  return (
    <div className={cx(loading && "opacity-70 transition-opacity", className)}>
      {mobile && (
        <div className="divide-y divide-line sm:hidden">
          {rows.map((r, i) => {
            const content = mobile(r);
            return rowHref ? (
              <Link key={r[keyField] ?? i} href={rowHref(r)} className="block px-4 py-3 active:bg-surface-2">
                {content}
              </Link>
            ) : (
              <div key={r[keyField] ?? i} className="px-4 py-3" onClick={() => onRowClick?.(r)}>
                {content}
              </div>
            );
          })}
        </div>
      )}
      <div className={cx("overflow-x-auto", mobile && "hidden sm:block")}>
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
                onClick={clickable ? (e) => {
                  if (e.target.closest("a,button,input,select,label,[data-stop]")) return;
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
                    {c.render ? c.render(r, i) : r[c.key] ?? "—"}
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
  return <div className={cx("flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5", className)}>{children}</div>;
}
