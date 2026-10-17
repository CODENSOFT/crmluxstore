import Counter from "@/models/Counter";

const PREFIX = {
  order: "CMD",
  customer: "CL",
  arrival: "REC",
  transfer: "TRF",
  writeoff: "ANL",
  inventory: "INV",
};

const PAD = { customer: 5 };

const MODEL = {
  order: () => import("@/models/Order"),
  customer: () => import("@/models/Customer"),
  arrival: () => import("@/models/StockArrival"),
  transfer: () => import("@/models/Transfer"),
  writeoff: () => import("@/models/WriteOff"),
  inventory: () => import("@/models/InventoryCount"),
};

const ready = new Set();

// La prima folosire, contorul porneste de la cel mai mare numar existent in baza,
// ca sa nu se dubleze numerele documentelor create inainte de contoare.
async function ensureCounter(key) {
  if (ready.has(key)) return;
  const exists = await Counter.exists({ _id: key });
  if (!exists) {
    const { default: Model } = await MODEL[key]();
    const prefix = PREFIX[key];
    const docs = await Model.find({ number: { $regex: `^${prefix}-\\d+$` } })
      .select("number")
      .lean();
    let max = 0;
    for (const d of docs) {
      const n = parseInt(String(d.number).split("-").pop(), 10);
      if (n > max) max = n;
    }
    await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: max } }, { upsert: true });
  }
  ready.add(key);
}

export async function nextNumber(key) {
  await ensureCounter(key);
  const c = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return `${PREFIX[key]}-${String(c.seq).padStart(PAD[key] || 6, "0")}`;
}
