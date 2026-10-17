import ApiKey from "@/models/ApiKey";
import Webhook from "@/models/Webhook";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Customer from "@/models/Customer";
import IntegrationLog from "@/models/IntegrationLog";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { publicBaseUrl } from "@/lib/publicUrl";
import { wooConfigured } from "@/lib/woo";

// Rezumat pentru pagina Integrari
export const GET = route(
  async ({ req }) => {
    const s = await getSettings({ fresh: true });
    const [keys, hooks, siteOrders, wooProducts, notExported, last1c, mapping] = await Promise.all([
      ApiKey.find({ active: true }).select("name kind lastUsedAt").lean(),
      Webhook.countDocuments({ active: true }),
      Order.countDocuments({ externalSource: "woo" }),
      Product.countDocuments({ wooId: { $ne: null } }),
      Order.countDocuments({ status: { $in: ["processing", "ready", "invoicing", "completed"] }, "export1c.exportedAt": null }),
      IntegrationLog.findOne({ source: "1c" }).sort({ createdAt: -1 }).lean(),
      Promise.all([
        Product.countDocuments({ externalId: { $nin: [null, ""] } }),
        Product.countDocuments({}),
        Customer.countDocuments({ externalId: { $nin: [null, ""] } }),
        Customer.countDocuments({}),
      ]),
    ]);
    const key1c = keys.filter((k) => k.kind === "1c");
    return {
      baseUrl: publicBaseUrl(s, req),
      woo: {
        configured: wooConfigured(s),
        enabled: !!s.woo?.enabled,
        siteOrders,
        linkedProducts: wooProducts,
        lastOrderSyncAt: s.woo?.lastOrderSyncAt || null,
      },
      api: { activeKeys: keys.length, webhooks: hooks },
      onec: {
        keys: key1c.length,
        lastUsedAt: key1c.reduce((m, k) => (k.lastUsedAt && (!m || k.lastUsedAt > m) ? k.lastUsedAt : m), null),
        lastLog: last1c,
        notExported,
        productsMapped: mapping[0],
        productsTotal: mapping[1],
        customersMapped: mapping[2],
        customersTotal: mapping[3],
      },
    };
  },
  { auth: "admin" }
);
