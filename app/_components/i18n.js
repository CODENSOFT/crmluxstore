"use client";

// Interfata in limba utilizatorului. Textele sunt scrise in romana (limba de baza);
// pentru rusa, fiecare text afisat se inlocuieste din dictionarul lib/i18n/ru.js —
// inclusiv ferestrele, notificarile si mesajele de eroare venite de la server.
import { useLayoutEffect, useSyncExternalStore } from "react";
import { createTranslator } from "@/lib/i18n/runtime";

// Dictionarul rus (~150 KB) se descarca doar pentru utilizatorii cu limba rusa, nu la toti.
let ruTranslator = null;
let ruLoading = null;
const ruSubs = new Set();
function loadRu() {
  if (ruTranslator || ruLoading) return;
  ruLoading = import("@/lib/i18n/ru")
    .then((m) => {
      ruTranslator = createTranslator(m.RU);
      for (const cb of ruSubs) cb();
    })
    .catch(() => {
      ruLoading = null; // se reincearca la urmatoarea afisare
    });
}
const subscribeRu = (cb) => {
  ruSubs.add(cb);
  return () => ruSubs.delete(cb);
};
const translatorFor = (lang) => (lang === "ru" ? ruTranslator : null);

/** Traducere punctuala in cod (ex: texte din confirm/alert). */
export function tr(lang, text) {
  const t = translatorFor(lang);
  return (t && t(text)) || text;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-label"];
// Elemente netraduse; in plus, textul din <textarea> (valoarea scrisa de utilizator) nu se atinge
const SKIP = "[data-no-translate],script,style,code,pre,[contenteditable=true]";
const SKIP_TEXT = `${SKIP},textarea`;

function install(lang) {
  const translate = translatorFor(lang);
  if (!translate || typeof document === "undefined") return () => {}; // romana: nimic de tradus, nimic de oprit
  const skipped = (el) => !el || !!el.closest?.(SKIP);
  const skippedText = (el) => !el || !!el.closest?.(SKIP_TEXT);
  const doText = (n) => {
    const v = n.nodeValue;
    const t = translate(v);
    if (t !== null && t !== v) n.nodeValue = t;
  };
  const doEl = (el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (!v) continue;
      const t = translate(v);
      if (t !== null && t !== v) el.setAttribute(a, t);
    }
  };
  const walk = (root) => {
    if (root.nodeType === 3) {
      if (!skippedText(root.parentElement)) doText(root);
      return;
    }
    if (root.nodeType !== 1 || skipped(root)) return;
    doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        if (n.parentElement?.tagName !== "TEXTAREA") doText(n);
      } else doEl(n);
    }
  };
  walk(document.body);
  const t = translate(document.title);
  if (t) document.title = t;
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") {
        if (!skippedText(m.target.parentElement)) doText(m.target);
      } else if (m.type === "attributes") {
        if (!skipped(m.target)) doEl(m.target);
      } else for (const n of m.addedNodes) walk(n);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => obs.disconnect();
}

/**
 * Pentru rusa, continutul se afiseaza doar in browser (fara randare pe server), iar traducerea
 * se aplica inainte de afisare — fara clipire si fara nepotriviri de hidratare.
 */
// abonare „fara evenimente” pentru useSyncExternalStore (valoarea difera doar intre server si browser)
const noop = () => () => {};
export function LanguageProvider({ lang, children }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const ruReady = useSyncExternalStore(subscribeRu, () => !!ruTranslator, () => false);
  useLayoutEffect(() => {
    if (lang === "ru") loadRu();
  }, [lang]);
  useLayoutEffect(() => {
    document.documentElement.lang = lang === "ru" ? "ru" : "ro";
    return install(lang);
  }, [lang, ruReady]);
  // rusa: se afiseaza dupa ce dictionarul e incarcat (fara clipire romana -> rusa)
  if (lang === "ru" && (!isClient || !ruReady)) return null;
  return children;
}
