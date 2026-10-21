"use client";

// Pagina de formular (adaugare / editare) in interiorul aplicatiei: meniul ramane in stanga,
// formularul se afiseaza ca o pagina normala, cu bara de actiuni fixata jos.
import { useEffect, useRef } from "react";
import Link from "next/link";
import { cx, Kbd } from "./ui";
import { ArrowLeft, CheckCircle, WarningCircle } from "./icons";

/**
 * props: title, description, back {href,label}, headerAction, footer (butoane),
 *        missing: lista campurilor obligatorii necompletate (se arata langa butoane),
 *        onSubmit: Ctrl/⌘ + Enter salveaza
 */
export function FormPage({ title, description, back, headerAction, footer, missing = [], onSubmit, aside, children }) {
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && submitRef.current) {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="animate-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {back && (
            <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-3 transition-colors hover:text-fg">
              <ArrowLeft size={14} weight="bold" />
              {back.label || "Înapoi"}
            </Link>
          )}
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-[13.5px] text-fg-3">{description}</p>}
        </div>
        {headerAction && <div className="flex flex-wrap items-center gap-2">{headerAction}</div>}
      </div>

      <div className={cx("grid gap-6", aside && "xl:grid-cols-[minmax(0,1fr)_320px]")}>
        <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-6 shadow-xs sm:px-8 sm:py-8">{children}</div>
        {aside && <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">{aside}</div>}
      </div>

      {footer && (
        <div className="sticky bottom-0 z-20 -mx-3 mt-6 border-t border-line bg-bg/90 px-3 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <div className="mr-auto min-w-0 text-[12.5px]">
              {missing.length ? (
                <span className="inline-flex items-center gap-1.5 text-warn">
                  <WarningCircle size={15} weight="fill" className="shrink-0" />
                  <span>
                    Completați:{" "}
                    {missing.map((m, i) => (
                      <span key={m}>
                        {i > 0 && ", "}
                        <b className="font-semibold">{m}</b>
                      </span>
                    ))}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-fg-3">
                  <CheckCircle size={15} weight="fill" className="shrink-0 text-ok" />
                  Gata de salvat
                  {onSubmit && (
                    <span className="ml-1 hidden items-center gap-1 text-fg-4 md:inline-flex">
                      · <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">{footer}</div>
          </div>
        </div>
      )}
    </div>
  );
}
