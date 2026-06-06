import mongoose from "mongoose";

// Cache global pentru a evita conexiuni multiple in hot-reload (dev) si serverless.
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  // Verificam la momentul conexiunii (nu la build), ca sa nu pice build-ul pe Vercel
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "Lipseste variabila MONGODB_URI. Seteaz-o in .env.local (local) sau in variabilele de mediu Vercel."
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  // Seed lenes (admin + setari) la prima conexiune reusita
  const { ensureSeed } = await import("./seed.js");
  await ensureSeed().catch(() => {});

  return cached.conn;
}

export default connectDB;
