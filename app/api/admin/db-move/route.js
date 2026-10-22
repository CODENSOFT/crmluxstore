import { route } from "@/lib/api";
import { moveStatus, copyDatabase } from "@/lib/dbMove";

// Mutarea bazei de date pe serverul nou (doar administratorul principal)
export const maxDuration = 300;

export const GET = route(async () => moveStatus(), { auth: "owner" });

export const POST = route(async () => copyDatabase(), { auth: "owner" });
