"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { Icon } from "./icons";

/* ---------- Butoane ---------- */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  const variants = {
    primary:
      "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:shadow-none",
    secondary:
      "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
    success:
      "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700",
    danger:
      "bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-700",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-2.5 text-sm",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/40 ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- Inputuri ---------- */
export function Field({ label, children, required, hint }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15";

export function Input(props) {
  return <input className={`${inputBase} ${props.className || ""}`} {...props} />;
}

// Input parola cu buton de afisare/ascundere (ochi)
export function PasswordInput({ className = "", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={`${inputBase} pr-10 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        title={show ? "Ascunde parola" : "Vezi parola"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600"
      >
        <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Textarea(props) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${inputBase} resize-y ${props.className || ""}`}
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <select className={`${inputBase} ${props.className || ""}`} {...props}>
      {children}
    </select>
  );
}

/* ---------- Badge status ---------- */
export function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    yellow: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    blue: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colors[color]}`}
    >
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`animate-fade mt-10 w-full ${width} rounded-2xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="x" className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Tabel ---------- */
export function Table({ columns, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
            {columns.map((c, i) => (
              <th key={i} className="px-5 py-3.5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children = "Nu exista inregistrari." }) {
  return (
    <div className="py-16 text-center text-sm text-slate-400">{children}</div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-fade flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-900/10 ring-1 ring-slate-200"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                t.type === "error"
                  ? "bg-rose-100 text-rose-600"
                  : "bg-emerald-100 text-emerald-600"
              }`}
            >
              <Icon
                name={t.type === "error" ? "alert" : "checkCircle"}
                className="h-4 w-4"
                strokeWidth={2}
              />
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx) || (() => {});
}
