"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X, Package, CaretRight, CircleNotch, TelegramLogo } from "../_components/icons";

const TEXT = {
  ro: {
    search: "Caută: parfum auto 50-100 lei",
    clear: "Șterge căutarea",
    all: "Toate",
    inStock: "În stoc",
    outOfStock: "Nu este în stoc",
    empty: "Nu am găsit produse",
    searchAll: "Caută în toate categoriile",
    outside: "Deschideți lista din botul Telegram.",
    failed: "Lista nu s-a putut încărca.",
    retry: "Încearcă din nou",
    pickFailed: "Produsul nu s-a putut deschide. Încercați din nou.",
  },
  ru: {
    search: "Поиск: parfum auto 50-100 лей",
    clear: "Очистить поиск",
    all: "Все",
    inStock: "В наличии",
    outOfStock: "Нет в наличии",
    empty: "Товары не найдены",
    searchAll: "Искать во всех категориях",
    outside: "Откройте список из Telegram-бота.",
    failed: "Не удалось загрузить список.",
    retry: "Повторить",
    pickFailed: "Не удалось открыть товар. Попробуйте ещё раз.",
  },
};

// Lista de produse cu poze, in interiorul Telegram (fara tastatura: campul de cautare se deschide doar la atingere).
// Atingerea unui produs trimite fisa lui in chat si inchide lista.
export default function TelegramCatalog({ category, query, lang }) {
  const [app, setApp] = useState(null); // window.Telegram.WebApp, dupa incarcarea scriptului Telegram
  const [outside, setOutside] = useState(false);
  const [cat, setCat] = useState(category);
  const [q, setQ] = useState(query);
  const [search, setSearch] = useState(query.trim()); // q dupa ce clientul se opreste din scris
  const [reload, setReload] = useState(0);
  const [data, setData] = useState(null); // { key, lang, categories, products }
  const [failedKey, setFailedKey] = useState(null);
  const [picking, setPicking] = useState(null);
  const [pickError, setPickError] = useState(false);
  const activeChip = useRef(null);
  const t = TEXT[data?.lang || lang] || TEXT.ro;
  const key = `${cat}|${search}|${reload}`;
  const loading = data?.key !== key && failedKey !== key;

  const init = useCallback(() => {
    const w = window.Telegram?.WebApp;
    if (!w?.initData) return setOutside(true);
    const theme = () => (document.documentElement.dataset.theme = w.colorScheme === "dark" ? "dark" : "light");
    theme();
    w.onEvent("themeChanged", theme);
    w.setHeaderColor("secondary_bg_color");
    w.setBackgroundColor("secondary_bg_color");
    w.ready();
    w.expand();
    setApp(w);
  }, []);

  // culorile temei Telegram pe toata pagina (vezi :root.tg-app in globals.css)
  useEffect(() => {
    document.documentElement.classList.add("tg-app");
    return () => document.documentElement.classList.remove("tg-app");
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!app) return;
    const ctl = new AbortController();
    fetch(`/api/telegram/app?${new URLSearchParams({ c: cat, q: search })}`, { headers: { "x-telegram-init-data": app.initData }, signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error);
        setData({ ...j.data, key });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setFailedKey(key);
      });
    return () => ctl.abort();
  }, [app, cat, search, key]);

  // categoria deschisa din bot: chip-ul ei vizibil in banda de categorii
  const firstList = !!data;
  useEffect(() => {
    if (firstList) activeChip.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [firstList]);

  const choose = (id) => {
    if (id === cat) return;
    app?.HapticFeedback.selectionChanged();
    setCat(id);
    window.scrollTo({ top: 0 });
  };

  const pick = async (p) => {
    if (picking) return;
    setPicking(p.id);
    setPickError(false);
    try {
      const r = await fetch("/api/telegram/app", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-init-data": app.initData },
        body: JSON.stringify({ product: p.id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      app.close();
    } catch {
      setPicking(null);
      setPickError(true);
    }
  };

  const chips = [{ id: "", name: t.all }, ...(data?.categories || [])];
  const products = data?.products || [];

  return (
    <div className="min-h-dvh bg-bg pb-[calc(16px+env(safe-area-inset-bottom))] text-fg">
      <Script src="https://telegram.org/js/telegram-web-app.js" onReady={init} onError={() => setOutside(true)} />

      {outside ? (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center text-fg-3">
          <TelegramLogo size={40} />
          <p className="text-[15px]">{t.outside}</p>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 bg-bg pt-3">
            <div className="px-3">
              <label className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-fg-3">
                <MagnifyingGlass size={18} className="shrink-0" />
                <input
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  placeholder={t.search}
                  aria-label={t.search}
                  className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label={t.clear} className="-mr-1 grid size-8 place-items-center">
                    <X size={16} />
                  </button>
                )}
              </label>
            </div>
            <div className="flex gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((c) => (
                <button
                  key={c.id || "all"}
                  ref={c.id === cat ? activeChip : undefined}
                  type="button"
                  onClick={() => choose(c.id)}
                  aria-pressed={c.id === cat}
                  className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium ${
                    c.id === cat ? "bg-accent text-accent-fg" : "bg-surface text-fg"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {pickError && <p className="mx-3 mb-2 rounded-xl bg-bad-soft px-3 py-2 text-[14px] text-bad">{t.pickFailed}</p>}

          {failedKey === key ? (
            <div className="flex flex-col items-center gap-3 px-6 pt-16 text-center">
              <p className="text-[15px] text-fg-3">{t.failed}</p>
              <button type="button" onClick={() => setReload((n) => n + 1)} className="h-10 rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-fg">
                {t.retry}
              </button>
            </div>
          ) : !data ? (
            <ul className="mx-3 overflow-hidden rounded-2xl bg-surface" aria-busy="true">
              {Array.from({ length: 7 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="skeleton size-14 shrink-0 rounded-xl" />
                  <span className="flex-1 space-y-2">
                    <span className="skeleton block h-3.5 w-4/5" />
                    <span className="skeleton block h-3 w-2/5" />
                  </span>
                </li>
              ))}
            </ul>
          ) : !products.length && !loading ? (
            <div className="flex flex-col items-center gap-3 px-6 pt-16 text-center">
              <Package size={36} className="text-fg-3" />
              <p className="text-[15px] text-fg-3">{t.empty}</p>
              {cat && search && (
                <button type="button" onClick={() => choose("")} className="h-10 rounded-xl bg-surface px-5 text-[15px] font-medium text-accent">
                  {t.searchAll}
                </button>
              )}
            </div>
          ) : (
            <ul className={`mx-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2 ${picking && picking !== p.id ? "opacity-50" : ""}`}
                  >
                    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-fg-3">
                      {p.thumb ? (
                        // miniatura e deja un JPEG mic (160 px) generat de /api/public/product-thumb
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <Package size={22} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15px] font-medium leading-snug">{p.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                        <span className="font-semibold">{p.price}</span>
                        <span className={p.inStock ? "text-ok" : "text-fg-3"}>{p.inStock ? t.inStock : t.outOfStock}</span>
                      </span>
                    </span>
                    {picking === p.id ? <CircleNotch size={18} className="shrink-0 animate-spin text-fg-3" /> : <CaretRight size={16} className="shrink-0 text-fg-3" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
