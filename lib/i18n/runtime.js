// Traducere dupa dictionar: textul romanesc din interfata -> textul in limba aleasa.
// Cheile pot avea locuri variabile {0}, {1} (ex: "Comanda {0} a fost creată").
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (s) => s.replace(/\s+/g, " ");

export function createTranslator(dict) {
  const exact = new Map();
  const patterns = [];
  for (const [k, v] of Object.entries(dict || {})) {
    if (!v) continue;
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/(\{\d+\})/);
      const literal = parts.filter((p) => !/^\{\d+\}$/.test(p)).join("");
      if (!literal.trim()) continue;
      const re = new RegExp(`^${parts.map((p) => (/^\{\d+\}$/.test(p) ? "([\\s\\S]+?)" : escapeRe(squash(p)))).join("")}$`);
      const order = [...k.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
      patterns.push({ re, order, v, weight: literal.length });
    } else exact.set(squash(k.trim()), v);
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const cache = new Map();

  const core = (key) => {
    if (cache.has(key)) return cache.get(key);
    let res = exact.get(key) ?? null;
    if (res === null) {
      for (const p of patterns) {
        const m = p.re.exec(key);
        if (!m) continue;
        res = p.v.replace(/\{(\d+)\}/g, (_, i) => {
          const pos = p.order.indexOf(Number(i));
          const val = pos >= 0 ? m[pos + 1] : "";
          // valorile din interior pot fi si ele texte de interfata (ex: statusul, „3 comenzi noi”)
          return val.length < key.length ? core(squash(val.trim())) ?? val : val;
        });
        break;
      }
    }
    if (cache.size > 20000) cache.clear();
    cache.set(key, res);
    return res;
  };

  /** Intoarce traducerea (pastrand spatiile de la capete) sau null daca textul nu e in dictionar. */
  return function translate(text) {
    if (!text || !/\p{L}/u.test(text)) return null;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (!m[2]) return null;
    const res = core(squash(m[2]));
    return res === null ? null : m[1] + res + m[3];
  };
}

export const LANGS = [
  { key: "ro", label: "Română", short: "RO" },
  { key: "ru", label: "Русский", short: "RU" },
];
export const cleanLang = (l) => (l === "ru" ? "ru" : "ro");
