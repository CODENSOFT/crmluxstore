import connectDB from "@/lib/mongodb";
import Settings from "@/models/Settings";
import { ok, requireAdmin } from "@/lib/api";

// Returneaza datele de integrare Make (doar admin): cheia API + webhook configurat
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const settings = await Settings.findOne();

  // URL public pentru linkurile Make: setarea adminului, altfel domeniul de
  // productie Vercel, altfel gol (pagina cade pe window.location.origin).
  let baseUrl = settings?.publicUrl || "";
  if (!baseUrl && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return ok({
    apiKey: process.env.MAKE_API_KEY || "",
    webhookUrl: settings?.makeWebhookUrl || process.env.MAKE_WEBHOOK_URL || "",
    baseUrl,
  });
}
