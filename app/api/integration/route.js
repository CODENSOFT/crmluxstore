import connectDB from "@/lib/mongodb";
import Settings from "@/models/Settings";
import { ok, requireAdmin } from "@/lib/api";

// Returneaza datele de integrare Make (doar admin): cheia API + webhook configurat
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const settings = await Settings.findOne();
  return ok({
    apiKey: process.env.MAKE_API_KEY || "",
    webhookUrl: settings?.makeWebhookUrl || process.env.MAKE_WEBHOOK_URL || "",
  });
}
