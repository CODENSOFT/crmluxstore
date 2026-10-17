import User from "@/models/User";
import Settings from "@/models/Settings";
import Category from "@/models/Category";
import Warehouse from "@/models/Warehouse";
import { hashPassword } from "./auth";
import { DEFAULT_CATEGORIES } from "./constants";

let seeded = false;

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Prima pornire: cont admin, setari, categoriile magazinului si un depozit implicit.
export async function ensureSeed() {
  if (seeded) return;
  seeded = true;

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local").toLowerCase().trim();
  if (!(await User.exists({ role: "admin" }))) {
    await User.create({
      name: process.env.SEED_ADMIN_NAME || "Administrator",
      email: adminEmail,
      passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD || "admin123"),
      role: "admin",
    });
    console.log(`[seed] Cont admin creat: ${adminEmail}`);
  }

  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});

  if (!(await Category.exists({}))) {
    await Category.insertMany(DEFAULT_CATEGORIES.map((name, i) => ({ name, slug: slug(name), sort: i })));
  }

  if (!(await Warehouse.exists({}))) {
    const w = await Warehouse.create({ name: "Depozit principal", code: "DEP-1", type: "warehouse", isDefault: true });
    settings.defaultWarehouse = w._id;
    await settings.save();
  } else if (!settings.defaultWarehouse) {
    const w = await Warehouse.findOne().sort({ isDefault: -1, createdAt: 1 });
    if (w) {
      settings.defaultWarehouse = w._id;
      await settings.save();
    }
  }
}
