import { route, readJson, pagination, requirePerm } from "@/lib/api";
import { createScanSession, listScanSessions, applyScanSession, getScanSession, SCAN_PERMS } from "@/lib/scanner";

export const GET = route(async ({ query }) => {
  const { limit, skip, page } = pagination(query, { defLimit: 30 });
  const r = await listScanSessions({
    status: query.get("status") || undefined,
    operation: query.get("operation") || undefined,
    source: query.get("source") || undefined,
    limit,
    skip,
  });
  return { ...r, page, limit };
});

// Sesiune creata din CRM (pagina Scanare sau fisier exportat de scaner)
export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  if (body.apply && SCAN_PERMS[body.operation]) requirePerm(user, SCAN_PERMS[body.operation]);
  const { session } = await createScanSession({ ...body, apply: false }, {
    source: body.source === "file" ? "file" : "crm",
    sourceName: body.source === "file" ? `Fișier: ${user.name}` : user.name,
    user,
  });
  if (!body.apply || session.unknownCount > 0 || session.operation === "list") return session;
  // aplicarea separat: daca esueaza (ex: stoc insuficient), sesiunea ramane salvata pentru corectare
  try {
    return await applyScanSession(session._id, user);
  } catch (e) {
    return { ...(await getScanSession(session._id)), applyError: e.message };
  }
});
