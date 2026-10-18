"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, CheckCircle, WarningCircle, Info, ArrowLeft } from "./icons";
import { Button, cx, Input, Kbd } from "./ui";

/* ---------------- Modal (dialog nativ) ---------------- */
const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", full: "max-w-6xl" };

export function Modal({ open, onClose, title, description, children, footer, size = "md", className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      className="m-0 h-full max-h-none w-full max-w-none items-start justify-center overflow-y-auto bg-transparent p-3 open:flex sm:p-6"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        className={cx(
          "relative my-auto w-full animate-pop rounded-2xl border border-line bg-surface shadow-lg sm:my-[6vh]",
          SIZES[size],
          className
        )}
        role="document"
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold tracking-tight text-fg">{title}</h3>
              {description && <p className="mt-1 text-[13px] text-fg-3">{description}</p>}
            </div>
            <button
              type="button"
              aria-label="Închide"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-surface-2/50 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

/* ---------------- Panou din dreapta (formulare, detalii) ---------------- */
// Laptop / calculator: 80% din latimea ecranului, pagina ramane vizibila in stanga.
// Telefon / tableta: tot ecranul.
export function Drawer({ open, onClose, title, description, children, footer, width = "lg:w-[80vw]", headerAction }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 open:flex"
    >
      <div className="hidden flex-1 cursor-pointer lg:block" onClick={onClose} aria-hidden />
      <div className={cx("flex h-dvh w-full shrink-0 animate-slide flex-col bg-surface shadow-lg lg:rounded-l-2xl lg:border-l lg:border-line", width)}>
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-6 lg:px-10 lg:py-4">
          <button
            type="button"
            aria-label="Înapoi"
            onClick={onClose}
            className="-ml-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-semibold tracking-tight text-fg lg:text-[19px]">{title}</h3>
            {description && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-3">{description}</p>}
          </div>
          {headerAction && <div className="flex shrink-0 items-center gap-2">{headerAction}</div>}
          <span className="hidden items-center gap-1.5 text-[12px] text-fg-4 lg:flex">
            <Kbd>Esc</Kbd>
          </span>
          <button
            type="button"
            aria-label="Închide"
            onClick={onClose}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg lg:inline-flex"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-10 lg:py-8">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

/* ---------------- Confirmare (inlocuieste window.confirm) ---------------- */
const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState("");
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setText(opts.input?.defaultValue || "");
        setState({ ...opts, resolve });
      }),
    []
  );
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelLabel || "Renunță"}
            </Button>
            <Button
              variant={state?.tone === "danger" ? "danger" : "primary"}
              disabled={state?.input?.required && !text.trim()}
              onClick={() => close(state?.input ? text : true)}
              autoFocus={!state?.input}
            >
              {state?.confirmLabel || "Confirmă"}
            </Button>
          </>
        }
      >
        {state?.message && <p className="text-[13.5px] leading-relaxed text-fg-2">{state.message}</p>}
        {state?.input && (
          <div className={cx(state?.message && "mt-4")}>
            {state.input.label && <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">{state.input.label}</div>}
            <Input
              autoFocus
              value={text}
              placeholder={state.input.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (!state.input.required || text.trim())) close(text);
              }}
            />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx) || (async (o) => window.confirm(o.message || o.title));
}

/* ---------------- Meniu derulant ---------------- */
export function Menu({ trigger, items, align = "right", width = "w-56", className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cx("relative inline-flex", className)}>
      <span onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </span>
      {open && (
        <div
          role="menu"
          className={cx(
            "absolute top-full z-50 mt-1.5 animate-pop overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg",
            width,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.filter(Boolean).map((it, i) => {
            if (it.divider) return <div key={i} className="my-1 h-px bg-line" />;
            if (it.header) return <div key={i} className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-fg-3">{it.header}</div>;
            const IconC = it.icon;
            const cls = cx(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40",
              it.danger ? "text-bad hover:bg-bad-soft" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
              it.active && "bg-surface-2 text-fg"
            );
            const content = (
              <>
                {IconC && <IconC size={16} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[11.5px] text-fg-4">{it.hint}</span>}
              </>
            );
            if (it.href && (it.download || it.external)) {
              return (
                <a key={i} href={it.href} className={cls} onClick={() => setOpen(false)} target={it.external ? "_blank" : undefined} rel="noreferrer" download={it.download ? "" : undefined}>
                  {content}
                </a>
              );
            }
            return it.href ? (
              <Link key={i} href={it.href} className={cls} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={cls}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Popover generic ---------------- */
export function Popover({ trigger, children, align = "right", width = "w-80", open: controlled, onOpenChange }) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (v) => (onOpenChange ? onOpenChange(v) : setInner(v));
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  });
  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen(!open)} className="inline-flex">
        {trigger}
      </span>
      {open && (
        <div
          className={cx(
            "absolute top-full z-50 mt-1.5 animate-pop rounded-xl border border-line bg-surface shadow-lg",
            width,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

/* ---------------- Notificari toast ---------------- */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const IconC = t.type === "error" ? WarningCircle : t.type === "info" ? Info : CheckCircle;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-in items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] text-fg shadow-lg"
            >
              <IconC
                size={18}
                weight="fill"
                className={cx("mt-px shrink-0", t.type === "error" ? "text-bad" : t.type === "info" ? "text-info" : "text-ok")}
              />
              <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                aria-label="Închide"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className="shrink-0 rounded p-0.5 text-fg-4 hover:text-fg"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

const NOOP = () => undefined;
export function useToast() {
  return useContext(ToastCtx) || NOOP;
}
