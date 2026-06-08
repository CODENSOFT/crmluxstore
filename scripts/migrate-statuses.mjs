// Migrare statusuri vechi de comenzi la noul pipeline de stadii.
// Rulare: node --env-file=.env.local scripts/migrate-statuses.mjs
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGODB_URI);
const orders = mongoose.connection.collection("orders");
const MAP = { pending: "pending_approval", approved: "processing" };
let total = 0;
for (const [oldS, newS] of Object.entries(MAP)) {
  const r = await orders.updateMany({ status: oldS }, { $set: { status: newS } });
  if (r.modifiedCount) console.log(`  ${oldS} -> ${newS}: ${r.modifiedCount} comenzi`);
  total += r.modifiedCount;
}
// orice status invalid ramas -> pus pe "new" ca sa nu blocheze
const valid = ["new","pending_approval","processing","ready","invoicing","completed","rejected"];
const r2 = await orders.updateMany({ status: { $nin: valid } }, { $set: { status: "new" } });
if (r2.modifiedCount) console.log(`  status invalid -> new: ${r2.modifiedCount}`);
console.log("total migrate:", total + r2.modifiedCount);
await mongoose.disconnect();
