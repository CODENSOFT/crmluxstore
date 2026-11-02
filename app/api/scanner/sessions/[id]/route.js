import { route, readJson, badRequest, requirePerm } from "@/lib/api";
import { getScanSession, applyScanSession, rejectScanSession, linkScanCode, dropUnknownCodes, SCAN_PERMS } from "@/lib/scanner";

export const GET = route(async ({ params }) => getScanSession(params.id));

// { action: "apply" | "reject" | "link" | "drop-unknown", ... }
export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  const s = await getScanSession(params.id);
  switch (body.action) {
    case "apply":
      if (SCAN_PERMS[s.operation]) requirePerm(user, SCAN_PERMS[s.operation]);
      return applyScanSession(s._id, user, { warehouse: body.warehouse, toWarehouse: body.toWarehouse, options: body.options });
    case "reject":
      return rejectScanSession(s._id, user, body.reason);
    case "link":
      if (body.saveBarcode !== false) requirePerm(user, "products.manage");
      return linkScanCode(s._id, { code: body.code, productId: body.productId, saveBarcode: body.saveBarcode !== false, multiplier: body.multiplier }, user);
    case "drop-unknown":
      return dropUnknownCodes(s._id);
    default:
      throw badRequest("Acțiune invalidă");
  }
});
