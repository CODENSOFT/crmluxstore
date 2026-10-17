import Customer from "@/models/Customer";
import { route, readJson, pagination, escapeRegex, normPhone } from "@/lib/api";
import { createCustomer, findCustomerMatch } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { customerDTO } from "@/lib/dto";
import { csvResponse } from "@/lib/csv";
import { segmentLabel } from "@/lib/constants";

// ?q=&segment=&type=&debt=1&sort=&page=&limit=   (?light=1 -> lista scurta pentru selectoare)
export const GET = route(async ({ query }) => {
  const filter = {};
  const q = query.get("q")?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    const pn = normPhone(q);
    filter.$or = [{ name: rx }, { contactPerson: rx }, { email: rx }, { idno: rx }, { number: rx }, { phone: rx }];
    if (pn && pn.length >= 4) filter.$or.push({ phoneNorm: { $regex: escapeRegex(pn) } });
  }
  if (query.get("segment")) filter.segment = query.get("segment");
  if (query.get("type")) filter.type = query.get("type");
  if (query.get("debt") === "1") filter["stats.balance"] = { $gt: 0 };
  if (query.get("active") !== "all") filter.active = { $ne: false };

  if (query.get("light") === "1") {
    return Customer.find(filter)
      .select("number name type phone email idno segment priceType discount city address paymentTermDays")
      .sort({ "stats.lastOrderAt": -1, name: 1 })
      .limit(Number(query.get("limit")) || 30)
      .lean();
  }

  const sorts = {
    name: { name: 1 },
    "-spent": { "stats.totalSpent": -1 },
    "-balance": { "stats.balance": -1 },
    "-last": { "stats.lastOrderAt": -1 },
    "-createdAt": { createdAt: -1 },
  };
  const sort = sorts[query.get("sort")] || { createdAt: -1 };

  if (query.get("format") === "csv") {
    const list = await Customer.find(filter).sort(sort).lean();
    return csvResponse(
      list.map((c) => ({
        Cod: c.number || "",
        Nume: c.name,
        Tip: c.type === "company" ? "Persoană juridică" : "Persoană fizică",
        Segment: segmentLabel(c.segment),
        Telefon: c.phone || "",
        Email: c.email || "",
        IDNO: c.idno || "",
        Oraș: c.city || "",
        Adresă: c.address || "",
        "Reducere %": c.discount || 0,
        Comenzi: c.stats?.ordersCount || 0,
        "Total cumpărături": c.stats?.totalSpent || 0,
        Datorie: c.stats?.balance || 0,
      })),
      `clienti_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const { page, limit, skip } = pagination(query, { defLimit: 50 });
  const [items, total, sums] = await Promise.all([
    Customer.find(filter).populate("manager", "name").sort(sort).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
    Customer.aggregate([
      { $match: filter },
      { $group: { _id: null, spent: { $sum: "$stats.totalSpent" }, debt: { $sum: "$stats.balance" }, b2b: { $sum: { $cond: [{ $eq: ["$type", "company"] }, 1, 0] } } } },
    ]),
  ]);
  return { items, total, page, limit, summary: sums[0] || { spent: 0, debt: 0, b2b: 0 } };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  if (!body.force) {
    const dup = await findCustomerMatch({ idno: body.idno, phone: body.phone, email: body.email });
    if (dup) {
      return Response.json(
        { ok: false, error: `Există deja clientul „${dup.name}” cu aceleași date de contact`, duplicate: { _id: dup._id, name: dup.name } },
        { status: 409 }
      );
    }
  }
  const created = await createCustomer({ ...body, manager: body.manager || user.id });
  await logAudit({ action: "customer_created", category: "customer", entity: created, entityName: created.name, user });
  emit("customer.created", () => customerDTO(created.toObject()));
  return created;
});
