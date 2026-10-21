// Dictionarul rus al interfetei: cheia = textul romanesc exact, valoarea = traducerea.
// Textele noi din interfata se gasesc cu: node scripts/i18n-extract.mjs
import part1 from "./ru/part1.js";
import part2 from "./ru/part2.js";
import part3 from "./ru/part3.js";
import part4 from "./ru/part4.js";
import extra from "./ru/extra.js";

export const RU = { ...part1, ...part2, ...part3, ...part4, ...extra };
