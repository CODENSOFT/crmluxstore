// Intelegerea unei cautari scrise in bot: cuvinte + interval de pret, in romana si rusa.
//   „parfum auto 50-100 lei”  -> { words: ["parfum", "auto"], min: 50, max: 100 }
//   „spuma pana la 300”       -> { words: ["spuma"], max: 300 }
//   „от 200 до 500”           -> { words: [], min: 200, max: 500 }

// fara diacritice si cu litere mici — „spumă” si „spuma” se gasesc la fel (aceeasi regula si in SQL)
export const DIACRITICS_FROM = "ăâîșşțţ";
export const DIACRITICS_TO = "aaissttt";
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, (c) => DIACRITICS_TO[DIACRITICS_FROM.indexOf(c)]);

const NUM = "(\\d+(?:[.,]\\d+)?)";
const CUR = "(?:\\s*(?:lei|leu|mdl|md|л|лей|леев|лея)\\.?)?";
const toNum = (s) => Number(String(s).replace(",", "."));

// cuvinte care nu descriu produsul (moneda, legaturi din formularea intervalului)
const STOP = new Set([
  "lei", "leu", "mdl", "md", "pret", "pretul", "preturi", "intre", "si", "de", "la", "pana", "sub", "peste", "max", "min", "maxim", "minim",
  "лей", "леев", "лея", "цена", "по", "от", "до", "и", "между", "не", "дороже", "дешевле",
]);

export function parseSearch(text) {
  let t = ` ${norm(text).replace(/[–—]/g, "-")} `;
  let min = null;
  let max = null;
  let m;
  // interval: „50-100”, „50 .. 100”, „de la 50 la 100”, „intre 50 si 100”, „от 50 до 100”
  if ((m = t.match(new RegExp(`(?:de la|intre|от|между)?\\s*${NUM}${CUR}\\s*(?:-|\\.\\.|la|si|до|и)\\s*${NUM}${CUR}(?=\\s|$)`)))) {
    min = toNum(m[1]);
    max = toNum(m[2]);
    t = t.replace(m[0], " ");
  } else {
    // doar limita de sus: „pana la 100”, „sub 100”, „max 100”, „<100”, „до 100”, „не дороже 100”
    if ((m = t.match(new RegExp(`(?:pana la|sub|max(?:im)?|<=?|до|не дороже|дешевле)\\s*${NUM}${CUR}(?=\\s|$)`)))) {
      max = toNum(m[1]);
      t = t.replace(m[0], " ");
    }
    // doar limita de jos: „de la 50”, „peste 50”, „min 50”, „>50”, „от 50”, „дороже 50”
    if ((m = t.match(new RegExp(`(?:de la|peste|min(?:im)?|>=?|от|дороже)\\s*${NUM}${CUR}(?=\\s|$)`)))) {
      min = toNum(m[1]);
      t = t.replace(m[0], " ");
    }
    // „100 lei” singur = pana la 100
    if (min === null && max === null && (m = t.match(new RegExp(`${NUM}\\s*(?:lei|leu|mdl|лей|леев|лея)\\.?(?=\\s|$)`)))) {
      max = toNum(m[1]);
      t = t.replace(m[0], " ");
    }
  }
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const words = t
    .split(/[\s,;.!?]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .slice(0, 6);
  return { words, min, max };
}

/** Intervalul ca text scurt: „50–100 MDL”, „pana la 100 MDL”, „de la 50 MDL” */
export function rangeLabel({ min, max }, lang, money) {
  if (min !== null && max !== null) return `${money(min).replace(/ MDL$/, "")}–${money(max)}`;
  if (max !== null) return `${lang === "ru" ? "до" : "până la"} ${money(max)}`;
  if (min !== null) return `${lang === "ru" ? "от" : "de la"} ${money(min)}`;
  return "";
}
