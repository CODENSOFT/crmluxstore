"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Starea filtrelor in URL (linkuri care pot fi trimise colegilor, butonul Inapoi functioneaza)
export function useQueryState(defaults = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = sp.toString();
  const state = useMemo(() => {
    const o = { ...defaults };
    for (const [k, v] of new URLSearchParams(key)) o[k] = v;
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (patch, { resetPage = true } = {}) => {
      const next = new URLSearchParams(key);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !("page" in patch)) next.delete("page");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pathname, router]
  );
  return [state, set];
}
