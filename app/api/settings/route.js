import connectDB from "@/lib/mongodb";
import Settings from "@/models/Settings";
import { ok, requireUser, requireAdmin } from "@/lib/api";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  // Expunem si cheia API si endpoint-urile pentru pagina de integrare
  return ok({
    ...settings.toObject(),
    apiKeyConfigured: !!process.env.MAKE_API_KEY,
  });
}

export async function PUT(req) {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const body = await req.json();
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});

  for (const f of [
    "companyName",
    "currency",
    "makeWebhookUrl",
    "publicUrl",
    "lowStockThreshold",
  ]) {
    if (body[f] !== undefined) settings[f] = body[f];
  }
  await settings.save();
  return ok(settings);
}
