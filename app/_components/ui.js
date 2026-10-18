"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useId } from "react";
import { CircleNotch, CaretDown, Eye, EyeSlash, MagnifyingGlass, X, ArrowLeft, ArrowUpRight, ArrowDownRight } from "./icons";
import { stageInfo } from "@/lib/orderStages";
import { PAYMENT_STATUS } from "@/lib/constants";
import { initials } from "@/lib/format";

export const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------------- Butoane ---------------- */
const BTN_VARIANTS = {
  primary:
    "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:translate-y-px disabled:opacity-50",
  secondary:
    "bg-surface text-fg ring-1 ring-inset ring-line-strong shadow-xs hover:bg-surface-2 active:translate-y-px disabled:opacity-50",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40",
  subtle: "bg-surface-2 text-fg hover:bg-surface-3 disabled:opacity-50",
  danger: "bg-bad text-white shadow-xs hover:brightness-110 active:translate-y-px disabled:opacity-50",
  "danger-ghost": "text-bad hover:bg-bad-soft disabled:opacity-40",
  success: "bg-ok text-white shadow-xs hover:brightness-110 active:translate-y-px disabled:opacity-50",
  link: "text-accent hover:underline underline-offset-4 px-0! h-auto!",
};
const BTN_SIZES = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-[13.5px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};
const ICON_SIZES = { xs: 14, sm: 15, md: 16, lg: 17 };

function btnClass({ variant = "secondary", size = "md", full, className }) {
  return cx(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,box-shadow,color,transform] duration-150 disabled:cursor-not-allowed",
    BTN_VARIANTS[variant],
    BTN_SIZES[size],
    full && "w-full",
    className
  );
}

export function Button({ children, variant, size = "md", icon: IconC, iconRight: IconR, loading, full, className, type = "button", ...props }) {
  const s = ICON_SIZES[size];
  return (
    <button type={type} className={btnClass({ variant, size, full, className })} disabled={loading || props.disabled} {...props}>
      {loading ? <CircleNotch size={s} className="animate-spin" /> : IconC ? <IconC size={s} weight="bold" /> : null}
      {children}
      {IconR && !loading ? <IconR size={s} weight="bold" /> : null}
    </button>
  );
}

export function ButtonLink({ href, children, variant, size = "md", icon: IconC, iconRight: IconR, full, className, ...props }) {
  const s = ICON_SIZES[size];
  return (
    <Link href={href} className={btnClass({ variant, size, full, className })} {...props}>
      {IconC ? <IconC size={s} weight="bold" /> : null}
      {children}
      {IconR ? <IconR size={s} weight="bold" /> : null}
    </Link>
  );
}

export function IconButton({ icon: IconC, label, size = "md", variant = "ghost", className, ...props }) {
  const dim = { xs: "h-7 w-7", sm: "h-8 w-8", md: "h-9 w-9", lg: "h-10 w-10" }[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        BTN_VARIANTS[variant],
        dim,
        className
      )}
      {...props}
    >
      <IconC size={size === "xs" ? 15 : 18} />
    </button>
  );
}

/* ---------------- Suprafete ---------------- */
export function Card({ children, className, as: Tag = "div", ...props }) {
  return (
    <Tag className={cx("rounded-xl border border-line bg-surface shadow-xs", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, icon: IconC, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {IconC && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2">
            <IconC size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-fg-3">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Divider({ className }) {
  return <div className={cx("h-px bg-line", className)} />;
}

/* ---------------- Antet pagina ---------------- */
export function PageHeader({ title, description, actions, back, eyebrow, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-3 transition-colors hover:text-fg">
            <ArrowLeft size={14} weight="bold" />
            {back.label || "Înapoi"}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-[12px] font-medium text-fg-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[24px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-fg-3">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Formulare ---------------- */
/**
 * Sectiune de formular: pe ecrane late titlul + explicatia stau in stanga, campurile in dreapta.
 * Sectiunile consecutive sunt despartite de o linie fina.
 */
export function FormSection({ icon: Icon, title, description, aside, children, className }) {
  return (
    <section
      className={cx(
        "grid gap-x-12 gap-y-4 border-t border-line pt-7 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(190px,250px)_minmax(0,1fr)]",
        className
      )}
    >
      <div className="lg:pt-0.5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon size={17} weight="duotone" />
            </span>
          )}
          <h4 className="text-[14px] font-semibold tracking-tight text-fg">{title}</h4>
        </div>
        {description && <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-fg-3">{description}</p>}
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, required, children, className, htmlFor, aside }) {
  return (
    <div className={cx("block", className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-fg-2">
            {label}
            {required && <span className="ml-0.5 text-bad">*</span>}
          </label>
          {aside}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-[12px] font-medium text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-fg-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputBase =
  "w-full rounded-lg border border-line-strong/80 bg-surface px-3 text-[13.5px] text-fg shadow-xs outline-none transition-[border,box-shadow] placeholder:text-fg-4 hover:border-line-strong focus:border-accent focus:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3";

export function Input({ className, prefix, suffix, invalid, ...props }) {
  if (prefix || suffix) {
    return (
      <div className={cx("relative flex items-center", className)}>
        {prefix && <span className="pointer-events-none absolute left-3 flex items-center text-fg-3">{prefix}</span>}
        <input
          className={cx(inputBase, "h-9", prefix && "pl-9", suffix && "pr-12", invalid && "border-bad")}
          {...props}
        />
        {suffix && <span className="pointer-events-none absolute right-3 text-[12.5px] text-fg-3">{suffix}</span>}
      </div>
    );
  }
  return <input className={cx(inputBase, "h-9", invalid && "border-bad", className)} {...props} />;
}

export function NumberInput({ value, onChange, className, ...props }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value.replace(",", "."))}
      className={cx("tnum", className)}
      {...props}
    />
  );
}

export function PasswordInput({ className, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={cx(inputBase, "h-9 pr-10", className)} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ascunde parola" : "Arată parola"}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-fg-3 transition-colors hover:text-fg"
      >
        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cx(inputBase, "resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ children, className, ...props }) {
  return (
    <div className={cx("relative", className)}>
      <select className={cx(inputBase, "h-9 cursor-pointer appearance-none pr-8")} {...props}>
        {children}
      </select>
      <CaretDown size={14} weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

export function Checkbox({ label, description, checked, onChange, className, disabled }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-60", className)}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--accent)]"
      />
      {(label || description) && (
        <span>
          {label && <span className="block text-[13.5px] font-medium text-fg">{label}</span>}
          {description && <span className="block text-[12.5px] text-fg-3">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled, className }) {
  return (
    <label className={cx("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-60", className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13.5px] font-medium text-fg">{label}</span>}
          {description && <span className="mt-0.5 block text-[12.5px] text-fg-3">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-strong"
        )}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}

// Selector segmentat (2–5 optiuni)
export function Segmented({ options, value, onChange, size = "md", className }) {
  return (
    <div className={cx("inline-flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-inset ring-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const IconC = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              active ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg"
            )}
            title={o.title}
          >
            {IconC && <IconC size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Cautare cu intarziere (debounce)
export function SearchInput({ value, onChange, placeholder = "Caută…", delay = 250, className, autoFocus }) {
  const [v, setV] = useState(value || "");
  const [prev, setPrev] = useState(value);
  const first = useRef(true);
  // valoarea din URL s-a schimbat din exterior (ex: Resetează) -> sincronizam campul
  if (value !== prev) {
    setPrev(value);
    setV(value || "");
  }
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (v !== (value || "")) onChange(v);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className={cx("relative", className)}>
      <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
      <input
        value={v}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className={cx(inputBase, "h-9 pl-9 pr-8")}
      />
      {v && (
        <button
          type="button"
          aria-label="Șterge căutarea"
          onClick={() => {
            setV("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-3 hover:text-fg"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------------- Etichete ---------------- */
const TONES = {
  neutral: "bg-surface-2 text-fg-2 ring-line",
  accent: "bg-accent-soft text-accent ring-accent-line",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
  info: "bg-info-soft text-info ring-info/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
};
const DOTS = {
  neutral: "bg-fg-4",
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  violet: "bg-violet",
};

export function Badge({ children, tone = "neutral", dot, className, title }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-[11.5px] font-medium ring-1 ring-inset",
        TONES[tone] || TONES.neutral,
        className
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function StageBadge({ status, short }) {
  const s = stageInfo(status);
  return (
    <Badge tone={s.tone} dot>
      {short ? s.short : s.label}
    </Badge>
  );
}

export function PaymentBadge({ status }) {
  const p = PAYMENT_STATUS[status || "unpaid"];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function Dot({ tone = "neutral", className }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", DOTS[tone], className)} />;
}

/* ---------------- Avatar ---------------- */
const AV = [
  "bg-[#e8eefc] text-[#2148ad]",
  "bg-[#e6f5ee] text-[#16683b]",
  "bg-[#fdf0e3] text-[#9a4d05]",
  "bg-[#f1edfc] text-[#5139b8]",
  "bg-[#e5f4f8] text-[#0b627a]",
  "bg-[#fcebf1] text-[#a3305e]",
];
export function Avatar({ name, size = 32, className }) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold dark:brightness-90", AV[h % AV.length], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ---------------- Stari ---------------- */
export function Spinner({ size = 16, className }) {
  return <CircleNotch size={size} className={cx("animate-spin text-fg-3", className)} />;
}

export function Skeleton({ className, style }) {
  return <div className={cx("skeleton", className)} style={style} />;
}

export function SkeletonRows({ rows = 6, cols = 5 }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-3.5" style={{ width: j === 0 ? "22%" : `${10 + ((i + j) % 4) * 4}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: IconC, title, description, action, className, compact }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 text-center", compact ? "py-10" : "py-16", className)}>
      {IconC && (
        <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-fg-3 ring-1 ring-inset ring-line">
          <IconC size={22} weight="duotone" />
        </span>
      )}
      <p className="text-[14px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-[14px] font-semibold text-fg">Datele nu s-au putut încărca</p>
      <p className="mt-1 max-w-md text-[13px] text-fg-3">{error?.message || "Eroare necunoscută"}</p>
      {onRetry && (
        <Button size="sm" className="mt-4" onClick={onRetry}>
          Reîncearcă
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children, icon: IconC, action, className }) {
  const t = {
    info: "bg-info-soft text-info ring-info/20",
    warn: "bg-warn-soft text-warn ring-warn/25",
    bad: "bg-bad-soft text-bad ring-bad/20",
    ok: "bg-ok-soft text-ok ring-ok/20",
    accent: "bg-accent-soft text-accent ring-accent-line",
  }[tone];
  return (
    <div className={cx("flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset", t, className)}>
      {IconC && <IconC size={18} weight="fill" className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1 text-[13px]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx("text-fg-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Tab-uri ---------------- */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx("-mb-px flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cx(
              "relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-[13.5px] font-medium transition-colors",
              active ? "text-fg" : "text-fg-3 hover:text-fg"
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span
                className={cx(
                  "tnum rounded-md px-1.5 py-px text-[11px] font-semibold",
                  active ? "bg-accent-soft text-accent" : "bg-surface-2 text-fg-3"
                )}
              >
                {t.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Indicatori ---------------- */
const STAT_TONES = {
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
};

export function Stat({ label, value, sub, delta, deltaGoodWhenUp = true, icon: IconC, href, tone, className, loading }) {
  const up = delta > 0;
  const good = delta === 0 || delta == null ? null : up === deltaGoodWhenUp;
  const inner = (
    <div className={cx("flex h-full flex-col gap-3 p-4", href && "transition-colors group-hover:bg-surface-2/60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-fg-3">{label}</span>
        {IconC && (
          <span
            className={cx(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              STAT_TONES[tone] || "bg-surface-2 text-fg-3"
            )}
          >
            <IconC size={15} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <div className="tnum text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</div>
      )}
      {(sub || delta != null) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
          {delta != null && Number.isFinite(delta) && (
            <span className={cx("inline-flex items-center gap-0.5 font-semibold", good === null ? "text-fg-3" : good ? "text-ok" : "text-bad")}>
              {up ? <ArrowUpRight size={12} weight="bold" /> : delta < 0 ? <ArrowDownRight size={12} weight="bold" /> : null}
              {Math.abs(delta).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
  const cls = cx("group overflow-hidden rounded-xl border border-line bg-surface shadow-xs", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Progress({ value, max = 100, tone = "accent", className }) {
  const p = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cx("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${p}%` }} />
    </div>
  );
}

// Lista cheie-valoare (detalii)
export function DetailList({ items, className, cols = 1 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3", cols === 2 && "sm:grid-cols-2", className)}>
      {items
        .filter((x) => x && x[1] !== undefined && x[1] !== null && x[1] !== "")
        .map(([k, v], i) => (
          <div key={i} className="min-w-0">
            <dt className="text-[12px] text-fg-3">{k}</dt>
            <dd className="mt-0.5 break-words text-[13.5px] text-fg">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-sans text-[11px] font-medium text-fg-3">
      {children}
    </kbd>
  );
}

export function Money({ value, currency = "MDL", className, muted }) {
  const v = Number(value || 0);
  return (
    <span className={cx("tnum whitespace-nowrap", className)}>
      {v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      <span className={cx("ml-1 text-[0.85em]", muted !== false && "text-fg-3")}>{currency}</span>
    </span>
  );
}
