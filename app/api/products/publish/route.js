import { route, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { publicBaseUrl } from "@/lib/publicUrl";
import { publishProductsToWoo, unpublishedCount, wooConfigured } from "@/lib/woo";

export const maxDuration = 300;

// Starea publicarii: cate produse nu sunt pe site + daca site-ul e conectat
export const GET = route(async () => {
  const s = await getSettings();
  return { configured: wooConfigured(s), pending: await unpublishedCount(), siteUrl: s.woo?.url || "" };
}, { perm: "products.manage" });

// { ids?: [...] } — fara ids: toate produsele active care nu sunt inca pe site
export const POST = route(async ({ req }) => {
  const { ids } = await readJson(req);
  const s = await getSettings();
  return publishProductsToWoo({ ids, baseUrl: publicBaseUrl(s, req) });
}, { perm: "products.manage" });
