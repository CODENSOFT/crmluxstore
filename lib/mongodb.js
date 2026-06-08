import mongoose from "mongoose";
// Inregistreaza toate modelele la incarcarea modulului (necesar pentru populate
// pe instante serverless reci — altfel MissingSchemaError la modele referite).
import "@/models/_register";

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

  // Reutilizam conexiunea DOAR daca e vie (readyState 1 = conectat).
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  // Conexiune moarta/inchisa -> o resetam ca sa reconectam.
  if (mongoose.connection.readyState === 0) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        // bufferCommands implicit (true): daca conexiunea blipuie, comenzile
        // asteapta reconectarea in loc sa cada cu eroare -> mai robust serverless.
        // Pool mic per instanta (Atlas free M0) ca sa nu depasim limita de conexiuni.
        maxPoolSize: 5,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      })
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
