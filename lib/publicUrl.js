// URL-ul public al CRM-ului (pentru linkuri catre API / webhook-uri)
export function publicBaseUrl(settings, req) {
  if (settings?.publicUrl) return settings.publicUrl.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (req) {
    const u = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") || u.host;
    const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return "";
}
