import { route } from "@/lib/api";
import { lookupCode } from "@/lib/scanner";

// Cautare dupa cod scanat (pagina Scanare / verificare pret si stoc)
export const GET = route(async ({ query }) => lookupCode(query.get("code"), { warehouse: query.get("warehouse") || undefined }));
