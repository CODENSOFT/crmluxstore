import User from "@/models/User";
import Settings from "@/models/Settings";
import { hashPassword } from "./auth";

let seeded = false;

// Creeaza contul de admin si documentul de setari la prima pornire.
export async function ensureSeed() {
  if (seeded) return;
  seeded = true;

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local")
    .toLowerCase()
    .trim();

  const existing = await User.findOne({ role: "admin" });
  if (!existing) {
    await User.create({
      name: process.env.SEED_ADMIN_NAME || "Administrator",
      email: adminEmail,
      passwordHash: await hashPassword(
        process.env.SEED_ADMIN_PASSWORD || "admin123"
      ),
      role: "admin",
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] Cont admin creat: ${adminEmail}`);
  }

  const settings = await Settings.findOne();
  if (!settings) {
    await Settings.create({});
  }
}
