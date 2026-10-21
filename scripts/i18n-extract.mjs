// Extrage textele romanesti din interfata (JSX, atribute, etichete, mesaje de eroare din API)
// si arata care lipsesc din dictionarul rus (lib/i18n/ru.js).
// Rulare:  node scripts/i18n-extract.mjs            -> lista textelor fara traducere
//          node scripts/i18n-extract.mjs --all      -> toate textele gasite
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UI_DIRS = ["app/(app)", "app/_components", "app/login"];
const SERVER_DIRS = ["app/api", "lib"];
const SKIP = [/lib\/i18n\//, /lib\/telegram\/texts\.js$/, /lib\/schema\.js$/, /lib\/openapi\.js$/, /lib\/seed\.js$/];

const files = (dir) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f))
    : [];

// Text afisat oamenilor: are litere si macar un cuvant (nu cod, nu clase CSS, nu URL)
const looksHuman = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (/^[a-z0-9_.:/#-]+$/.test(t) && !/[ăâîșțĂÂÎȘȚ]/.test(t)) return false; // chei, slug-uri, clase
  if (/^(https?:|\/api\/|\/[a-z])/.test(t)) return false;
  if (/^[\w-]+(\s+[\w-:/[\]().%]+)+$/.test(t) && /(^|\s)(flex|grid|text-|bg-|px-|py-|mt-|h-|w-|rounded|border|items-|gap-)/.test(t)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE)\b/.test(t)) return false;
  if (process.argv.includes("--loose")) return /[a-zA-ZăâîșțĂÂÎȘȚ]{2,}/.test(t) && (/\s/.test(t) || /^[A-ZĂÂÎȘȚ]/.test(t)) && !/[{}<>=;]|=>|\(\)/.test(t);
  return /[ăâîșțĂÂÎȘȚ]|\b(și|de|la|în|cu|pe|nu|sau|din|pentru|este|sunt|comand|client|produs|stoc|pre[tț]|depozit|sarcin|utilizator|salv|șterge|anul|adaug|editeaz|total|plat|livrare|factur|recep|furnizor|raport|setăr|cont|parol|nume|telefon|adres|cantit|categor|marc|ambalaj|unitat|activ|nou|toate|toți|azi|luna|zile|ore|minute|ieri|mâine|da|ok)\w*/i.test(t) || /^[A-ZĂÂÎȘȚ][a-zăâîșț]+(\s+[a-zăâîșțA-ZĂÂÎȘȚ„”"'()…,.:!?-]+)*$/.test(t);
};

const UI_ATTRS = new Set(["label", "title", "description", "placeholder", "hint", "aria-label", "confirmLabel", "header", "text", "alt", "okText", "badText", "subtitle", "empty", "sub", "eyebrow", "message", "tooltip"]);
const UI_PROPS = new Set(["label", "title", "description", "text", "header", "hint", "placeholder", "message", "confirmLabel", "sub", "short", "help", "empty", "okText", "badText", "group", "error", "details", "meta"]);
const ERR_CALLS = new Set(["badRequest", "forbidden", "notFound", "fail", "HttpError", "toast", "Error", "TelegramError", "assert", "requirePerm", "plural"]);

const out = new Map(); // text -> Set(fisiere)
const add = (s, file) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (!looksHuman(t.replace(/\{\d+\}/g, ""))) return;
  if (!out.has(t)) out.set(t, new Set());
  out.get(t).add(file);
};
const tpl = (node) => node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : "")).join("");

function scan(file, { ui }) {
  if (SKIP.some((r) => r.test(file))) return;
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  let ast;
  try {
    ast = parse(code, { sourceType: "module", plugins: ["jsx"] });
  } catch (e) {
    console.error("Nu pot citi", file, e.message);
    return;
  }
  traverse(ast, {
    JSXText(p) {
      if (ui) add(p.node.value, file);
    },
    JSXAttribute(p) {
      if (!ui) return;
      const name = p.node.name.name;
      const v = p.node.value;
      if (!UI_ATTRS.has(name) || !v) return;
      if (v.type === "StringLiteral") add(v.value, file);
      if (v.type === "JSXExpressionContainer") {
        if (v.expression.type === "StringLiteral") add(v.expression.value, file);
        if (v.expression.type === "TemplateLiteral") add(tpl(v.expression), file);
      }
    },
    ObjectProperty(p) {
      const key = p.node.key.name || p.node.key.value;
      const v = p.node.value;
      if (!UI_PROPS.has(key) && !(ui && (v.type === "StringLiteral" || v.type === "TemplateLiteral"))) return;
      if (v.type === "StringLiteral") add(v.value, file);
      if (v.type === "TemplateLiteral") add(tpl(v), file);
    },
    CallExpression(p) {
      const callee = p.node.callee.name || p.node.callee.property?.name;
      if (!ERR_CALLS.has(callee) && !(ui && ["confirm", "toast"].includes(callee))) return;
      for (const a of p.node.arguments) {
        if (a.type === "StringLiteral") add(a.value, file);
        if (a.type === "TemplateLiteral") add(tpl(a), file);
      }
    },
    NewExpression(p) {
      if (!ERR_CALLS.has(p.node.callee.name)) return;
      for (const a of p.node.arguments) {
        if (a.type === "StringLiteral") add(a.value, file);
        if (a.type === "TemplateLiteral") add(tpl(a), file);
      }
    },
    // texte in JSX de forma {"..."} / {`...`} / cond ? "a" : "b" / liste / valori implicite
    StringLiteral(p) {
      if (!ui) return;
      const par = p.parentPath;
      if (par.isJSXExpressionContainer() || par.isConditionalExpression() || par.isLogicalExpression() || par.isArrayExpression() || par.isAssignmentPattern() || par.isVariableDeclarator() || par.isReturnStatement() || par.isBinaryExpression()) add(p.node.value, file);
    },
    TemplateLiteral(p) {
      if (!ui) return;
      const par = p.parentPath;
      if (par.isJSXExpressionContainer() || par.isConditionalExpression() || par.isLogicalExpression() || par.isArrayExpression() || par.isAssignmentPattern() || par.isVariableDeclarator() || par.isReturnStatement() || par.isCallExpression()) add(tpl(p.node), file);
    },
  });
}

for (const d of UI_DIRS) for (const f of files(d)) scan(f, { ui: true });
for (const d of SERVER_DIRS) for (const f of files(d)) scan(f, { ui: f.startsWith("lib/constants") || f.startsWith("lib/audit") || f.startsWith("lib/orderStages") || f.startsWith("lib/permissions") || f.startsWith("lib/format") || f.startsWith("lib/time") });

let have = {};
try {
  have = (await import(path.join(ROOT, "lib/i18n/ru.js"))).RU || {};
} catch {
  /* dictionarul nu exista inca */
}
const all = process.argv.includes("--all");
const list = [...out.keys()].filter((k) => all || !(k in have)).sort((a, b) => a.localeCompare(b, "ro"));
if (process.argv.includes("--json")) console.log(JSON.stringify(list, null, 1));
else {
  for (const k of list) console.log(k);
  console.error(`\n${list.length} texte${all ? "" : " fără traducere"} (din ${out.size} găsite)`);
}
