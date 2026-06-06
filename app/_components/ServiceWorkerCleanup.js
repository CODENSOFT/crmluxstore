"use client";

import { useEffect } from "react";

// Dezinregistreaza orice Service Worker vechi (ex: ramas de la o aplicatie CRA
// care a rulat anterior pe acelasi port) si goleste cache-urile browserului.
// Rezolva afisajul "stricat" cauzat de fisiere vechi servite de un SW invechit.
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then(async (regs) => {
        if (!regs || regs.length === 0) return;

        // Exista un Service Worker vechi — il eliminam
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));

        // Golim cache-urile (CacheStorage)
        if (window.caches) {
          const keys = await caches.keys().catch(() => []);
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
        }

        // Reincarcam o singura data pentru a prelua fisierele corecte
        if (!sessionStorage.getItem("sw-cleaned")) {
          sessionStorage.setItem("sw-cleaned", "1");
          window.location.reload();
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
