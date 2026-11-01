import TelegramCatalog from "./catalog";

export const metadata = { title: { absolute: "Catalog" } };

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

// Mini App-ul botului Telegram: lista de produse cu poze, deschisa din butoanele de categorie ale botului
// (?c= categoria, ?q= cautarea, ?l= limba). Fara cont CRM — vezi /api/telegram/app.
export default async function TelegramCatalogPage({ searchParams }) {
  const sp = await searchParams;
  return <TelegramCatalog category={one(sp.c)} query={one(sp.q).slice(0, 80)} lang={one(sp.l) === "ru" ? "ru" : "ro"} />;
}
