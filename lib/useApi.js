"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./client";

// Cache in memorie (stale-while-revalidate): navigarea intre pagini e instantanee,
// datele se reimprospateaza in fundal.
const cache = new Map(); // url -> { data, at }
const subs = new Map(); // url -> Set(cb)
let version = 0;
const versionSubs = new Set();
// aceeasi adresa ceruta simultan din mai multe locuri (ex: meniul + pagina) -> o singura cerere
const inflight = new Map();
function fetchShared(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = api(url).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

function notify(url) {
  for (const cb of subs.get(url) || []) cb();
}

// Invalideaza toate cheile care incep cu prefixul dat (ex: "/api/orders")
export function invalidate(...prefixes) {
  for (const key of [...cache.keys()]) {
    if (prefixes.some((p) => key.startsWith(p))) {
      cache.delete(key);
    }
  }
  version++;
  for (const cb of versionSubs) cb();
}

function useVersion() {
  return useSyncExternalStore(
    (cb) => {
      versionSubs.add(cb);
      return () => versionSubs.delete(cb);
    },
    () => version,
    () => 0
  );
}

/**
 * const { data, error, loading, reload, mutate } = useApi("/api/orders?status=new")
 * url null -> nu se incarca nimic
 */
export function useApi(url, { keepPrevious = true, refreshInterval } = {}) {
  const v = useVersion();
  const [state, setState] = useState(() => {
    const c = url ? cache.get(url) : null;
    return { data: c?.data, error: null, loading: !!url && !c };
  });
  const lastUrl = useRef(url);
  const prevVersion = useRef(v);
  const reqId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!url) return;
      const id = ++reqId.current;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetchShared(url);
        cache.set(url, { data, at: Date.now() });
        if (id === reqId.current) setState({ data, error: null, loading: false });
        notify(url);
      } catch (error) {
        if (id === reqId.current) setState((s) => ({ ...s, error, loading: false }));
      }
    },
    [url]
  );

  useEffect(() => {
    if (!url) return;
    const c = cache.get(url);
    const versionChanged = prevVersion.current !== v;
    prevVersion.current = v;
    // invalidare care nu priveste acest URL -> nimic de facut
    if (versionChanged && c && lastUrl.current === url) return;
    if (lastUrl.current !== url) {
      lastUrl.current = url;
      setState((s) => ({ data: c?.data ?? (keepPrevious ? s.data : undefined), error: null, loading: !c }));
    }
    load(!!c);
  }, [url, v, load, keepPrevious]);

  useEffect(() => {
    if (!url) return;
    const cb = () => {
      const c = cache.get(url);
      if (c) setState((s) => (s.data === c.data ? s : { ...s, data: c.data }));
    };
    if (!subs.has(url)) subs.set(url, new Set());
    subs.get(url).add(cb);
    return () => subs.get(url)?.delete(cb);
  }, [url]);

  useEffect(() => {
    if (!refreshInterval || !url) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, refreshInterval);
    return () => clearInterval(t);
  }, [refreshInterval, url, load]);

  const mutate = useCallback(
    (updater) => {
      setState((s) => {
        const data = typeof updater === "function" ? updater(s.data) : updater;
        if (url) cache.set(url, { data, at: Date.now() });
        return { ...s, data };
      });
    },
    [url]
  );

  return { ...state, reload: () => load(false), refresh: () => load(true), mutate };
}

// Construieste un query string ignorand valorile goale
export function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
