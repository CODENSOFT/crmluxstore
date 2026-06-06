// Reseteaza contul de admin la valorile de baza: admin@crm.local / admin123
// Rulare:  node --env-file=.env.local scripts/reset-admin.mjs
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error("Lipseste MONGODB_URI (ruleaza cu --env-file=.env.local)");
  process.exit(1);
}

const EMAIL = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local")
  .toLowerCase()
  .trim();
const NAME = process.env.SEED_ADMIN_NAME || "Administrator";
const PASS = process.env.SEED_ADMIN_PASSWORD || "admin123";

await mongoose.connect(URI);
const Users = mongoose.connection.collection("users");

const passwordHash = await bcrypt.hash(PASS, 10);

// Gaseste adminul: intai dupa emailul de baza, altfel cel mai vechi admin
let admin = await Users.findOne({ email: EMAIL });
if (!admin) admin = await Users.findOne({ role: "admin" }, { sort: { createdAt: 1 } });

if (!admin) {
  await Users.insertOne({
    name: NAME,
    email: EMAIL,
    passwordHash,
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`Cont admin creat: ${EMAIL} / ${PASS}`);
} else {
  await Users.updateOne(
    { _id: admin._id },
    {
      $set: {
        name: NAME,
        email: EMAIL,
        passwordHash,
        role: "admin",
        active: true,
        updatedAt: new Date(),
      },
    }
  );
  console.log(`Cont admin resetat: ${EMAIL} / ${PASS}`);
}

await mongoose.disconnect();
console.log("GATA");
