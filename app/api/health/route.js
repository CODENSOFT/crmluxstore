import { db } from "@/lib/db";
import { route } from "@/lib/api";

// Diagnosticarea vitezei: regiunea serverului si cat dureaza un drum pana la baza de date.
// Nu intoarce date sau secrete — doar timpi in milisecunde.
export const GET = route(
  async () => {
    const sql = db();
    const pings = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      await sql`select 1`;
      pings.push(Math.round((performance.now() - t) * 10) / 10);
    }
    return { region: process.env.VERCEL_REGION || "local", dbPingMs: pings };
  },
  { auth: false }
);
